import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db/client";

// Used by the Docker healthcheck and uptime monitoring.
export async function GET() {
  await connection();
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
