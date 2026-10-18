import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { batches, ledgerEntries, orders, orderStatusHistory, payments, quotes, sourcingOptions } from "../../db/schema";
import type { Db } from "../../db/types";
import { balanceOf } from "../../domain/ledger";
import { getCategoryVersion } from "./categories";

// Student-facing order reads. Every query is scoped by the session user's id,
// and admin-only columns (internal notes, restricted reason) are never selected.

const studentOrderColumns = {
  id: orders.id,
  itemName: orders.itemName,
  pathType: orders.pathType,
  platform: orders.platform,
  productUrl: orders.productUrl,
  referencePhotoKeys: orders.referencePhotoKeys,
  categoryVersionId: orders.categoryVersionId,
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
  feePaidAt: orders.feePaidAt,
  optionsSentAt: orders.optionsSentAt,
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

  const [history, quoteRows, ledger, batch, category, options, paymentRows] = await Promise.all([
    db
      .select({
        fromStatus: orderStatusHistory.fromStatus,
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
    getCategoryVersion(db, order.categoryVersionId),
    // Sourcing options only once they've been sent to the student.
    order.optionsSentAt
      ? db
          .select({
            id: sourcingOptions.id,
            title: sourcingOptions.title,
            url: sourcingOptions.url,
            priceFen: sourcingOptions.priceFen,
            sellerNote: sourcingOptions.sellerNote,
            photoKey: sourcingOptions.photoKey,
            isRecommended: sourcingOptions.isRecommended,
            isSelected: sourcingOptions.isSelected,
          })
          .from(sourcingOptions)
          .where(eq(sourcingOptions.orderId, order.id))
          .orderBy(asc(sourcingOptions.sortOrder), asc(sourcingOptions.createdAt))
      : Promise.resolve([]),
    db
      .select({
        id: payments.id,
        purpose: payments.purpose,
        amountSen: payments.amountSen,
        status: payments.status,
        rejectionReason: payments.rejectionReason,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(eq(payments.orderId, order.id))
      .orderBy(desc(payments.createdAt)),
  ]);

  return { order, history, quote: quoteRows[0] ?? null, ledger, balance: balanceOf(ledger), batch, category, options, payments: paymentRows };
}

export type CustomerOrderDetail = NonNullable<Awaited<ReturnType<typeof getOrderForCustomer>>>;
