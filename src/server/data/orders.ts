import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { batches, ledgerEntries, orders, orderStatusHistory, quotes } from "../../db/schema";
import type { Db } from "../../db/types";
import { balanceOf } from "../../domain/ledger";

// Student-facing order reads. Every query is scoped by the session user's id,
// and admin-only columns (internal notes, restricted reason) are never selected.

const studentOrderColumns = {
  id: orders.id,
  itemName: orders.itemName,
  pathType: orders.pathType,
  platform: orders.platform,
  productUrl: orders.productUrl,
  referencePhotoKeys: orders.referencePhotoKeys,
  category: orders.category,
  categorySchemaVersion: orders.categorySchemaVersion,
  details: orders.details,
  variantText: orders.variantText,
  quantity: orders.quantity,
  conditionPreference: orders.conditionPreference,
  shippingMode: orders.shippingMode,
  fulfilment: orders.fulfilment,
  domesticFreeShipping: orders.domesticFreeShipping,
  status: orders.status,
  batchId: orders.batchId,
  trackingNumber: orders.trackingNumber,
  trackingNote: orders.trackingNote,
  restrictedFlag: orders.restrictedFlag,
  restrictedClearedAt: orders.restrictedClearedAt,
  shippingBalanceDue: orders.shippingBalanceDue,
  shippingRefundDue: orders.shippingRefundDue,
  remarks: orders.remarks,
  createdAt: orders.createdAt,
  updatedAt: orders.updatedAt,
};

export async function listOrdersForCustomer(db: Db, userId: string) {
  return db
    .select({
      id: orders.id,
      itemName: orders.itemName,
      pathType: orders.pathType,
      platform: orders.platform,
      status: orders.status,
      shippingMode: orders.shippingMode,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.customerId, userId))
    .orderBy(desc(orders.createdAt));
}

export type CustomerOrderSummary = Awaited<ReturnType<typeof listOrdersForCustomer>>[number];

/** One order with its history, latest quote, batch and balance — or null if it isn't this user's. */
export async function getOrderForCustomer(db: Db, userId: string, orderId: number) {
  if (!Number.isSafeInteger(orderId) || orderId < 1) return null;
  const [order] = await db
    .select(studentOrderColumns)
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.customerId, userId)));
  if (!order) return null;

  const [history, quoteRows, ledger, batch] = await Promise.all([
    db
      .select({
        toStatus: orderStatusHistory.toStatus,
        note: orderStatusHistory.note,
        createdAt: orderStatusHistory.createdAt,
      })
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, order.id))
      .orderBy(asc(orderStatusHistory.createdAt)),
    db
      .select({
        id: quotes.id,
        itemPriceFen: quotes.itemPriceFen,
        fxRate: quotes.fxRate,
        itemPriceSen: quotes.itemPriceSen,
        serviceFeeSen: quotes.serviceFeeSen,
        shippingEstimateMinSen: quotes.shippingEstimateMinSen,
        shippingEstimateMaxSen: quotes.shippingEstimateMaxSen,
        deliveryFeeSen: quotes.deliveryFeeSen,
        feeCreditSen: quotes.feeCreditSen,
        totalMinSen: quotes.totalMinSen,
        totalMaxSen: quotes.totalMaxSen,
        status: quotes.status,
        expiresAt: quotes.expiresAt,
        createdAt: quotes.createdAt,
      })
      .from(quotes)
      .where(and(eq(quotes.orderId, order.id), inArray(quotes.status, ["sent", "accepted"])))
      .orderBy(desc(quotes.createdAt))
      .limit(1),
    db
      .select({ type: ledgerEntries.type, amountSen: ledgerEntries.amountSen, createdAt: ledgerEntries.createdAt })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.orderId, order.id), eq(ledgerEntries.customerId, userId)))
      .orderBy(asc(ledgerEntries.createdAt)),
    order.batchId
      ? db
          .select({
            code: batches.code,
            cutoffAt: batches.cutoffAt,
            pickupStartsAt: batches.pickupStartsAt,
            pickupEndsAt: batches.pickupEndsAt,
          })
          .from(batches)
          .where(eq(batches.id, order.batchId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  return { order, history, quote: quoteRows[0] ?? null, ledger, balance: balanceOf(ledger), batch };
}

export type CustomerOrderDetail = NonNullable<Awaited<ReturnType<typeof getOrderForCustomer>>>;
