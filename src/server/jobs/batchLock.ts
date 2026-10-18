import { and, eq, lte, sql } from "drizzle-orm";
import { auditLog, batches, orders } from "../../db/schema";
import type { Db } from "../../db/types";

// Batch auto-lock, run by the worker every few minutes (and safe to run from
// the admin too). No "server-only" import: the worker bundles this file.

export interface LockResult {
  code: string;
  orderCount: number;
  minOrders: number;
  belowMin: boolean;
}

/**
 * Locks every open batch whose cutoff has passed. A batch below its minimum
 * is still locked, but flagged so the admin is asked to extend it by 48h or
 * roll its orders into the next batch.
 */
export async function lockDueBatches(db: Db, now = new Date()): Promise<LockResult[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({
        id: batches.id,
        code: batches.code,
        minOrders: batches.minOrders,
        orderCount: sql<number>`(select count(*)::int from ${orders} o where o.batch_id = "batches"."id")`,
      })
      .from(batches)
      .where(and(eq(batches.status, "open"), lte(batches.cutoffAt, now)))
      .for("update");
    const results: LockResult[] = [];
    for (const b of due) {
      const belowMin = b.orderCount < b.minOrders;
      await tx.update(batches).set({ status: "locked", lockedAt: now, belowMinAlertAt: belowMin ? now : null }).where(eq(batches.id, b.id));
      await tx.insert(auditLog).values({
        actorId: null,
        action: "batch.auto_lock",
        entityType: "batch",
        entityId: b.id,
        summary: `${b.code} locked at cutoff with ${b.orderCount}/${b.minOrders} orders${belowMin ? " — below minimum" : ""}`,
      });
      results.push({ code: b.code, orderCount: b.orderCount, minOrders: b.minOrders, belowMin });
    }
    return results;
  });
}
