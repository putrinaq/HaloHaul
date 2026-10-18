import "server-only";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { customerProfiles, ledgerEntries, orders, payments, users } from "../../db/schema";
import type { Db } from "../../db/types";

// Payment page reads: the proof queue, refunds due, and the ledger search.

const customerName = sql<string>`coalesce(${customerProfiles.displayName}, ${users.name})`;
const orderOwed = sql<number>`coalesce((select sum(l.amount_sen)::int from ${ledgerEntries} l where l.order_id = "orders"."id"), 0)`;

export async function pendingProofs(db: Db, page: number, pageSize = 25) {
  const where = eq(payments.status, "pending");
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        id: payments.id,
        orderId: payments.orderId,
        purpose: payments.purpose,
        amountSen: payments.amountSen,
        reference: payments.reference,
        proofPhotoKey: payments.proofPhotoKey,
        createdAt: payments.createdAt,
        itemName: orders.itemName,
        customerName,
        owedSen: orderOwed,
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .innerJoin(users, eq(users.id, orders.customerId))
      .leftJoin(customerProfiles, eq(customerProfiles.userId, orders.customerId))
      .where(where)
      .orderBy(payments.createdAt)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: count() }).from(payments).where(where),
  ]);
  return { rows, total: n, pageCount: Math.max(1, Math.ceil(n / pageSize)) };
}

export async function refundsDue(db: Db) {
  return db
    .select({ orderId: orders.id, itemName: orders.itemName, status: orders.status, customerName, creditSen: sql<number>`-1 * ${orderOwed}` })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.customerId))
    .leftJoin(customerProfiles, eq(customerProfiles.userId, orders.customerId))
    .where(eq(orders.shippingRefundDue, true))
    .orderBy(orders.id)
    .limit(50);
}

/** Ledger entries matching an order number, or a customer's name or email. */
export async function ledgerSearch(db: Db, q: string, page: number, pageSize = 25) {
  const term = q.trim();
  const orderId = /^#?\d{1,10}$/.test(term) ? Number(term.replace("#", "")) : null;
  const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const where = term
    ? orderId !== null
      ? eq(ledgerEntries.orderId, orderId)
      : or(ilike(users.name, like), ilike(users.email, like), ilike(customerProfiles.displayName, like))
    : undefined;
  const base = db
    .select({
      id: ledgerEntries.id,
      orderId: ledgerEntries.orderId,
      customerId: ledgerEntries.customerId,
      customerName,
      type: ledgerEntries.type,
      amountSen: ledgerEntries.amountSen,
      reference: ledgerEntries.reference,
      createdAt: ledgerEntries.createdAt,
    })
    .from(ledgerEntries)
    .innerJoin(users, eq(users.id, ledgerEntries.customerId))
    .leftJoin(customerProfiles, eq(customerProfiles.userId, ledgerEntries.customerId));
  const [rows, [{ n, sum }]] = await Promise.all([
    base.where(where).orderBy(desc(ledgerEntries.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db
      .select({ n: count(), sum: sql<number>`coalesce(sum(${ledgerEntries.amountSen}), 0)::int` })
      .from(ledgerEntries)
      .innerJoin(users, eq(users.id, ledgerEntries.customerId))
      .leftJoin(customerProfiles, eq(customerProfiles.userId, ledgerEntries.customerId))
      .where(where),
  ]);
  return { rows, total: n, balanceSen: sum, pageCount: Math.max(1, Math.ceil(n / pageSize)) };
}

export async function pendingProofCount(db: Db) {
  const [{ n }] = await db.select({ n: count() }).from(payments).where(and(eq(payments.status, "pending")));
  return n;
}
