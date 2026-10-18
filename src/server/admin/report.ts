import "server-only";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { batches, categories, categoryVersions, ledgerEntries, orders, orderStatusHistory } from "../../db/schema";
import type { Db } from "../../db/types";
import { parseFxRate } from "../../domain/money";
import { speedVsPrice, timeInStatus } from "../../domain/report";

// Report queries. Money is grouped from the ledger, so it always agrees with
// what students see; months are Malaysia time.

const MONTH = sql<string>`to_char(${ledgerEntries.createdAt} at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM')`;
const sumWhere = (types: string) => sql<number>`coalesce(sum(${ledgerEntries.amountSen}) filter (where ${ledgerEntries.type}::text in (${sql.raw(types)})), 0)::int`;
const FEES = "'service_fee','reverse_search_fee','consultation_fee'";
const SHIPPING = "'shipping_estimate','shipping_adjustment'";

const since = (months: number) => new Date(Date.now() - months * 31 * 86_400_000);

export interface MoneyRow {
  key: string;
  feesSen: number;
  itemsSen: number;
  shippingSen: number;
  deliverySen: number;
  creditsSen: number;
  receivedSen: number;
  paidOutSen: number;
}

const moneyColumns = {
  feesSen: sumWhere(FEES),
  itemsSen: sumWhere("'item_payment'"),
  shippingSen: sumWhere(SHIPPING),
  deliverySen: sumWhere("'delivery_fee'"),
  creditsSen: sumWhere("'refund'"),
  receivedSen: sumWhere("'payment'"),
  paidOutSen: sumWhere("'payout'"),
};

export async function moneyByMonth(db: Db, months = 12): Promise<MoneyRow[]> {
  const rows = await db
    .select({ key: MONTH, ...moneyColumns })
    .from(ledgerEntries)
    .where(gte(ledgerEntries.createdAt, since(months)))
    .groupBy(MONTH)
    .orderBy(sql`1 desc`);
  // Credits and money received are stored negative; show them as positive amounts.
  return rows.map((r) => ({ ...r, creditsSen: -r.creditsSen, receivedSen: -r.receivedSen }));
}

export async function moneyByBatch(db: Db, months = 12) {
  const rows = await db
    .select({
      key: batches.code,
      batchId: batches.id,
      costFen: batches.actualCostFen,
      costRate: batches.actualCostFxRate,
      weightG: batches.actualWeightG,
      orderCount: sql<number>`count(distinct ${orders.id})::int`,
      ...moneyColumns,
    })
    .from(ledgerEntries)
    .innerJoin(orders, eq(orders.id, ledgerEntries.orderId))
    .innerJoin(batches, eq(batches.id, orders.batchId))
    .where(gte(batches.cutoffAt, since(months)))
    .groupBy(batches.id)
    .orderBy(sql`max(${batches.cutoffAt}) desc`);
  return rows.map((r) => {
    const costSen = r.costFen !== null && r.costRate ? Math.round((r.costFen * parseFxRate(r.costRate)) / 1_000_000) : null;
    return { ...r, creditsSen: -r.creditsSen, receivedSen: -r.receivedSen, costSen, shippingMarginSen: costSen === null ? null : r.shippingSen - costSen };
  });
}

export type Dimension = "category" | "path" | "platform";

export async function ordersBy(db: Db, dim: Dimension, months = 12) {
  const key =
    dim === "category" ? categories.name : dim === "path" ? sql<string>`${orders.pathType}::text` : sql<string>`${orders.platform}::text`;
  return db
    .select({
      key: sql<string>`${key}`,
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${orders.status} = 'completed')::int`,
      cancelled: sql<number>`count(*) filter (where ${orders.status} in ('cancelled','rejected'))::int`,
    })
    .from(orders)
    .innerJoin(categoryVersions, eq(categoryVersions.id, orders.categoryVersionId))
    .innerJoin(categories, eq(categories.id, categoryVersions.categoryId))
    .where(gte(orders.createdAt, since(months)))
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`);
}

export async function speedPriceReport(db: Db, months = 12) {
  const rows = await db
    .select({ snap: orders.shippingChoiceSnapshot })
    .from(orders)
    .where(and(isNotNull(orders.shippingChoiceSnapshot), gte(orders.createdAt, since(months))));
  return speedVsPrice(rows.flatMap((r) => (r.snap ? [r.snap] : [])));
}

export async function statusTimeReport(db: Db, months = 12) {
  const rows = await db
    .select({ orderId: orderStatusHistory.orderId, fromStatus: orderStatusHistory.fromStatus, toStatus: orderStatusHistory.toStatus, at: orderStatusHistory.createdAt })
    .from(orderStatusHistory)
    .where(gte(orderStatusHistory.createdAt, since(months)))
    .limit(50_000);
  return timeInStatus(rows);
}
