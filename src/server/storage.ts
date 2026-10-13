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

let store: ObjectStore | null | undefined;

/** The configured photo store, or null when R2 isn't configured (local dev). */
export function getPhotoStore(): ObjectStore | null {
  if (store !== undefined) return store;
  const e = env();
  store =
    e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET
      ? new R2Store(e.R2_ACCOUNT_ID, e.R2_ACCESS_KEY_ID, e.R2_SECRET_ACCESS_KEY, e.R2_BUCKET)
      : null;
  return store;
}
