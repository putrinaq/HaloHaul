import { DevDiskStore, getPhotoStore } from "@/server/storage";
import { UPLOAD_MAX_BYTES } from "@/server/uploads";

// Stand-in for R2's presigned URLs in local development (see DevDiskStore).
// Every request carries an HMAC signature and expiry; without the dev store
// (production, or R2 configured) this route doesn't exist.

function devStore(): DevDiskStore | null {
  const s = getPhotoStore();
  return s instanceof DevDiskStore ? s : null;
}

export async function PUT(req: Request) {
  const store = devStore();
  if (!store) return new Response("Not found", { status: 404 });
  const q = new URL(req.url).searchParams;
  const key = q.get("key") ?? "";
  const ct = q.get("ct") ?? "";
  const len = q.get("len") ?? "";
  const exp = Number(q.get("exp"));
  if (!store.verify(["put", key, ct, len, String(exp)], exp, q.get("sig") ?? "")) return new Response("Forbidden", { status: 403 });
  if (req.headers.get("content-type") !== ct) return new Response("Wrong content type", { status: 400 });
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.byteLength !== Number(len) || body.byteLength > UPLOAD_MAX_BYTES) return new Response("Wrong size", { status: 400 });
  await store.put(key, body);
  return new Response(null, { status: 200 });
}

export async function GET(req: Request) {
  const store = devStore();
  if (!store) return new Response("Not found", { status: 404 });
  const q = new URL(req.url).searchParams;
  const key = q.get("key") ?? "";
  const exp = Number(q.get("exp"));
  if (!store.verify(["get", key, String(exp)], exp, q.get("sig") ?? "")) return new Response("Forbidden", { status: 403 });
  const body = await store.get(key);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(body), {
    headers: { "content-type": key.endsWith(".webp") ? "image/webp" : "application/octet-stream", "cache-control": "private, max-age=300" },
  });
}
