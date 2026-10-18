import "server-only";
import { TZDate } from "@date-fns/tz";
import { endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import { and, asc, count, desc, eq, gte, inArray, lte, notInArray, sql } from "drizzle-orm";
import { auditLog, batches, ledgerEntries, orders, orderStatusHistory, payments, users } from "../../db/schema";
import type { Db } from "../../db/types";
import { ADMIN_STATUS_LABELS } from "../../domain/labels";
import { TZ } from "../../lib/format";
import { listActionQueue } from "../data/admin";

// Dashboard: today at a glance.

const FEE_TYPES = ["service_fee", "reverse_search_fee", "consultation_fee"] as const;

export async function dashboard(db: Db, now: Date) {
  const myt = new TZDate(now.getTime(), TZ);
  const monthStart = startOfMonth(myt);
  const weekStart = startOfWeek(myt, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(myt, { weekStartsOn: 1 });

  const nextBatch = (modes: Array<"air" | "air_sensitive" | "sea">) =>
    db
      .select({
        id: batches.id,
        code: batches.code,
        cutoffAt: batches.cutoffAt,
        minOrders: batches.minOrders,
        orderCount: sql<number>`(select count(*)::int from ${orders} o where o.batch_id = "batches"."id")`,
      })
      .from(batches)
      .where(and(eq(batches.status, "open"), inArray(batches.mode, modes)))
      .orderBy(asc(batches.cutoffAt))
      .limit(1)
      .then((r) => r[0] ?? null);

  const [queue, [open], [proofs], air, sea, [fees], [moneyIn], [ready], pickups, history, changes] = await Promise.all([
    listActionQueue(db),
    db.select({ n: count() }).from(orders).where(notInArray(orders.status, ["completed", "rejected", "cancelled"])),
    db.select({ n: count() }).from(payments).where(eq(payments.status, "pending")),
    nextBatch(["air", "air_sensitive"]),
    nextBatch(["sea"]),
    // Fees earned this month: coordination and search/consultation fees, net of fee credits and reversals.
    db
      .select({ sen: sql<number>`coalesce(sum(${ledgerEntries.amountSen}), 0)::int` })
      .from(ledgerEntries)
      .where(and(inArray(ledgerEntries.type, [...FEE_TYPES]), gte(ledgerEntries.createdAt, monthStart))),
    db
      .select({ sen: sql<number>`coalesce(sum(${payments.amountSen}), 0)::int` })
      .from(payments)
      .where(and(eq(payments.status, "confirmed"), gte(payments.confirmedAt, monthStart))),
    db.select({ n: count() }).from(orders).where(eq(orders.status, "ready_for_pickup")),
    db
      .select({ id: batches.id, code: batches.code, pickupStartsAt: batches.pickupStartsAt, pickupEndsAt: batches.pickupEndsAt })
      .from(batches)
      .where(and(gte(batches.pickupStartsAt, weekStart), lte(batches.pickupStartsAt, weekEnd)))
      .orderBy(asc(batches.pickupStartsAt)),
    db
      .select({
        at: orderStatusHistory.createdAt,
        orderId: orderStatusHistory.orderId,
        from: orderStatusHistory.fromStatus,
        to: orderStatusHistory.toStatus,
        note: orderStatusHistory.note,
        actor: users.name,
        actorRole: users.role,
        itemName: orders.itemName,
      })
      .from(orderStatusHistory)
      .innerJoin(orders, eq(orders.id, orderStatusHistory.orderId))
      .leftJoin(users, eq(users.id, orderStatusHistory.actorId))
      .orderBy(desc(orderStatusHistory.createdAt))
      .limit(10),
    db.select({ at: auditLog.createdAt, summary: auditLog.summary, actor: users.name }).from(auditLog).leftJoin(users, eq(users.id, auditLog.actorId)).orderBy(desc(auditLog.createdAt)).limit(5),
  ]);

  const activity = [
    ...history.map((h) => ({
      at: h.at,
      href: `/admin/orders/${h.orderId}`,
      text: `#${h.orderId} ${h.itemName}: ${h.from === h.to ? (h.note ?? "note") : ADMIN_STATUS_LABELS[h.to]}`,
      by: h.actor ? (h.actorRole === "admin" ? h.actor : "Customer") : "System",
    })),
    ...changes.map((c) => ({ at: c.at, href: "/admin/settings/audit", text: c.summary, by: c.actor ?? "System" })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 10);

  return {
    needAction: queue.length,
    oldest: queue.slice(0, 5),
    openOrders: open.n,
    pendingPayments: proofs.n,
    air,
    sea,
    feesSen: fees.sen,
    moneyInSen: moneyIn.sen,
    readyForPickup: ready.n,
    pickups,
    activity,
  };
}
