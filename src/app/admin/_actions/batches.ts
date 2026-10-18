"use server";

import { z } from "zod";
import { BATCH_SHIPPING_MODES, BATCH_STATUSES } from "@/domain/enums";
import {
  addOrdersToBatch,
  advanceBatch,
  commitWeighIn,
  consolidationSummary,
  extendBatch,
  lockBatchNow,
  lockDueBatches,
  removeOrderFromBatch,
  rollBatch,
  saveBatch,
  weighInPreview,
} from "@/server/admin/batches";
import { ok, runAdmin } from "@/server/admin/run";

const id = z.uuid();
const date = z.coerce.date();

export async function saveBatchAction(raw: unknown) {
  return runAdmin(
    z.object({
      id: id.nullable(),
      code: z.string().trim().min(2, "Add a code, e.g. Air #13").max(40),
      mode: z.enum(BATCH_SHIPPING_MODES),
      cutoffAt: date,
      minOrders: z.number().int().min(1, "At least 1").max(10_000),
      pickupStartsAt: date.nullable(),
      pickupEndsAt: date.nullable(),
      forwarder: z.string().trim().max(80).nullable(),
      notes: z.string().trim().max(2000).nullable(),
    }),
    raw,
    async ({ admin, db }, { id: batchId, ...input }) => {
      const saved = await saveBatch(db, admin.id, batchId, { ...input, forwarder: input.forwarder || null, notes: input.notes || null });
      return ok({ id: saved }, batchId ? "Batch saved" : "Batch created");
    },
  );
}

export async function lockBatchAction(raw: unknown) {
  return runAdmin(z.object({ id }), raw, async ({ admin, db }, input) => {
    await lockBatchNow(db, admin.id, input.id);
    return ok(undefined, "Batch locked");
  });
}

export async function lockDueAction() {
  return runAdmin(z.object({}), {}, async ({ db }) => {
    const locked = await lockDueBatches(db);
    return ok(undefined, locked.length ? `Locked ${locked.map((b) => b.code).join(", ")}` : "Nothing past cutoff");
  });
}

export async function extendBatchAction(raw: unknown) {
  return runAdmin(z.object({ id }), raw, async ({ admin, db }, input) => {
    await extendBatch(db, admin.id, input.id);
    return ok(undefined, "Extended by 48 hours");
  });
}

export async function rollBatchAction(raw: unknown) {
  return runAdmin(z.object({ id }), raw, async ({ admin, db }, input) => {
    const r = await rollBatch(db, admin.id, input.id);
    return ok(r, `Moved ${r.moved} orders into ${r.into}`);
  });
}

export async function addOrdersAction(raw: unknown) {
  return runAdmin(z.object({ id, orderIds: z.array(z.number().int().positive()).min(1).max(100) }), raw, async ({ admin, db }, input) => {
    await addOrdersToBatch(db, admin.id, input.id, input.orderIds);
    return ok(undefined, `Added ${input.orderIds.length} order${input.orderIds.length === 1 ? "" : "s"}`);
  });
}

export async function removeOrderAction(raw: unknown) {
  return runAdmin(z.object({ id, orderId: z.number().int().positive() }), raw, async ({ admin, db }, input) => {
    await removeOrderFromBatch(db, admin.id, input.id, input.orderId);
    return ok(undefined, "Removed from batch");
  });
}

export async function advanceBatchAction(raw: unknown) {
  return runAdmin(z.object({ id, to: z.enum(BATCH_STATUSES) }), raw, async ({ admin, db }, input) => {
    await advanceBatch(db, admin.id, input.id, input.to);
    return ok(undefined, `Batch ${input.to}`);
  });
}

export async function summaryAction(raw: unknown) {
  return runAdmin(z.object({ id }), raw, async ({ db }, input) => {
    const s = await consolidationSummary(db, input.id);
    if (!s) return { ok: false, error: "That batch no longer exists." };
    return ok(s);
  });
}

const weighIn = z.object({
  id,
  actualWeightG: z.number().int().min(1, "Enter the weight").max(10_000_000),
  actualCostFen: z.number().int().min(0).max(10_000_000_000),
  fxRate: z.string().regex(/^\d{1,6}(\.\d{1,6})?$/, "Use a rate like 0.65"),
});

export async function weighInPreviewAction(raw: unknown) {
  return runAdmin(weighIn, raw, async ({ db }, { id: batchId, ...input }) => ok(await weighInPreview(db, batchId, input)));
}

export async function commitWeighInAction(raw: unknown) {
  return runAdmin(weighIn, raw, async ({ admin, db }, { id: batchId, ...input }) => {
    await commitWeighIn(db, admin.id, batchId, input);
    return ok(undefined, "Weigh-in posted");
  });
}
