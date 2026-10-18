import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { ledgerEntries, orders, orderStatusHistory, payments, quotes, sourcingOptions } from "../../db/schema";
import type { Db } from "../../db/types";
import { isRestrictedHold, type QueueOrder } from "../../domain/adminQueue";
import type { OrderStatus, PaymentPurpose } from "../../domain/enums";
import { balanceOf, reversalEntries, UPFRONT_FEE_TYPES, type Balance, type NewLedgerEntry } from "../../domain/ledger";
import { assertTransition, type Actor } from "../../domain/orderStateMachine";
import { UserError } from "../errors";
import { notifyStatusChange } from "../notify";

// Shared order mechanics: lock the row, move it through the state machine
// (always with a history row and the notification hook), post ledger entries.
// Callers run these inside one transaction.

export type OrderRow = typeof orders.$inferSelect;
export interface ActorRef {
  id: string | null;
  kind: Actor;
}

/** Locks the order row for the rest of the transaction. */
export async function lockOrder(tx: Db, orderId: number): Promise<OrderRow> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!order) throw new UserError("That order no longer exists.");
  return order;
}

/** Same, but only if it belongs to this student (someone else's order looks missing). */
export async function lockOwnOrder(tx: Db, userId: string, orderId: number): Promise<OrderRow> {
  const [order] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.customerId, userId)))
    .for("update");
  if (!order) throw new UserError("That order wasn't found.");
  return order;
}

/**
 * The only way an order changes status: checked by the state machine,
 * recorded in the history, announced through the notification hook.
 */
export async function moveOrder(
  tx: Db,
  order: OrderRow,
  to: OrderStatus,
  actor: ActorRef,
  opts: { note?: string | null; set?: Partial<typeof orders.$inferInsert> } = {},
): Promise<OrderRow> {
  const next = { ...order, ...opts.set };
  assertTransition(order.status, to, {
    actor: actor.kind,
    shippingMode: next.shippingMode,
    restrictedHold: isRestrictedHold(next),
    shippingBalanceDue: next.shippingBalanceDue,
  });
  await tx
    .update(orders)
    .set({ ...opts.set, status: to })
    .where(eq(orders.id, order.id));
  await tx.insert(orderStatusHistory).values({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: to,
    actorId: actor.id,
    note: opts.note ?? null,
  });
  notifyStatusChange({ orderId: order.id, from: order.status, to });
  return { ...next, status: to };
}

/** A timeline note without a status change (from = to). */
export async function noteOnOrder(tx: Db, order: Pick<OrderRow, "id" | "status">, actorId: string | null, note: string): Promise<void> {
  await tx.insert(orderStatusHistory).values({ orderId: order.id, fromStatus: order.status, toStatus: order.status, actorId, note });
}

/** `order.id` is null for a customer-level entry (e.g. a goodwill credit). */
export async function postLedger(
  tx: Db,
  order: { id: number | null; customerId: string },
  entries: readonly NewLedgerEntry[],
  createdBy: string | null,
): Promise<void> {
  if (entries.length === 0) return;
  await tx.insert(ledgerEntries).values(
    entries.map((e) => ({
      orderId: order.id,
      customerId: order.customerId,
      type: e.type,
      amountSen: e.amountSen,
      sourceAmountFen: e.sourceAmountFen ?? null,
      fxRate: e.fxRate ?? null,
      reference: e.reference,
      createdBy,
    })),
  );
}

export async function orderLedger(tx: Db, orderId: number) {
  return tx
    .select({ type: ledgerEntries.type, amountSen: ledgerEntries.amountSen })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.orderId, orderId));
}

export async function orderBalance(tx: Db, orderId: number): Promise<Balance> {
  return balanceOf(await orderLedger(tx, orderId));
}

/** Upfront fee charged on this order so far (positive fee entries). */
export async function upfrontFeeCharged(tx: Db, orderId: number): Promise<number> {
  const rows = await orderLedger(tx, orderId);
  return rows.filter((r) => (UPFRONT_FEE_TYPES as readonly string[]).includes(r.type) && r.amountSen > 0).reduce((s, r) => s + r.amountSen, 0);
}

/**
 * Undo an order's charges on cancellation or rejection; if that leaves the
 * student in credit, flag the order so "Issue refund/credit" comes up.
 */
export async function settleCancellation(tx: Db, order: OrderRow, actorId: string | null, reference: string): Promise<Balance> {
  const entries = await orderLedger(tx, order.id);
  await postLedger(tx, order, reversalEntries(entries, reference), actorId);
  await tx.update(quotes).set({ status: "expired" }).where(and(eq(quotes.orderId, order.id), eq(quotes.status, "sent")));
  const balance = await orderBalance(tx, order.id);
  if (balance.creditSen > 0) await tx.update(orders).set({ shippingRefundDue: true }).where(eq(orders.id, order.id));
  return balance;
}

/** The extra facts the board needs to pick an order's next action. */
export async function queueView(tx: Db, order: OrderRow): Promise<QueueOrder> {
  const [[opts], pending] = await Promise.all([
    tx
      .select({
        count: sql<number>`count(*)::int`,
        selected: sql<boolean>`coalesce(bool_or(${sourcingOptions.isSelected}), false)`,
      })
      .from(sourcingOptions)
      .where(eq(sourcingOptions.orderId, order.id)),
    tx
      .select({ purpose: payments.purpose })
      .from(payments)
      .where(and(eq(payments.orderId, order.id), eq(payments.status, "pending"))),
  ]);
  return {
    ...order,
    optionCount: opts?.count ?? 0,
    hasSelectedOption: opts?.selected ?? false,
    pendingPayments: pending.map((p) => p.purpose as PaymentPurpose),
  };
}
