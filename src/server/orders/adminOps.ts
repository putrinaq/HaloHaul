import "server-only";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { batches, orders, payments, quotes, sourcingOptions } from "../../db/schema";
import type { Db } from "../../db/types";
import { nextAdminAction, needsUpfrontFee } from "../../domain/adminQueue";
import { validateCategoryInput } from "../../domain/catalog";
import { isBatchShippingMode, type OrderStatus, type PaymentPurpose, type ShippingMode } from "../../domain/enums";
import { upfrontFee } from "../../domain/fees";
import { ADMIN_STATUS_LABELS } from "../../domain/labels";
import { formatMyr } from "../../domain/money";
import { buildQuote } from "../../domain/quoteBuilder";
import { scaleParcel, type Parcel } from "../../domain/shipping";
import { availableShippingModes } from "../../domain/shippingOptions";
import { audit } from "../audit";
import { getSettings } from "../data/catalog";
import { getCatalog, getCategoryVersion } from "../data/categories";
import { UserError } from "../errors";
import { isAdminImageKey } from "../photos";
import {
  lockOrder,
  moveOrder,
  noteOnOrder,
  orderBalance,
  postLedger,
  queueView,
  settleCancellation,
  upfrontFeeCharged,
  type ActorRef,
  type OrderRow,
} from "./core";

// Everything the admin does to an order. Each function runs in one
// transaction with the order row locked, re-checks the order's current state,
// and leaves a trail (status history, ledger, audit log).

const admin = (id: string): ActorRef => ({ id, kind: "admin" });

// ---- one-tap board actions ------------------------------------------------------

export type AdvanceResult = { ok: true; to: OrderStatus } | { ok: false; error: "not_found" | "stale" | "not_offered"; current?: OrderStatus };

/**
 * The board's one-tap action. Only goes through if the order is still in
 * `expectFrom` and its current primary action is exactly "advance to `to`",
 * so a stale card or a crafted request can't skip steps.
 */
export async function advanceOrder(
  db: Db,
  input: { orderId: number; expectFrom: OrderStatus; to: OrderStatus; actorId: string },
): Promise<AdvanceResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update");
    if (!row) return { ok: false, error: "not_found" };
    if (row.status !== input.expectFrom) return { ok: false, error: "stale", current: row.status };
    const action = nextAdminAction(await queueView(tx, row));
    if (action?.kind !== "advance" || action.to !== input.to) return { ok: false, error: "not_offered", current: row.status };
    await moveOrder(tx, row, input.to, admin(input.actorId));
    return { ok: true, to: input.to };
  });
}

// ---- money ----------------------------------------------------------------------

async function postPayment(tx: Db, order: OrderRow, paymentId: string, amountSen: number, adminId: string) {
  await postLedger(tx, order, [{ type: "payment", amountSen: -amountSen, reference: `payment:${paymentId}` }], adminId);
}

/** Fee orders created before fees were posted at submission get their charge now. */
async function ensureFeeCharged(tx: Db, order: OrderRow, adminId: string) {
  const fee = upfrontFee(order.pathType, await getSettings(tx));
  if (!fee || (await upfrontFeeCharged(tx, order.id)) > 0) return;
  await postLedger(tx, order, [{ type: fee.type, amountSen: fee.amountSen, reference: "upfront fee" }], adminId);
}

/** What confirming money does to the order, by what it was for. */
async function afterPaymentConfirmed(tx: Db, order: OrderRow, purpose: PaymentPurpose, adminId: string) {
  if (purpose === "upfront_fee") {
    if (!order.feePaidAt) await tx.update(orders).set({ feePaidAt: new Date() }).where(eq(orders.id, order.id));
    return;
  }
  const balance = await orderBalance(tx, order.id);
  if (purpose === "order" && order.status === "awaiting_payment" && balance.owedSen === 0) {
    await moveOrder(tx, order, "paid", admin(adminId), { note: "Payment confirmed" });
  }
  if (purpose === "balance" && order.shippingBalanceDue && balance.owedSen === 0) {
    await tx.update(orders).set({ shippingBalanceDue: false }).where(eq(orders.id, order.id));
    await noteOnOrder(tx, order, adminId, "Shipping balance settled");
  }
}

export async function markFeePaid(db: Db, adminId: string, input: { orderId: number; amountSen: number; reference?: string | null }) {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (!needsUpfrontFee(order)) throw new UserError("This order has no upfront fee.");
    if (order.feePaidAt) throw new UserError("The fee is already marked paid.");
    await ensureFeeCharged(tx, order, adminId);
    const [p] = await tx
      .insert(payments)
      .values({
        orderId: order.id,
        method: "admin_recorded",
        purpose: "upfront_fee",
        amountSen: input.amountSen,
        reference: input.reference || null,
        status: "confirmed",
        confirmedBy: adminId,
        confirmedAt: new Date(),
        createdBy: adminId,
      })
      .returning({ id: payments.id });
    await postPayment(tx, order, p.id, input.amountSen, adminId);
    await afterPaymentConfirmed(tx, order, "upfront_fee", adminId);
    await noteOnOrder(tx, order, adminId, `Upfront fee ${formatMyr(input.amountSen)} received`);
  });
}

/** Money received outside the proof flow (cash, a transfer without a screenshot). */
export async function recordPayment(
  db: Db,
  adminId: string,
  input: { orderId: number; purpose: PaymentPurpose; amountSen: number; reference?: string | null },
) {
  if (input.purpose === "upfront_fee") return markFeePaid(db, adminId, input);
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    const [p] = await tx
      .insert(payments)
      .values({
        orderId: order.id,
        method: "admin_recorded",
        purpose: input.purpose,
        amountSen: input.amountSen,
        reference: input.reference || null,
        status: "confirmed",
        confirmedBy: adminId,
        confirmedAt: new Date(),
        createdBy: adminId,
      })
      .returning({ id: payments.id });
    await postPayment(tx, order, p.id, input.amountSen, adminId);
    await afterPaymentConfirmed(tx, order, input.purpose, adminId);
  });
}

export async function confirmPayment(db: Db, adminId: string, input: { paymentId: string }) {
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).for("update");
    if (!p) throw new UserError("That payment no longer exists.");
    if (p.status !== "pending") throw new UserError("That payment was already handled.");
    const order = await lockOrder(tx, p.orderId);
    if (p.purpose === "upfront_fee") await ensureFeeCharged(tx, order, adminId);
    await tx.update(payments).set({ status: "confirmed", confirmedBy: adminId, confirmedAt: new Date() }).where(eq(payments.id, p.id));
    await postPayment(tx, order, p.id, p.amountSen, adminId);
    await afterPaymentConfirmed(tx, order, p.purpose, adminId);
    return { orderId: order.id, amountSen: p.amountSen };
  });
}

export async function rejectPayment(db: Db, adminId: string, input: { paymentId: string; reason: string }) {
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).for("update");
    if (!p) throw new UserError("That payment no longer exists.");
    if (p.status !== "pending") throw new UserError("That payment was already handled.");
    await tx
      .update(payments)
      .set({ status: "failed", rejectionReason: input.reason, confirmedBy: adminId, confirmedAt: new Date() })
      .where(eq(payments.id, p.id));
    const order = await lockOrder(tx, p.orderId);
    await noteOnOrder(tx, order, adminId, `Payment proof rejected: ${input.reason}`);
  });
}

/**
 * Refunds and credits, always as new ledger entries. `fromExistingCredit`
 * settles a credit the ledger already shows (e.g. after reconciliation):
 * keeping it as balance posts nothing; a bank transfer posts the payout.
 * Otherwise a new credit (`refund`) is issued, plus the payout if it's sent.
 */
export async function issueRefund(
  db: Db,
  adminId: string,
  input: {
    customerId: string;
    orderId: number | null;
    amountSen: number;
    method: "credit_balance" | "bank_transfer";
    reason: string;
    fromExistingCredit: boolean;
  },
) {
  return db.transaction(async (tx) => {
    const order = input.orderId ? await lockOrder(tx, input.orderId) : null;
    if (order && order.customerId !== input.customerId) throw new UserError("That order belongs to someone else.");
    const target = { id: order?.id ?? null, customerId: input.customerId };
    const reference = `${input.method}: ${input.reason}`;
    if (input.fromExistingCredit) {
      if (!order) throw new UserError("Choose the order with the credit.");
      const balance = await orderBalance(tx, order.id);
      if (input.amountSen > balance.creditSen) throw new UserError(`The order only has ${formatMyr(balance.creditSen)} in credit.`);
    } else {
      await postLedger(tx, target, [{ type: "refund", amountSen: -input.amountSen, reference }], adminId);
    }
    if (input.method === "bank_transfer") {
      await postLedger(tx, target, [{ type: "payout", amountSen: input.amountSen, reference }], adminId);
    }
    if (order?.shippingRefundDue) await tx.update(orders).set({ shippingRefundDue: false }).where(eq(orders.id, order.id));
    if (order) await noteOnOrder(tx, order, adminId, `${input.method === "bank_transfer" ? "Refunded by bank transfer" : "Kept as credit balance"}: ${formatMyr(input.amountSen)}`);
    await audit(tx, {
      actorId: adminId,
      action: "money.refund",
      entityType: order ? "order" : "customer",
      entityId: order?.id ?? input.customerId,
      summary: `${input.method === "bank_transfer" ? "Bank transfer refund" : "Credit"} of ${formatMyr(input.amountSen)}: ${input.reason}`,
      data: { ...input },
    });
  });
}

// ---- review, sourcing, quote -----------------------------------------------------

export async function clearRestricted(db: Db, adminId: string, input: { orderId: number; note: string }) {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (!order.restrictedFlag || order.restrictedClearedAt) throw new UserError("This order isn't held for review.");
    await tx.update(orders).set({ restrictedClearedAt: new Date(), restrictedClearedBy: adminId }).where(eq(orders.id, order.id));
    await noteOnOrder(tx, order, adminId, `Restricted item cleared${input.note ? `: ${input.note}` : ""}`);
    await audit(tx, { actorId: adminId, action: "order.restricted_clear", entityType: "order", entityId: order.id, summary: "Cleared restricted-item hold", data: { note: input.note } });
  });
}

export interface SourcingOptionInput {
  orderId: number;
  id?: string | null;
  title: string;
  url: string;
  priceFen: number;
  sellerNote?: string | null;
  photoKey?: string | null;
  estWeightG?: number | null;
  estLengthMm?: number | null;
  estWidthMm?: number | null;
  estHeightMm?: number | null;
  isRecommended: boolean;
}

const SOURCING_STATUSES: readonly OrderStatus[] = ["submitted", "sourcing"];
export const MAX_SOURCING_OPTIONS = 3;

export async function saveSourcingOption(db: Db, adminId: string, input: SourcingOptionInput) {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (!SOURCING_STATUSES.includes(order.status)) throw new UserError("Options can only be changed while sourcing.");
    if (input.photoKey && !isAdminImageKey(input.photoKey)) throw new UserError("Upload the photo again.");
    const existing = await tx.select({ id: sourcingOptions.id }).from(sourcingOptions).where(eq(sourcingOptions.orderId, order.id));
    if (!input.id && existing.length >= MAX_SOURCING_OPTIONS) throw new UserError(`Up to ${MAX_SOURCING_OPTIONS} options per order.`);
    if (input.id && !existing.some((e) => e.id === input.id)) throw new UserError("That option no longer exists.");
    if (needsUpfrontFee(order) && !order.feePaidAt) throw new UserError("Mark the upfront fee paid first.");

    if (input.isRecommended) await tx.update(sourcingOptions).set({ isRecommended: false }).where(eq(sourcingOptions.orderId, order.id));
    const values = {
      title: input.title,
      url: input.url,
      priceFen: input.priceFen,
      sellerNote: input.sellerNote || null,
      photoKey: input.photoKey || null,
      estWeightG: input.estWeightG ?? null,
      estLengthMm: input.estLengthMm ?? null,
      estWidthMm: input.estWidthMm ?? null,
      estHeightMm: input.estHeightMm ?? null,
      isRecommended: input.isRecommended,
    };
    if (input.id) await tx.update(sourcingOptions).set(values).where(eq(sourcingOptions.id, input.id));
    else await tx.insert(sourcingOptions).values({ ...values, orderId: order.id, sortOrder: existing.length });
    // The first option starts the sourcing step.
    if (order.status === "submitted") await moveOrder(tx, order, "sourcing", admin(adminId));
  });
}

export async function deleteSourcingOption(db: Db, adminId: string, input: { orderId: number; optionId: string }) {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (!SOURCING_STATUSES.includes(order.status)) throw new UserError("Options can only be changed while sourcing.");
    const [opt] = await tx
      .select({ selected: sourcingOptions.isSelected })
      .from(sourcingOptions)
      .where(and(eq(sourcingOptions.id, input.optionId), eq(sourcingOptions.orderId, order.id)));
    if (!opt) return;
    if (opt.selected) throw new UserError("The student chose this option. Send a quote, or ask them to choose again first.");
    await tx.delete(sourcingOptions).where(eq(sourcingOptions.id, input.optionId));
  });
}

export async function reorderSourcingOptions(db: Db, adminId: string, input: { orderId: number; ids: string[] }) {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    const rows = await tx.select({ id: sourcingOptions.id }).from(sourcingOptions).where(eq(sourcingOptions.orderId, order.id));
    const known = new Set(rows.map((r) => r.id));
    if (input.ids.length !== known.size || !input.ids.every((id) => known.has(id))) throw new UserError("The list changed. Reload and try again.");
    for (const [i, id] of input.ids.entries()) await tx.update(sourcingOptions).set({ sortOrder: i }).where(eq(sourcingOptions.id, id));
  });
}

/** Sends the options to the student to choose from (their pick unlocks "Send quote"). */
export async function sendSourcingOptions(db: Db, adminId: string, input: { orderId: number }) {
  return db.transaction(async (tx) => {
    let order = await lockOrder(tx, input.orderId);
    if (!SOURCING_STATUSES.includes(order.status)) throw new UserError("Options can only be sent while sourcing.");
    const opts = await tx.select({ id: sourcingOptions.id }).from(sourcingOptions).where(eq(sourcingOptions.orderId, order.id));
    if (opts.length === 0) throw new UserError("Add at least one option first.");
    if (order.status === "submitted") order = await moveOrder(tx, order, "sourcing", admin(adminId));
    await tx.update(sourcingOptions).set({ isSelected: false }).where(eq(sourcingOptions.orderId, order.id));
    await tx.update(orders).set({ optionsSentAt: new Date() }).where(eq(orders.id, order.id));
    await noteOnOrder(tx, order, adminId, `${opts.length} option${opts.length === 1 ? "" : "s"} sent to choose from`);
  });
}

export interface SendQuoteInput {
  orderId: number;
  itemPriceFen: number;
  fxRate: string;
  serviceFeeSen: number;
  shippingMode: ShippingMode;
  sellerConfirmed: boolean;
  /** Per-item parcel when seller-confirmed (ignored otherwise: the category default is used). */
  parcel: Parcel;
  deliveryFeeSen: number;
}

const QUOTABLE: readonly OrderStatus[] = ["submitted", "sourcing", "quote_sent"];

/** Recomputes everything from the inputs (never trusts totals), stores the quote and moves the order. */
export async function sendQuote(db: Db, adminId: string, input: SendQuoteInput) {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (!QUOTABLE.includes(order.status)) throw new UserError(`An order at “${ADMIN_STATUS_LABELS[order.status]}” can't be quoted.`);
    if (order.restrictedFlag && !order.restrictedClearedAt) throw new UserError("Clear the restricted-item review first.");
    if (needsUpfrontFee(order) && !order.feePaidAt) throw new UserError("Mark the upfront fee paid first.");

    const [settings, version] = await Promise.all([getSettings(tx), getCategoryVersion(tx, order.categoryVersionId)]);
    if (!version) throw new UserError("This order's category is missing.");
    const modes = availableShippingModes(order.platform, order.pathType, version.category);
    if (!modes.includes(input.shippingMode)) {
      throw new UserError("Choose a shipping mode this category allows.", { shippingMode: "Not allowed for this category" });
    }

    const feeCreditSen = needsUpfrontFee(order) ? await upfrontFeeCharged(tx, order.id) : 0;
    const parcel = input.sellerConfirmed ? input.parcel : version.category.defaultParcel;
    const { breakdown } = buildQuote(
      {
        itemPriceFen: input.itemPriceFen,
        fxRate: input.fxRate,
        serviceFeeSen: input.serviceFeeSen,
        shippingMode: input.shippingMode,
        parcel,
        source: input.sellerConfirmed ? "seller_confirmed" : "category_default",
        quantity: order.quantity,
        deliveryFeeSen: input.deliveryFeeSen,
        feeCreditSen,
      },
      settings,
    );

    const [selected] = await tx
      .select({ id: sourcingOptions.id })
      .from(sourcingOptions)
      .where(and(eq(sourcingOptions.orderId, order.id), eq(sourcingOptions.isSelected, true)));
    // One live quote per order: a revised quote replaces the open one.
    await tx.update(quotes).set({ status: "expired" }).where(and(eq(quotes.orderId, order.id), eq(quotes.status, "sent")));
    const expiresAt = new Date(Date.now() + settings.quote.validDays * 86_400_000);
    await tx.insert(quotes).values({
      orderId: order.id,
      sourcingOptionId: selected?.id ?? null,
      itemPriceFen: input.itemPriceFen,
      fxRate: input.fxRate,
      itemPriceSen: breakdown.itemPriceSen,
      serviceFeeSen: breakdown.serviceFeeSen,
      shippingEstimateMinSen: breakdown.shippingMinSen,
      shippingEstimateMaxSen: breakdown.shippingMaxSen,
      deliveryFeeSen: breakdown.deliveryFeeSen,
      feeCreditSen: breakdown.feeCreditSen,
      totalMinSen: breakdown.totalMinSen,
      totalMaxSen: breakdown.totalMaxSen,
      expiresAt,
      createdBy: adminId,
    });

    const scaled = scaleParcel(parcel, order.quantity);
    const set = {
      shippingMode: input.shippingMode,
      estWeightG: scaled.weightG,
      estLengthMm: scaled.lengthMm,
      estWidthMm: scaled.widthMm,
      estHeightMm: scaled.heightMm,
      estSellerConfirmed: input.sellerConfirmed,
    };
    if (order.status === "quote_sent") {
      await tx.update(orders).set(set).where(eq(orders.id, order.id));
      await noteOnOrder(tx, order, adminId, `Quote revised: ${formatMyr(breakdown.totalMaxSen)}`);
    } else {
      await moveOrder(tx, order, "quote_sent", admin(adminId), { set, note: `Quote ${formatMyr(breakdown.totalMaxSen)}` });
    }
    return { totalMaxSen: breakdown.totalMaxSen };
  });
}

// ---- warehouse, batch, tracking ----------------------------------------------------

export interface QcInput {
  orderId: number;
  arrivedAt: Date;
  finalWeightG: number | null;
  finalLengthMm: number | null;
  finalWidthMm: number | null;
  finalHeightMm: number | null;
  qcPhotoKeys: string[];
  qcNotes: string | null;
}

/** Records arrival and the quality check; from "At warehouse" it moves the order to QC review. */
export async function recordQc(db: Db, adminId: string, input: QcInput) {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (order.status !== "at_warehouse" && order.status !== "qc_review") throw new UserError("QC is recorded once the item is at the warehouse.");
    if (!input.qcPhotoKeys.every(isAdminImageKey)) throw new UserError("Upload the QC photos again.");
    const set = {
      warehouseArrivedAt: input.arrivedAt,
      finalWeightG: input.finalWeightG,
      finalLengthMm: input.finalLengthMm,
      finalWidthMm: input.finalWidthMm,
      finalHeightMm: input.finalHeightMm,
      qcPhotoKeys: input.qcPhotoKeys,
      qcNotes: input.qcNotes,
    };
    if (order.status === "at_warehouse") await moveOrder(tx, order, "qc_review", admin(adminId), { set });
    else {
      await tx.update(orders).set(set).where(eq(orders.id, order.id));
      await noteOnOrder(tx, order, adminId, "QC details updated");
    }
  });
}

/** Statuses an order can be added to (or moved between) batches in. */
export const BATCHABLE: readonly OrderStatus[] = ["paid", "order_submitted", "at_warehouse", "qc_review", "ready_to_consolidate"];

export async function assignBatch(db: Db, adminId: string, input: { orderId: number; batchId: string | null }) {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (!BATCHABLE.includes(order.status)) throw new UserError("This order can't change batch any more.");
    let code = "no batch";
    if (input.batchId) {
      const [batch] = await tx.select().from(batches).where(eq(batches.id, input.batchId));
      if (!batch) throw new UserError("That batch no longer exists.");
      if (batch.mode !== order.shippingMode) throw new UserError(`This order ships by ${order.shippingMode}; that batch is ${batch.mode}.`);
      if (batch.status !== "open" && batch.status !== "locked") throw new UserError(`Batch ${batch.code} is already ${batch.status}.`);
      code = batch.code;
    }
    await tx.update(orders).set({ batchId: input.batchId }).where(eq(orders.id, order.id));
    await noteOnOrder(tx, order, adminId, input.batchId ? `Added to batch ${code}` : "Removed from its batch");
  });
}

export async function updateTracking(db: Db, adminId: string, input: { orderId: number; trackingNumber: string | null; trackingNote: string | null }) {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    await tx.update(orders).set({ trackingNumber: input.trackingNumber, trackingNote: input.trackingNote }).where(eq(orders.id, order.id));
    await audit(tx, { actorId: adminId, action: "order.tracking", entityType: "order", entityId: order.id, summary: "Updated tracking", data: input });
  });
}

export async function updateInternalNotes(db: Db, adminId: string, input: { orderId: number; notes: string | null }) {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    await tx.update(orders).set({ internalNotes: input.notes }).where(eq(orders.id, order.id));
    await audit(tx, { actorId: adminId, action: "order.notes", entityType: "order", entityId: order.id, summary: "Edited internal notes" });
  });
}

/** Fixes a typo in the category details; validated against the order's own version and logged. */
export async function editDetails(db: Db, adminId: string, input: { orderId: number; details: unknown; variantText: string | null }) {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    const [version, catalog] = await Promise.all([getCategoryVersion(tx, order.categoryVersionId), getCatalog(tx)]);
    if (!version) throw new UserError("This order's category is missing.");
    const r = validateCategoryInput(version.definition, catalog.measurements, input.details, input.variantText);
    if (!r.ok) {
      throw new UserError(
        "Check the highlighted fields.",
        Object.fromEntries(Object.entries(r.fieldErrors).map(([k, m]) => [k === "variant_text" ? "variantText" : `details.${k}`, m])),
      );
    }
    const before = order.details;
    const changes = [...new Set([...Object.keys(before), ...Object.keys(r.details)])]
      .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(r.details[k]))
      .map((k) => `${k} ${before[k] ?? "—"} → ${r.details[k] ?? "—"}`);
    if ((order.variantText ?? "") !== (input.variantText ?? "")) changes.push(`option “${order.variantText ?? ""}” → “${input.variantText ?? ""}”`);
    if (changes.length === 0) return;
    await tx.update(orders).set({ details: r.details, variantText: input.variantText || null }).where(eq(orders.id, order.id));
    await noteOnOrder(tx, order, adminId, `Details corrected: ${changes.join("; ")}`);
    await audit(tx, { actorId: adminId, action: "order.details_edit", entityType: "order", entityId: order.id, summary: "Edited category details", data: { before, after: r.details } });
  });
}

// ---- overflow: needs info, reject, cancel ----------------------------------------------

export async function requestInfo(db: Db, adminId: string, input: { orderId: number; message: string }) {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    await moveOrder(tx, order, "needs_info", admin(adminId), { note: input.message });
  });
}

export async function rejectOrder(db: Db, adminId: string, input: { orderId: number; reason: string }) {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    const moved = await moveOrder(tx, order, "rejected", admin(adminId), { note: input.reason });
    return settleCancellation(tx, moved, adminId, `rejected:${order.id}`);
  });
}

export async function cancelOrder(db: Db, adminId: string, input: { orderId: number; reason: string }) {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    const moved = await moveOrder(tx, order, "cancelled", admin(adminId), { note: input.reason });
    return settleCancellation(tx, moved, adminId, `cancelled:${order.id}`);
  });
}

// ---- reads used by the drawers ---------------------------------------------------------

export async function listSourcingOptions(db: Db, orderId: number) {
  return db.select().from(sourcingOptions).where(eq(sourcingOptions.orderId, orderId)).orderBy(asc(sourcingOptions.sortOrder), asc(sourcingOptions.createdAt));
}

/** Open and locked batches a given order could join (same mode). */
export async function batchesForMode(db: Db, mode: ShippingMode) {
  if (!isBatchShippingMode(mode)) return [];
  return db
    .select({
      id: batches.id,
      code: batches.code,
      status: batches.status,
      cutoffAt: batches.cutoffAt,
      minOrders: batches.minOrders,
      orderCount: sql<number>`(select count(*)::int from ${orders} o where o.batch_id = "batches"."id")`,
    })
    .from(batches)
    .where(and(eq(batches.mode, mode), inArray(batches.status, ["open", "locked"])))
    .orderBy(asc(batches.cutoffAt));
}

export async function pendingPaymentsFor(db: Db, orderId: number) {
  return db
    .select()
    .from(payments)
    .where(and(eq(payments.orderId, orderId), ne(payments.status, "failed")))
    .orderBy(asc(payments.createdAt));
}
