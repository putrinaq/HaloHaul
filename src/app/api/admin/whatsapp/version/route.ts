import { connection } from "next/server";
import { getDb } from "@/db/client";
import { adminUserId, jsonError } from "@/server/apiAuth";
import { inboxVersion } from "@/server/whatsapp/inbox";

/** The open inbox asks this every few seconds and reloads only when it changes. */
export async function GET(req: Request) {
  await connection();
  if (!(await adminUserId(req))) return jsonError("Not found", 404);
  return Response.json({ version: await inboxVersion(getDb()) }, { headers: { "cache-control": "no-store" } });
}
