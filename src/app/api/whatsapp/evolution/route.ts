import { after } from "next/server";
import { getDb } from "@/db/client";
import { parseEvolution } from "@/domain/evolution";
import { getPhotoStore } from "@/server/storage";
import { evolutionConfig, INSTANCE, validWebhook } from "@/server/whatsapp/evolution";
import { evolutionGateway } from "@/server/whatsapp/gateway";
import { ingest, mediaFile } from "@/server/whatsapp/inbox";

// Evolution API calls this, over the containers' own network, with messages and
// delivery updates from the linked number. It retries when it doesn't get a 200.

const MAX_BODY = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const config = evolutionConfig();
  if (!config) return new Response("Not found", { status: 404 });
  if (!validWebhook(config, req.headers.get("authorization"))) return new Response("Forbidden", { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return new Response("Too large", { status: 413 });

  const payload: unknown = await req.json().catch(() => null);
  const db = getDb();
  const files = await ingest(db, parseEvolution(payload, INSTANCE));
  // Straight away: Evolution only keeps what's needed to fetch them for 3 days.
  if (files.length) {
    after(async () => {
      for (const id of files) await mediaFile(db, evolutionGateway(config), getPhotoStore(), id).catch((e) => console.error("[whatsapp] media", e));
    });
  }
  return new Response("ok");
}
