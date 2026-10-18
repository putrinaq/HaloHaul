import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

// Private object storage. Photos never touch local disk: browsers upload
// straight to R2 with a presigned PUT, and are served with short-lived
// presigned GETs.

export interface ObjectStore {
  presignPut(key: string, opts: { contentType: string; contentLength: number; expiresIn: number }): Promise<string>;
  presignGet(key: string, expiresIn: number): Promise<string>;
  head(key: string): Promise<{ size: number } | null>;
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}

function isNotFound(err: unknown): boolean {
  return (
    err instanceof NotFound ||
    (err instanceof S3ServiceException && (err.name === "NoSuchKey" || err.$metadata.httpStatusCode === 404))
  );
}

export class R2Store implements ObjectStore {
  private readonly client: S3Client;

  constructor(
    accountId: string,
    accessKeyId: string,
    secretAccessKey: string,
    private readonly bucket: string,
  ) {
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
  }

  presignPut(key: string, opts: { contentType: string; contentLength: number; expiresIn: number }) {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: opts.contentType,
      ContentLength: opts.contentLength,
    });
    return getSignedUrl(this.client, cmd, {
      expiresIn: opts.expiresIn,
      // Sign these so the browser can't upload a different type or size.
      signableHeaders: new Set(["content-type", "content-length"]),
    });
  }

  presignGet(key: string, expiresIn: number) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn });
  }

  async head(key: string) {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: res.ContentLength ?? 0 };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async get(key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return res.Body ? await res.Body.transformToByteArray() : null;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/** In-memory store for tests. */
export class MemoryStore implements ObjectStore {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();

  async presignPut(key: string) {
    return `memory://put/${key}`;
  }
  async presignGet(key: string, expiresIn: number) {
    return `memory://get/${key}?expires=${expiresIn}`;
  }
  async head(key: string) {
    const o = this.objects.get(key);
    return o ? { size: o.body.byteLength } : null;
  }
  async get(key: string) {
    return this.objects.get(key)?.body ?? null;
  }
  async put(key: string, body: Uint8Array, contentType: string) {
    this.objects.set(key, { body, contentType });
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

/**
 * Local development only (no R2 configured): objects live under `.uploads/`
 * and the "presigned" URLs point at /api/dev-store with an HMAC signature, so
 * the upload flow works end to end on a laptop. Never used in production.
 */
export class DevDiskStore implements ObjectStore {
  constructor(
    private readonly root: string,
    private readonly secret: string,
  ) {}

  private file(key: string) {
    if (!/^[A-Za-z0-9/_.-]{1,300}$/.test(key) || key.includes("..")) throw new Error("Invalid key");
    return path.join(this.root, key);
  }

  sign(parts: string[]): string {
    return createHmac("sha256", this.secret).update(parts.join("\n")).digest("base64url");
  }

  /** Checks a dev-store URL signature (timing-safe) and expiry. */
  verify(parts: string[], exp: number, sig: string): boolean {
    if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
    const want = Buffer.from(this.sign(parts));
    const got = Buffer.from(sig);
    return want.length === got.length && timingSafeEqual(want, got);
  }

  async presignPut(key: string, opts: { contentType: string; contentLength: number; expiresIn: number }) {
    const exp = Math.floor(Date.now() / 1000) + opts.expiresIn;
    const sig = this.sign(["put", key, opts.contentType, String(opts.contentLength), String(exp)]);
    const q = new URLSearchParams({ key, ct: opts.contentType, len: String(opts.contentLength), exp: String(exp), sig });
    return `/api/dev-store?${q}`;
  }

  async presignGet(key: string, expiresIn: number) {
    const exp = Math.floor(Date.now() / 1000) + expiresIn;
    const sig = this.sign(["get", key, String(exp)]);
    return `/api/dev-store?${new URLSearchParams({ key, exp: String(exp), sig })}`;
  }

  async head(key: string) {
    try {
      return { size: (await stat(this.file(key))).size };
    } catch {
      return null;
    }
  }

  async get(key: string) {
    try {
      return new Uint8Array(await readFile(this.file(key)));
    } catch {
      return null;
    }
  }

  async put(key: string, body: Uint8Array) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, body);
  }

  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }
}

let store: ObjectStore | null | undefined;

/**
 * The configured photo store: R2 when configured; in development without R2,
 * the local disk store; otherwise null (uploads switched off).
 */
export function getPhotoStore(): ObjectStore | null {
  if (store !== undefined) return store;
  const e = env();
  store =
    e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET
      ? new R2Store(e.R2_ACCOUNT_ID, e.R2_ACCESS_KEY_ID, e.R2_SECRET_ACCESS_KEY, e.R2_BUCKET)
      : e.NODE_ENV !== "production"
        ? new DevDiskStore(path.resolve(process.cwd(), ".uploads"), e.BETTER_AUTH_SECRET)
        : null;
  return store;
}
