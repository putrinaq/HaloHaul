"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import { needsUpfrontFee } from "@/domain/adminQueue";
import { resolveFields } from "@/domain/categorySchema";
import { ORDER_STATUSES, PAYMENT_PURPOSES, SHIPPING_MODES } from "@/domain/enums";
import { coordinationFeeSen, deliveryFeeSen, upfrontFee } from "@/domain/fees";
import { ADMIN_STATUS_LABELS } from "@/domain/labels";
import { availableShippingModes } from "@/domain/shippingOptions";
import { ok, runAdmin, UserError, type ActionResult } from "@/server/admin/run";
import { getOrderForAdmin } from "@/server/data/admin";
import { getSettings } from "@/server/data/catalog";
import { getCatalog } from "@/server/data/categories";
import {
  advanceOrder,
  assignBatch,
  batchesForMode,
  cancelOrder,
  clearRestricted,
  confirmPayment,
  deleteSourcingOption,
  editDetails,
  issueRefund,
  markFeePaid,
  recordPayment,
  recordQc,
  rejectOrder,
  rejectPayment,
  reorderSourcingOptions,
  requestInfo,
  saveSourcingOption,
  sendQuote,
  sendSourcingOptions,
  updateInternalNotes,
  updateTracking,
} from "@/server/orders/adminOps";
import { imageUrlMap } from "@/server/photos";
import { getPhotoStore } from "@/server/storage";

// Server actions behind the admin drawers. Each one: admin check, rate limit,
// Zod-validated input (runAdmin), then a transactional operation in
// server/orders/adminOps. The drawers refresh the page after a success.

const orderId = z.number().int().positive();
const sen = z.number().int().min(0).max(100_000_000);
const fen = z.number().int().min(0).max(1_000_000_000);
const dim = z.number().int().min(0).max(10_000_000).nullable();
const text = (max: number) => z.string().trim().max(max);
const reason = z.string().trim().min(3, "Add a short reason").max(500);

// ---- board -----------------------------------------------------------------------

export async function advanceOrderAction(raw: unknown): Promise<ActionResult<{ message: string }>> {
  return runAdmin(z.object({ orderId, expectFrom: z.enum(ORDER_STATUSES), to: z.enum(ORDER_STATUSES) }), raw, async ({ admin, db }, input) => {
    const r = await advanceOrder(db, { ...input, actorId: admin.id });
    if (r.ok) return ok({ message: `#${input.orderId} moved to ${ADMIN_STATUS_LABELS[r.to]}` });
    if (r.error === "not_found") return { ok: false, error: `Order #${input.orderId} no longer exists.` };
    if (r.error === "stale") return { ok: false, error: `#${input.orderId} is already at ${ADMIN_STATUS_LABELS[r.current!]}. The list has been updated.` };
    return { ok: false, error: `That step isn't available for #${input.orderId} right now. Open the order to see why.` };
  });
}

// ---- loaders (what each drawer needs) ---------------------------------------------------

async function detailOrThrow(id: number) {
  const detail = await getOrderForAdmin(getDb(), id);
  if (!detail) throw new UserError("That order no longer exists.");
  return detail;
}

export async function loadQuoteContext(raw: unknown) {
  return runAdmin(z.object({ orderId }), raw, async ({ db }, { orderId: id }) => {
    const [detail, settings] = await Promise.all([detailOrThrow(id), getSettings(db)]);
    const { order, category } = detail;
    if (!category) return { ok: false, error: "This order's category is missing." };
    const selected = detail.options.find((o) => o.isSelected) ?? null;
    const feeCreditSen = needsUpfrontFee(order)
      ? detail.ledger.filter((l) => (l.type === "reverse_search_fee" || l.type === "consultation_fee") && l.amountSen > 0).reduce((s, l) => s + l.amountSen, 0)
      : 0;
    const perItem = (v: number | null) => (v === null ? null : order.quantity > 0 ? Math.round(v / order.quantity) : v);
    return ok({
      order: {
        id: order.id,
        itemName: order.itemName,
        quantity: order.quantity,
        status: order.status,
        shippingMode: order.shippingMode,
        fulfilment: order.fulfilment,
        productUrl: order.productUrl,
        restrictedHold: order.restrictedFlag && !order.restrictedClearedAt,
        feeUnpaid: needsUpfrontFee(order) && !order.feePaidAt,
      },
      category: { name: category.category.name, defaultParcel: category.category.defaultParcel, restrictedNote: category.category.restrictedNote },
      modes: availableShippingModes(order.platform, order.pathType, category.category),
      selected: selected
        ? { title: selected.title, url: selected.url, priceFen: selected.priceFen, weightG: selected.estWeightG, lengthMm: selected.estLengthMm, widthMm: selected.estWidthMm, heightMm: selected.estHeightMm }
        : null,
      // Seller-confirmed numbers already on the order (per item).
      sellerParcel: order.estSellerConfirmed
        ? { weightG: perItem(order.estWeightG), lengthMm: order.estLengthMm, widthMm: order.estWidthMm, heightMm: perItem(order.estHeightMm) }
        : null,
      lastQuote: detail.quote
        ? { itemPriceFen: detail.quote.itemPriceFen, fxRate: detail.quote.fxRate, serviceFeeSen: detail.quote.serviceFeeSen, deliveryFeeSen: detail.quote.deliveryFeeSen, status: detail.quote.status }
        : null,
      defaults: { serviceFeeSen: coordinationFeeSen(settings), deliveryFeeSen: deliveryFeeSen(order.fulfilment, settings), fxRate: settings.fx.defaultMyrPerCny },
      feeCreditSen,
      settings,
    });
  });
}

export async function loadOptionsContext(raw: unknown) {
  return runAdmin(z.object({ orderId }), raw, async (_ctx, { orderId: id }) => {
    const detail = await detailOrThrow(id);
    const urls = await imageUrlMap(getPhotoStore(), detail.options.flatMap((o) => (o.photoKey ? [o.photoKey] : [])));
    return ok({
      order: {
        id: detail.order.id,
        itemName: detail.order.itemName,
        status: detail.order.status,
        optionsSentAt: detail.order.optionsSentAt,
        remarks: detail.order.remarks,
        feeUnpaid: needsUpfrontFee(detail.order) && !detail.order.feePaidAt,
      },
      options: detail.options.map((o) => ({ ...o, photoUrl: o.photoKey ? (urls[o.photoKey]?.thumb ?? null) : null })),
    });
  });
}

export async function loadPaymentContext(raw: unknown) {
  return runAdmin(z.object({ orderId }), raw, async ({ db }, { orderId: id }) => {
    const [detail, settings] = await Promise.all([detailOrThrow(id), getSettings(db)]);
    const pending = detail.payments.filter((p) => p.status === "pending");
    const urls = await imageUrlMap(getPhotoStore(), pending.flatMap((p) => (p.proofPhotoKey ? [p.proofPhotoKey] : [])));
    const fee = upfrontFee(detail.order.pathType, settings);
    return ok({
      order: { id: detail.order.id, itemName: detail.order.itemName, status: detail.order.status, customerName: detail.customer.name },
      owedSen: detail.balance.owedSen,
      quoteTotalSen: detail.quote?.status === "accepted" ? detail.quote.totalMaxSen : null,
      feeSen: fee?.amountSen ?? null,
      pending: pending.map((p) => ({
        id: p.id,
        purpose: p.purpose,
        amountSen: p.amountSen,
        reference: p.reference,
        createdAt: p.createdAt,
        proof: p.proofPhotoKey ? (urls[p.proofPhotoKey] ?? null) : null,
      })),
    });
  });
}

export async function loadBatchContext(raw: unknown) {
  return runAdmin(z.object({ orderId }), raw, async ({ db }, { orderId: id }) => {
    const detail = await detailOrThrow(id);
    return ok({
      order: { id: detail.order.id, itemName: detail.order.itemName, shippingMode: detail.order.shippingMode, batchId: detail.order.batchId },
      batches: await batchesForMode(db, detail.order.shippingMode),
    });
  });
}

export async function loadQcContext(raw: unknown) {
  return runAdmin(z.object({ orderId }), raw, async (_ctx, { orderId: id }) => {
    const { order } = await detailOrThrow(id);
    const urls = await imageUrlMap(getPhotoStore(), order.qcPhotoKeys);
    return ok({
      order: {
        id: order.id,
        itemName: order.itemName,
        status: order.status,
        quantity: order.quantity,
        warehouseArrivedAt: order.warehouseArrivedAt,
        finalWeightG: order.finalWeightG,
        finalLengthMm: order.finalLengthMm,
        finalWidthMm: order.finalWidthMm,
        finalHeightMm: order.finalHeightMm,
        estWeightG: order.estWeightG,
        qcNotes: order.qcNotes,
      },
      photos: order.qcPhotoKeys.flatMap((k) => (urls[k] ? [{ key: k, url: urls[k].thumb }] : [])),
    });
  });
}

export async function loadRefundContext(raw: unknown) {
  return runAdmin(z.object({ orderId }), raw, async (_ctx, { orderId: id }) => {
    const detail = await detailOrThrow(id);
    return ok({
      order: { id: detail.order.id, itemName: detail.order.itemName, status: detail.order.status, refundDue: detail.order.shippingRefundDue },
      customer: { id: detail.customer.id, name: detail.customer.name },
      creditSen: detail.balance.creditSen,
      owedSen: detail.balance.owedSen,
    });
  });
}

export async function loadDetailsContext(raw: unknown) {
  return runAdmin(z.object({ orderId }), raw, async ({ db }, { orderId: id }) => {
    const [detail, catalog] = await Promise.all([detailOrThrow(id), getCatalog(db)]);
    if (!detail.category) return { ok: false, error: "This order's category is missing." };
    return ok({
      order: { id: detail.order.id, details: detail.order.details, variantText: detail.order.variantText },
      category: { name: detail.category.category.name, version: detail.category.version },
      definition: detail.category.definition,
      fields: resolveFields(detail.category.definition, catalog.measurements),
    });
  });
}

// ---- mutations -------------------------------------------------------------------------

export async function markFeePaidAction(raw: unknown) {
  return runAdmin(z.object({ orderId, amountSen: sen.min(1), reference: text(120).nullable() }), raw, async ({ admin, db }, input) => {
    await markFeePaid(db, admin.id, input);
    return ok(undefined, "Fee marked paid");
  });
}

export async function recordPaymentAction(raw: unknown) {
  return runAdmin(
    z.object({ orderId, purpose: z.enum(PAYMENT_PURPOSES), amountSen: sen.min(1), reference: text(120).nullable() }),
    raw,
    async ({ admin, db }, input) => {
      await recordPayment(db, admin.id, input);
      return ok(undefined, "Payment recorded");
    },
  );
}

export async function confirmPaymentAction(raw: unknown) {
  return runAdmin(z.object({ paymentId: z.uuid() }), raw, async ({ admin, db }, input) => {
    await confirmPayment(db, admin.id, input);
    return ok(undefined, "Payment confirmed");
  });
}

export async function rejectPaymentAction(raw: unknown) {
  return runAdmin(z.object({ paymentId: z.uuid(), reason }), raw, async ({ admin, db }, input) => {
    await rejectPayment(db, admin.id, input);
    return ok(undefined, "Proof rejected");
  });
}

export async function clearRestrictedAction(raw: unknown) {
  return runAdmin(z.object({ orderId, note: text(500) }), raw, async ({ admin, db }, input) => {
    await clearRestricted(db, admin.id, input);
    return ok(undefined, "Restricted hold cleared");
  });
}

const optionSchema = z.object({
  orderId,
  id: z.uuid().nullable().optional(),
  title: z.string().trim().min(2, "Add a title").max(120),
  url: z.url({ error: "Paste the listing link" }).max(2000),
  priceFen: fen.min(1, "Add the price"),
  sellerNote: text(500).nullable().optional(),
  photoKey: z.string().max(300).nullable().optional(),
  estWeightG: dim.optional(),
  estLengthMm: dim.optional(),
  estWidthMm: dim.optional(),
  estHeightMm: dim.optional(),
  isRecommended: z.boolean().default(false),
});

export async function saveOptionAction(raw: unknown) {
  return runAdmin(optionSchema, raw, async ({ admin, db }, input) => {
    await saveSourcingOption(db, admin.id, input);
    return ok(undefined, "Option saved");
  });
}

export async function deleteOptionAction(raw: unknown) {
  return runAdmin(z.object({ orderId, optionId: z.uuid() }), raw, async ({ admin, db }, input) => {
    await deleteSourcingOption(db, admin.id, input);
    return ok(undefined);
  });
}

export async function reorderOptionsAction(raw: unknown) {
  return runAdmin(z.object({ orderId, ids: z.array(z.uuid()).max(10) }), raw, async ({ admin, db }, input) => {
    await reorderSourcingOptions(db, admin.id, input);
    return ok(undefined);
  });
}

export async function sendOptionsAction(raw: unknown) {
  return runAdmin(z.object({ orderId }), raw, async ({ admin, db }, input) => {
    await sendSourcingOptions(db, admin.id, input);
    return ok(undefined, "Options sent to the student");
  });
}

export async function sendQuoteAction(raw: unknown) {
  return runAdmin(
    z.object({
      orderId,
      itemPriceFen: fen.min(1, "Add the item price"),
      fxRate: z.string().regex(/^\d{1,6}(\.\d{1,6})?$/, "Use a rate like 0.65"),
      serviceFeeSen: sen,
      shippingMode: z.enum(SHIPPING_MODES),
      sellerConfirmed: z.boolean(),
      parcel: z.object({ weightG: dim.unwrap(), lengthMm: dim.unwrap(), widthMm: dim.unwrap(), heightMm: dim.unwrap() }),
      deliveryFeeSen: sen,
    }),
    raw,
    async ({ admin, db }, input) => {
      const r = await sendQuote(db, admin.id, input);
      return ok(r, "Quote sent");
    },
  );
}

export async function recordQcAction(raw: unknown) {
  return runAdmin(
    z.object({
      orderId,
      arrivedAt: z.coerce.date(),
      finalWeightG: dim,
      finalLengthMm: dim,
      finalWidthMm: dim,
      finalHeightMm: dim,
      qcPhotoKeys: z.array(z.string().max(300)).max(12),
      qcNotes: text(2000).nullable(),
    }),
    raw,
    async ({ admin, db }, input) => {
      await recordQc(db, admin.id, input);
      return ok(undefined, "QC recorded");
    },
  );
}

export async function assignBatchAction(raw: unknown) {
  return runAdmin(z.object({ orderId, batchId: z.uuid().nullable() }), raw, async ({ admin, db }, input) => {
    await assignBatch(db, admin.id, input);
    return ok(undefined, input.batchId ? "Added to batch" : "Removed from batch");
  });
}

export async function issueRefundAction(raw: unknown) {
  return runAdmin(
    z.object({
      customerId: z.string().min(1).max(64),
      orderId: orderId.nullable(),
      amountSen: sen.min(1, "Enter an amount"),
      method: z.enum(["credit_balance", "bank_transfer"]),
      reason,
      fromExistingCredit: z.boolean(),
    }),
    raw,
    async ({ admin, db }, input) => {
      await issueRefund(db, admin.id, input);
      return ok(undefined, input.method === "bank_transfer" ? "Refund recorded" : "Credit issued");
    },
  );
}

export async function requestInfoAction(raw: unknown) {
  return runAdmin(z.object({ orderId, message: z.string().trim().min(5, "Say what you need").max(1000) }), raw, async ({ admin, db }, input) => {
    await requestInfo(db, admin.id, input);
    return ok(undefined, "Asked the student for more info");
  });
}

export async function rejectOrderAction(raw: unknown) {
  return runAdmin(z.object({ orderId, reason }), raw, async ({ admin, db }, input) => {
    await rejectOrder(db, admin.id, input);
    return ok(undefined, "Order rejected");
  });
}

export async function cancelOrderAction(raw: unknown) {
  return runAdmin(z.object({ orderId, reason }), raw, async ({ admin, db }, input) => {
    await cancelOrder(db, admin.id, input);
    return ok(undefined, "Order cancelled");
  });
}

export async function updateNotesAction(raw: unknown) {
  return runAdmin(z.object({ orderId, notes: text(5000).nullable() }), raw, async ({ admin, db }, input) => {
    await updateInternalNotes(db, admin.id, { orderId: input.orderId, notes: input.notes || null });
    return ok(undefined, "Notes saved");
  });
}

export async function updateTrackingAction(raw: unknown) {
  return runAdmin(z.object({ orderId, trackingNumber: text(120).nullable(), trackingNote: text(1000).nullable() }), raw, async ({ admin, db }, input) => {
    await updateTracking(db, admin.id, { orderId: input.orderId, trackingNumber: input.trackingNumber || null, trackingNote: input.trackingNote || null });
    return ok(undefined, "Tracking saved");
  });
}

export async function editDetailsAction(raw: unknown) {
  return runAdmin(z.object({ orderId, details: z.record(z.string(), z.unknown()), variantText: text(200).nullable() }), raw, async ({ admin, db }, input) => {
    await editDetails(db, admin.id, input);
    return ok(undefined, "Details updated");
  });
}
