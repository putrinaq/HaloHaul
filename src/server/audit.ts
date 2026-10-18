import "server-only";
import { auditLog } from "../db/schema";
import type { Db } from "../db/types";

/** Append-only record of an admin change (settings, category publishes, edits, refunds). */
export async function audit(
  db: Db,
  entry: { actorId: string | null; action: string; entityType: string; entityId?: string | number | null; summary: string; data?: Record<string, unknown> },
): Promise<void> {
  await db.insert(auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId === undefined || entry.entityId === null ? null : String(entry.entityId),
    summary: entry.summary,
    data: entry.data ?? null,
  });
}
