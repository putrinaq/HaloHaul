import { after, connection } from "next/server";
import { getDb } from "@/db/client";
import { parseWebhook } from "@/domain/whatsapp";
import { getPhotoStore } from "@/server/storage";
import { safeEqual, validSignature, whatsappConfig } from "@/server/whatsapp/client";
import { metaGateway } from "@/server/whatsapp/gateway";
import { ingest, mediaFile } from "@/server/whatsapp/inbox";

// Meta calls this with incoming WhatsApp messages and delivery updates. A 200
// means "saved"; anything else and Meta tries again (for up to 7 days).

const MAX_BODY = 4 * 1024 * 1024; // Meta sends up to 3 MB

/** Meta's one-off check when the webhook is set up. */
export async function GET(req: Request) {
  await connection();
  const config = whatsappConfig();
  const q = new URL(req.url).searchParams;
  if (!config || q.get("hub.mode") !== "subscribe" || !safeEqual(q.get("hub.verify_token") ?? "", config.verifyToken)) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(q.get("hub.challenge") ?? "", { headers: { "content-type": "text/plain", "x-content-type-options": "nosniff" } });
}

export async function POST(req: Request) {
  const config = whatsappConfig();
  if (!config) return new Response("Not found", { status: 404 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return new Response("Too large", { status: 413 });
  const raw = await req.text();
  if (!validSignature(config, raw, req.headers.get("x-hub-signature-256"))) return new Response("Forbidden", { status: 403 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const db = getDb();
  const files = await ingest(db, parseWebhook(payload, config.phoneNumberId));
  // Keep our own copy of files: Meta deletes them after 7 days.
  if (files.length) {
    after(async () => {
      for (const id of files) await mediaFile(db, metaGateway(config), getPhotoStore(), id).catch((e) => console.error("[whatsapp] media", e));
    });
  }
  return new Response("ok");
}
