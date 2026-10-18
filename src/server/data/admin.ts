import "server-only";
import { and, asc, count, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import {
  batches,
  categories,
  categoryVersions,
  customerProfiles,
  ledgerEntries,
  orders,
  orderStatusHistory,
  payments,
  quotes,
  sourcingOptions,
  users,
} from "../../db/schema";
import type { Db } from "../../db/types";
import {
  ACTION_FILTERS,
  matchesFilter,
  nextAdminAction,
  paymentState,
  waiting,
  type ActionFilter,
  type AdminAction,
  type QueueOrder,
} from "../../domain/adminQueue";
import type { OrderStatus, PaymentPurpose } from "../../domain/enums";
import { balanceOf } from "../../domain/ledger";
import { getCategoryVersion } from "./categories";

// Admin-only reads. Callers must have checked the session with requireAdmin()
// / runAdmin() first: nothing here is scoped to a customer.

export const PAGE_SIZE = 25;

/** Statuses that can put an order on the board (refunds can, from any status). */
const QUEUE_STATUSES = [
  "submitted",
  "sourcing",
  "awaiting_payment",
  "paid",
  "order_submitted",
  "at_warehouse",
  "qc_review",
  "ready_to_consolidate",
  "arrived_my",
  "ready_for_pickup",
] as const satisfies readonly OrderStatus[];

/** When the order entered its current status (history is written on every change). */
const waitingSince = sql<Date>`coalesce(
  (select max(h.created_at) from ${orderStatusHistory} h where h.order_id = "orders"."id" and h.from_status is distinct from h.to_status),
  ${orders.createdAt})`.mapWith(orders.createdAt);

const pendingPurposes = sql<PaymentPurpose[]>`coalesce(
  (select array_agg(distinct p.purpose::text) from ${payments} p where p.order_id = "orders"."id" and p.status = 'pending'),
  '{}'::text[])`;
const optionCount = sql<number>`(select count(*)::int from ${sourcingOptions} so where so.order_id = "orders"."id")`;
const hasSelectedOption = sql<boolean>`exists(select 1 from ${sourcingOptions} so where so.order_id = "orders"."id" and so.is_selected)`.mapWith(Boolean);
const customerName = sql<string>`coalesce(${customerProfiles.displayName}, ${users.name})`;

const queueColumns = {
  id: orders.id,
  itemName: orders.itemName,
  pathType: orders.pathType,
  platform: orders.platform,
  shippingMode: orders.shippingMode,
  status: orders.status,
  restrictedFlag: orders.restrictedFlag,
  restrictedClearedAt: orders.restrictedClearedAt,
  restrictedReason: orders.restrictedReason,
  shippingBalanceDue: orders.shippingBalanceDue,
  shippingRefundDue: orders.shippingRefundDue,
  feePaidAt: orders.feePaidAt,
  optionsSentAt: orders.optionsSentAt,
  batchId: orders.batchId,
  optionCount,
  hasSelectedOption,
  pendingPayments: pendingPurposes,
  waitingSince,
  customerName,
  categoryName: categories.name,
};

export interface QueueItem {
  id: number;
  itemName: string;
  customerName: string;
  categoryName: string;
  pathType: QueueOrder["pathType"];
  platform: (typeof orders.$inferSelect)["platform"];
  shippingMode: QueueOrder["shippingMode"];
  status: OrderStatus;
  restrictedHold: boolean;
  restrictedReason: string | null;
  shippingRefundDue: boolean;
  waitingSince: Date;
  action: AdminAction;
  payment: ReturnType<typeof paymentState>;
}

/** Every order waiting on the admin, oldest first (lightweight columns only). */
export async function listActionQueue(db: Db): Promise<QueueItem[]> {
  const rows = await db
    .select(queueColumns)
    .from(orders)
    .innerJoin(users, eq(users.id, orders.customerId))
    .leftJoin(customerProfiles, eq(customerProfiles.userId, orders.customerId))
    .innerJoin(categoryVersions, eq(categoryVersions.id, orders.categoryVersionId))
    .innerJoin(categories, eq(categories.id, categoryVersions.categoryId))
    .where(or(inArray(orders.status, QUEUE_STATUSES), eq(orders.shippingRefundDue, true)));

  const items: QueueItem[] = [];
  for (const r of rows) {
    const view: QueueOrder = { ...r, pendingPayments: r.pendingPayments ?? [] };
    const action = nextAdminAction(view);
    if (!action) continue;
    items.push({
      id: r.id,
      itemName: r.itemName,
      customerName: r.customerName,
      categoryName: r.categoryName,
      pathType: r.pathType,
      platform: r.platform,
      shippingMode: r.shippingMode,
      status: r.status,
      restrictedHold: r.restrictedFlag && !r.restrictedClearedAt,
      restrictedReason: r.restrictedReason,
      shippingRefundDue: r.shippingRefundDue,
      waitingSince: r.waitingSince,
      action,
      payment: paymentState(view),
    });
  }
  return items.sort((a, b) => a.waitingSince.getTime() - b.waitingSince.getTime() || a.id - b.id);
}

export interface BoardPage {
  items: QueueItem[];
  counts: Record<ActionFilter, number>;
  stats: { total: number; overdue: number; newRequests: number };
  page: number;
  pageCount: number;
}

/** One page (25) of the board for a filter, with every chip's count. */
export async function actionBoardPage(db: Db, filter: ActionFilter, page: number, now: Date): Promise<BoardPage> {
  const all = await listActionQueue(db);
  const counts = Object.fromEntries(ACTION_FILTERS.map((f) => [f.key, all.filter((i) => matchesFilter(i, f.key)).length])) as Record<ActionFilter, number>;
  const filtered = all.filter((i) => matchesFilter(i, filter));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pageCount);
  return {
    items: filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
    counts,
    stats: {
      total: all.length,
      overdue: all.filter((i) => waiting(i.waitingSince, now).level > 0).length,
      newRequests: all.filter((i) => i.status === "submitted").length,
    },
    page: current,
    pageCount,
  };
}

/** Badges on the Actions and Payment nav items. */
export async function navCounts(db: Db): Promise<{ actions: number; payments: number }> {
  const [queue, [proofs]] = await Promise.all([
    listActionQueue(db),
    db.select({ n: count() }).from(payments).where(eq(payments.status, "pending")),
  ]);
  return { actions: queue.length, payments: proofs?.n ?? 0 };
}

/** Everything the admin order page shows, or null if there's no such order. */
export async function getOrderForAdmin(db: Db, orderId: number) {
  if (!Number.isSafeInteger(orderId) || orderId < 1) return null;
  const [row] = await db
    .select({
      order: orders,
      waitingSince,
      customer: {
        id: users.id,
        email: users.email,
        name: customerName,
        phone: customerProfiles.phone,
        campus: customerProfiles.campus,
      },
    })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.customerId))
    .leftJoin(customerProfiles, eq(customerProfiles.userId, orders.customerId))
    .where(eq(orders.id, orderId));
  if (!row) return null;
  const { order } = row;

  const [history, quoteRows, paymentRows, ledger, batch, category, options, [past]] = await Promise.all([
    db
      .select({
        fromStatus: orderStatusHistory.fromStatus,
        toStatus: orderStatusHistory.toStatus,
        note: orderStatusHistory.note,
        createdAt: orderStatusHistory.createdAt,
        actorName: users.name,
        actorRole: users.role,
      })
      .from(orderStatusHistory)
      .leftJoin(users, eq(users.id, orderStatusHistory.actorId))
      .where(eq(orderStatusHistory.orderId, order.id))
      .orderBy(asc(orderStatusHistory.createdAt)),
    db.select().from(quotes).where(eq(quotes.orderId, order.id)).orderBy(desc(quotes.createdAt)).limit(5),
    db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(desc(payments.createdAt)),
    db
      .select({
        id: ledgerEntries.id,
        type: ledgerEntries.type,
        amountSen: ledgerEntries.amountSen,
        reference: ledgerEntries.reference,
        createdAt: ledgerEntries.createdAt,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.orderId, order.id))
      .orderBy(asc(ledgerEntries.createdAt)),
    order.batchId
      ? db
          .select({ id: batches.id, code: batches.code, status: batches.status, cutoffAt: batches.cutoffAt, mode: batches.mode })
          .from(batches)
          .where(eq(batches.id, order.batchId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    getCategoryVersion(db, order.categoryVersionId),
    db.select().from(sourcingOptions).where(eq(sourcingOptions.orderId, order.id)).orderBy(asc(sourcingOptions.sortOrder), asc(sourcingOptions.createdAt)),
    db.select({ n: count() }).from(orders).where(and(eq(orders.customerId, order.customerId), ne(orders.id, order.id))),
  ]);

  const queueView: QueueOrder = {
    ...order,
    optionCount: options.length,
    hasSelectedOption: options.some((o) => o.isSelected),
    pendingPayments: paymentRows.filter((p) => p.status === "pending").map((p) => p.purpose),
  };
  return {
    order,
    customer: { ...row.customer, pastOrders: past?.n ?? 0 },
    waitingSince: row.waitingSince,
    action: nextAdminAction(queueView),
    payment: paymentState(queueView),
    history,
    quote: quoteRows[0] ?? null,
    quotes: quoteRows,
    payments: paymentRows,
    ledger,
    balance: balanceOf(ledger),
    batch,
    category,
    options,
  };
}

export type AdminOrderDetail = NonNullable<Awaited<ReturnType<typeof getOrderForAdmin>>>;
