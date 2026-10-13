import "server-only";
import { randomUUID } from "node:crypto";
import type { Sharp, SharpOptions } from "sharp";
import { escapeRe, UUID_RE } from "./photos";
import type { ObjectStore } from "./storage";

export { GET_EXPIRES_S, isOwnPhotoKey, ownPhotoUrl } from "./photos";

// Photo uploads:
//   1. presign: the browser gets a short-lived PUT URL for incoming/{user}/{uuid}
//      (type and size are signed into it)
//   2. the browser uploads straight to R2
//   3. finalize: the server checks the bytes really are an image, re-encodes
//      them with sharp (dropping EXIF/GPS), stores photos/{user}/{uuid}.webp and
//      deletes the original
// Configure an R2 lifecycle rule that expires incoming/ after 1 day.

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_INPUT_PIXELS = 40_000_000; // ~40 MP; refuses decompression bombs
const MAX_EDGE_PX = 2048;
const PUT_EXPIRES_S = 300;

type SharpFactory = (input: Uint8Array, options?: SharpOptions) => Sharp;
let sharpFactory: Promise<SharpFactory> | undefined;

/** Loaded on first use, so only the finalize route pays for the native library. */
function loadSharp(): Promise<SharpFactory> {
  sharpFactory ??= import("sharp").then(({ default: sharp }) => {
    sharp.cache(false);
    sharp.concurrency(1); // 1 vCPU, 1 GB RAM
    return sharp;
  });
  return sharpFactory;
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

function assertSafeUserId(userId: string) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(userId)) throw new UploadError("Invalid user", 403);
}

function isOwnIncomingKey(userId: string, key: string): boolean {
  return new RegExp(`^incoming/${escapeRe(userId)}/${UUID_RE}$`).test(key);
}

export async function createUploadUrl(
  store: ObjectStore,
  userId: string,
  file: { contentType: string; size: number },
): Promise<{ key: string; url: string; headers: Record<string, string> }> {
  assertSafeUserId(userId);
  if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(file.contentType)) {
    throw new UploadError("Upload a JPEG, PNG or WebP image.");
  }
  if (!Number.isInteger(file.size) || file.size <= 0) throw new UploadError("That file is empty.");
  if (file.size > UPLOAD_MAX_BYTES) throw new UploadError("Photos must be 10 MB or smaller.");

  const key = `incoming/${userId}/${randomUUID()}`;
  const url = await store.presignPut(key, {
    contentType: file.contentType,
    contentLength: file.size,
    expiresIn: PUT_EXPIRES_S,
  });
  return { key, url, headers: { "content-type": file.contentType } };
}

/** Decode, auto-rotate, shrink and re-encode. Output carries no EXIF/GPS. */
export async function processImage(bytes: Uint8Array): Promise<Buffer> {
  const sharp = await loadSharp();
  let format: string | undefined;
  try {
    format = (await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).format;
  } catch {
    throw new UploadError("That file isn't a readable image.");
  }
  if (format !== "jpeg" && format !== "png" && format !== "webp") {
    throw new UploadError("Upload a JPEG, PNG or WebP image.");
  }
  try {
    return await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .rotate() // apply EXIF orientation before the metadata is dropped
      .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new UploadError("That image couldn't be processed. Try a different photo.");
  }
}

export async function finalizeUpload(store: ObjectStore, userId: string, incomingKey: string): Promise<{ key: string }> {
  assertSafeUserId(userId);
  if (!isOwnIncomingKey(userId, incomingKey)) throw new UploadError("Unknown upload.", 403);

  const head = await store.head(incomingKey);
  if (!head) throw new UploadError("Upload not found. Try again.", 404);
  if (head.size > UPLOAD_MAX_BYTES) {
    await store.delete(incomingKey);
    throw new UploadError("Photos must be 10 MB or smaller.");
  }

  const bytes = await store.get(incomingKey);
  if (!bytes) throw new UploadError("Upload not found. Try again.", 404);

  try {
    const webp = await processImage(bytes);
    const key = `photos/${userId}/${randomUUID()}.webp`;
    await store.put(key, webp, "image/webp");
    return { key };
  } finally {
    await store.delete(incomingKey);
  }
}
