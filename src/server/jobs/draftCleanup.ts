// Removes cart items nobody has touched for DRAFT_TTL_DAYS (they can hold
// measurements). No "server-only" import: the worker bundles this file.
import { lt } from "drizzle-orm";
import { orderDrafts } from "../../db/schema";
import type { Db } from "../../db/types";
import { DRAFT_TTL_DAYS } from "../../domain/drafts";

/** Returns how many went. */
export async function deleteStaleDrafts(db: Db, now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - DRAFT_TTL_DAYS * 86_400_000);
  const rows = await db.delete(orderDrafts).where(lt(orderDrafts.updatedAt, before)).returning({ id: orderDrafts.id });
  return rows.length;
}
