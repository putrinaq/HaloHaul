import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MemoryStore } from "./storage";
import { createUploadUrl, finalizeUpload, isOwnPhotoKey, ownPhotoUrl, processImage, thumbKey, UPLOAD_MAX_BYTES, UploadError } from "./uploads";

const ALICE = "aliceUserId0001";
const BOB = "bobUserId000002";

async function jpegWithExif() {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: "#c33" } })
    .jpeg()
    .withExif({ IFD0: { Copyright: "secret owner", ImageDescription: "taken at home" } })
    .toBuffer();
}

async function upload(store: MemoryStore, userId: string, bytes: Uint8Array, contentType = "image/jpeg") {
  const { key } = await createUploadUrl(store, userId, { contentType, size: bytes.byteLength });
  await store.put(key, bytes, contentType); // what the browser's presigned PUT does
  return key;
}

describe("createUploadUrl", () => {
  it("issues a presigned PUT under the user's incoming/ prefix", async () => {
    const res = await createUploadUrl(new MemoryStore(), ALICE, { contentType: "image/png", size: 1234 });
    expect(res.key).toMatch(new RegExp(`^incoming/${ALICE}/[0-9a-f-]{36}$`));
    expect(res.headers).toEqual({ "content-type": "image/png" });
  });

  it("rejects other types, empty files and oversize files", async () => {
    const store = new MemoryStore();
    await expect(createUploadUrl(store, ALICE, { contentType: "image/gif", size: 10 })).rejects.toThrow(UploadError);
    await expect(createUploadUrl(store, ALICE, { contentType: "application/pdf", size: 10 })).rejects.toThrow(/JPEG/);
    await expect(createUploadUrl(store, ALICE, { contentType: "image/jpeg", size: 0 })).rejects.toThrow(/empty/);
    await expect(createUploadUrl(store, ALICE, { contentType: "image/jpeg", size: UPLOAD_MAX_BYTES + 1 })).rejects.toThrow(
      /10 MB/,
    );
  });

  it("refuses odd user ids (keeps keys well-formed)", async () => {
    await expect(createUploadUrl(new MemoryStore(), "../etc", { contentType: "image/jpeg", size: 1 })).rejects.toThrow();
  });
});

describe("finalizeUpload", () => {
  it("re-encodes to WebP, strips EXIF, and removes the original", async () => {
    const store = new MemoryStore();
    const original = await jpegWithExif();
    expect((await sharp(original).metadata()).exif).toBeDefined();

    const incoming = await upload(store, ALICE, original);
    const { key } = await finalizeUpload(store, ALICE, incoming);

    expect(isOwnPhotoKey(ALICE, key)).toBe(true);
    expect(store.objects.has(incoming)).toBe(false);
    const stored = store.objects.get(key)!;
    expect(stored.contentType).toBe("image/webp");
    const meta = await sharp(stored.body).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(meta.width).toBe(64);
  });

  it("shrinks large images to 1600px on the long edge, with a 400px thumbnail", async () => {
    const store = new MemoryStore();
    const big = await sharp({ create: { width: 3000, height: 1500, channels: 3, background: "#123" } }).png().toBuffer();
    const { key } = await finalizeUpload(store, ALICE, await upload(store, ALICE, big, "image/png"));
    const meta = await sharp(store.objects.get(key)!.body).metadata();
    expect([meta.width, meta.height]).toEqual([1600, 800]);
    const thumb = await sharp(store.objects.get(thumbKey(key))!.body).metadata();
    expect([thumb.format, thumb.width, thumb.height]).toEqual(["webp", 400, 200]);
  });

  it("never upscales small images", async () => {
    const store = new MemoryStore();
    const { key } = await finalizeUpload(store, ALICE, await upload(store, ALICE, await jpegWithExif()));
    expect((await sharp(store.objects.get(thumbKey(key))!.body).metadata()).width).toBe(64);
  });

  it("files admin images under admin/{purpose}/ and keeps proofs sharper", async () => {
    const store = new MemoryStore();
    const noisy = await sharp({ create: { width: 800, height: 800, channels: 3, background: "#888", noise: { type: "gaussian", mean: 128, sigma: 40 } } }).png().toBuffer();
    const qc = await finalizeUpload(store, ALICE, await upload(store, ALICE, noisy, "image/png"), "qc");
    expect(qc.key).toMatch(/^admin\/qc\/[0-9a-f-]{36}\.webp$/);
    const proof = await finalizeUpload(store, ALICE, await upload(store, ALICE, noisy, "image/png"), "payment_proof");
    expect(isOwnPhotoKey(ALICE, proof.key)).toBe(true);
    // Quality 88 for proofs vs 80 for other photos: same pixels, bigger file.
    expect(store.objects.get(proof.key)!.body.byteLength).toBeGreaterThan(store.objects.get(qc.key)!.body.byteLength);
  });

  it("rejects files that aren't really images, and deletes them", async () => {
    const store = new MemoryStore();
    const incoming = await upload(store, ALICE, new TextEncoder().encode("<script>alert(1)</script>"));
    await expect(finalizeUpload(store, ALICE, incoming)).rejects.toThrow(/readable image/);
    expect(store.objects.size).toBe(0);
  });

  it("won't finalize another user's upload", async () => {
    const store = new MemoryStore();
    const incoming = await upload(store, ALICE, await jpegWithExif());
    await expect(finalizeUpload(store, BOB, incoming)).rejects.toMatchObject({ status: 403 });
    expect(store.objects.has(incoming)).toBe(true);
  });

  it("rejects an oversize object even if the browser lied about its size", async () => {
    const store = new MemoryStore();
    const { key } = await createUploadUrl(store, ALICE, { contentType: "image/jpeg", size: 100 });
    await store.put(key, new Uint8Array(UPLOAD_MAX_BYTES + 1), "image/jpeg");
    await expect(finalizeUpload(store, ALICE, key)).rejects.toThrow(/10 MB/);
    expect(store.objects.has(key)).toBe(false);
  });

  it("fails cleanly when nothing was uploaded", async () => {
    const { key } = await createUploadUrl(new MemoryStore(), ALICE, { contentType: "image/jpeg", size: 100 });
    await expect(finalizeUpload(new MemoryStore(), ALICE, key)).rejects.toMatchObject({ status: 404 });
  });
});

describe("photo access", () => {
  it("only signs URLs for the student's own photos", async () => {
    const store = new MemoryStore();
    const mine = `photos/${ALICE}/123e4567-e89b-12d3-a456-426614174000.webp`;
    expect(await ownPhotoUrl(store, ALICE, mine)).toMatch(/^memory:\/\/get\//);
    expect(await ownPhotoUrl(store, BOB, mine)).toBeNull();
    expect(await ownPhotoUrl(store, ALICE, `incoming/${ALICE}/123e4567-e89b-12d3-a456-426614174000`)).toBeNull();
    expect(await ownPhotoUrl(store, ALICE, `photos/${ALICE}/../${BOB}/x.webp`)).toBeNull();
  });

  it("processImage rejects GIFs even if bytes decode", async () => {
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } }).gif().toBuffer();
    await expect(processImage(gif)).rejects.toThrow(/JPEG, PNG or WebP/);
  });
});
