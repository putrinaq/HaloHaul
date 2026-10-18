import "server-only";
import { and, asc, count, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { batches, customerProfiles, orders, quotes, users } from "../../db/schema";
import type { Db } from "../../db/types";
import { nextAdminAction } from "../../domain/adminQueue";
import type { BatchShippingMode, BatchStatus, OrderStatus } from "../../domain/enums";
import { formatMyr, parseFxRate } from "../../domain/money";
import { previewWeighIn, type WeighInOrder } from "../../domain/weighIn";
import { audit } from "../audit";
import { getSettings } from "../data/catalog";
import { UserError } from "../errors";
import { lockDueBatches } from "../jobs/batchLock";
import { BATCHABLE } from "../orders/adminOps";
import { lockOrder, moveOrder, noteOnOrder, postLedger, queueView } from "../orders/core";

// Batches: create, fill, lock, consolidate, ship, weigh in, arrive, distribute.

export const BATCH_FLOW: readonly BatchStatus[] = ["open", "locked", "consolidated", "shipped", "arrived", "distributed"];
const orderCount = sql<number>`(select count(*)::int from ${orders} o where o.batch_id = "batches"."id")`;

export type BatchTab = "air" | "sea" | "history";

export async function listBatches(db: Db, tab: BatchTab, page: number, pageSize = 25) {
  const where =
    tab === "history"
      ? eq(batches.status, "distributed")
      : and(ne(batches.status, "distributed"), tab === "sea" ? eq(batches.mode, "sea") : inArray(batches.mode, ["air", "air_sensitive"]));
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({ batch: batches, orderCount })
      .from(batches)
      .where(where)
      .orderBy(tab === "history" ? desc(batches.cutoffAt) : asc(batches.cutoffAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: count() }).from(batches).where(where),
  ]);
  return { rows: rows.map((r) => ({ ...r.batch, orderCount: r.orderCount })), pageCount: Math.max(1, Math.ceil(n / pageSize)) };
}

export async function getBatch(db: Db, id: string) {
  const [batch] = await db.select().from(batches).where(eq(batches.id, id));
  if (!batch) return null;
  const rows = await db
    .select({
      order: orders,
      customerName: sql<string>`coalesce(${customerProfiles.displayName}, ${users.name})`,
      phone: customerProfiles.phone,
    })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.customerId))
    .leftJoin(customerProfiles, eq(customerProfiles.userId, orders.customerId))
    .where(eq(orders.batchId, id))
    .orderBy(asc(orders.id));
  const items = await Promise.all(
    rows.map(async (r) => {
      const action = nextAdminAction(await queueView(db, r.order));
      return {
        id: r.order.id,
        itemName: r.order.itemName,
        quantity: r.order.quantity,
        platform: r.order.platform,
        status: r.order.status,
        customerId: r.order.customerId,
        customerName: r.customerName,
        phone: r.phone,
        estWeightG: r.order.estWeightG,
        finalWeightG: r.order.finalWeightG,
        trackingNumber: r.order.trackingNumber,
        ready: r.order.status === "ready_to_consolidate" || ["consolidated", "shipped", "arrived_my", "ready_for_pickup", "completed"].includes(r.order.status),
        action: action?.label ?? null,
      };
    }),
  );
  const customers = [...new Map(items.map((i) => [i.customerId, { id: i.customerId, name: i.customerName, phone: i.phone, orders: items.filter((x) => x.customerId === i.customerId) }])).values()];
  const candidates =
    batch.status === "open" || batch.status === "locked"
      ? await db
          .select({ id: orders.id, itemName: orders.itemName, status: orders.status })
          .from(orders)
          .where(and(isNull(orders.batchId), eq(orders.shippingMode, batch.mode), inArray(orders.status, BATCHABLE as OrderStatus[])))
          .orderBy(asc(orders.id))
          .limit(100)
      : [];
  return { batch, items, customers, candidates };
}

export interface BatchInput {
  code: string;
  mode: BatchShippingMode;
  cutoffAt: Date;
  minOrders: number;
  pickupStartsAt: Date | null;
  pickupEndsAt: Date | null;
  forwarder: string | null;
  notes: string | null;
}

export async function saveBatch(db: Db, actorId: string, id: string | null, input: BatchInput) {
  if (input.pickupStartsAt && input.pickupEndsAt && input.pickupEndsAt <= input.pickupStartsAt) throw new UserError("The pickup window ends before it starts.", { pickupEndsAt: "After the start" });
  return db.transaction(async (tx) => {
    const [clash] = await tx.select({ id: batches.id }).from(batches).where(eq(batches.code, input.code));
    if (clash && clash.id !== id) throw new UserError("That code is taken.", { code: "Already used" });
    let batchId = id;
    if (id) {
      const [before] = await tx.select().from(batches).where(eq(batches.id, id)).for("update");
      if (!before) throw new UserError("That batch no longer exists.");
      if (before.mode !== input.mode && (await tx.select({ n: count() }).from(orders).where(eq(orders.batchId, id)))[0].n > 0) {
        throw new UserError("Empty the batch before changing its mode.");
      }
      await tx.update(batches).set(input).where(eq(batches.id, id));
    } else {
      [{ id: batchId }] = await tx.insert(batches).values(input).returning({ id: batches.id });
    }
    await audit(tx, { actorId, action: id ? "batch.update" : "batch.create", entityType: "batch", entityId: batchId, summary: `${id ? "Edited" : "Created"} batch ${input.code}` });
    return batchId!;
  });
}

async function lockBatchRow(tx: Db, id: string) {
  const [b] = await tx.select().from(batches).where(eq(batches.id, id)).for("update");
  if (!b) throw new UserError("That batch no longer exists.");
  return b;
}

export async function lockBatchNow(db: Db, actorId: string, id: string) {
  return db.transaction(async (tx) => {
    const b = await lockBatchRow(tx, id);
    if (b.status !== "open") throw new UserError("Only an open batch can be locked.");
    const [{ n }] = await tx.select({ n: count() }).from(orders).where(eq(orders.batchId, id));
    const now = new Date();
    await tx.update(batches).set({ status: "locked", lockedAt: now, belowMinAlertAt: n < b.minOrders ? now : null }).where(eq(batches.id, id));
    await audit(tx, { actorId, action: "batch.lock", entityType: "batch", entityId: id, summary: `Locked ${b.code} with ${n}/${b.minOrders} orders` });
  });
}

/** Below minimum at cutoff: give it 48 more hours and reopen. */
export async function extendBatch(db: Db, actorId: string, id: string, hours = 48) {
  return db.transaction(async (tx) => {
    const b = await lockBatchRow(tx, id);
    if (b.status !== "open" && b.status !== "locked") throw new UserError("This batch has already been consolidated.");
    const base = Math.max(b.cutoffAt.getTime(), Date.now());
    await tx
      .update(batches)
      .set({ status: "open", cutoffAt: new Date(base + hours * 3_600_000), lockedAt: null, belowMinAlertAt: null })
      .where(eq(batches.id, id));
    await audit(tx, { actorId, action: "batch.extend", entityType: "batch", entityId: id, summary: `Extended ${b.code} by ${hours}h` });
  });
}

/** Below minimum: move every order into the next open batch of the same mode, then remove this one. */
export async function rollBatch(db: Db, actorId: string, id: string) {
  return db.transaction(async (tx) => {
    const b = await lockBatchRow(tx, id);
    if (b.status !== "open" && b.status !== "locked") throw new UserError("This batch has already been consolidated.");
    const [next] = await tx
      .select()
      .from(batches)
      .where(and(eq(batches.mode, b.mode), eq(batches.status, "open"), ne(batches.id, id), gt(batches.cutoffAt, b.cutoffAt)))
      .orderBy(asc(batches.cutoffAt))
      .limit(1);
    if (!next) throw new UserError(`There's no later open ${b.mode} batch. Create it first, then roll.`);
    const moved = await tx.update(orders).set({ batchId: next.id }).where(eq(orders.batchId, id)).returning({ id: orders.id, status: orders.status });
    for (const o of moved) await noteOnOrder(tx, o, actorId, `Moved from ${b.code} to ${next.code}`);
    await tx.delete(batches).where(eq(batches.id, id));
    await audit(tx, { actorId, action: "batch.roll", entityType: "batch", entityId: id, summary: `Rolled ${moved.length} orders from ${b.code} into ${next.code}` });
    return { moved: moved.length, into: next.code };
  });
}

export async function addOrdersToBatch(db: Db, actorId: string, id: string, orderIds: number[]) {
  return db.transaction(async (tx) => {
    const b = await lockBatchRow(tx, id);
    if (b.status !== "open" && b.status !== "locked") throw new UserError(`${b.code} is already ${b.status}.`);
    for (const orderId of orderIds) {
      const o = await lockOrder(tx, orderId);
      if (o.shippingMode !== b.mode) throw new UserError(`#${o.id} ships by ${o.shippingMode}, not ${b.mode}.`);
      if (!BATCHABLE.includes(o.status)) throw new UserError(`#${o.id} can't join a batch at this stage.`);
      await tx.update(orders).set({ batchId: id }).where(eq(orders.id, o.id));
      await noteOnOrder(tx, o, actorId, `Added to batch ${b.code}`);
    }
  });
}

export async function removeOrderFromBatch(db: Db, actorId: string, id: string, orderId: number) {
  return db.transaction(async (tx) => {
    const b = await lockBatchRow(tx, id);
    if (b.status !== "open" && b.status !== "locked") throw new UserError(`${b.code} is already ${b.status}.`);
    const o = await lockOrder(tx, orderId);
    if (o.batchId !== id) return;
    await tx.update(orders).set({ batchId: null }).where(eq(orders.id, o.id));
    await noteOnOrder(tx, o, actorId, `Removed from batch ${b.code}`);
  });
}

/** What each batch step does to its orders. */
const ORDER_STEP: Partial<Record<BatchStatus, { from: OrderStatus; to: OrderStatus }>> = {
  consolidated: { from: "ready_to_consolidate", to: "consolidated" },
  shipped: { from: "consolidated", to: "shipped" },
  arrived: { from: "shipped", to: "arrived_my" },
};

/**
 * Moves the batch one step along open → locked → consolidated → shipped →
 * arrived → distributed, taking its orders with it. Refuses if any order
 * isn't where it needs to be (they're listed so the admin can fix or remove them).
 */
export async function advanceBatch(db: Db, actorId: string, id: string, to: BatchStatus) {
  return db.transaction(async (tx) => {
    const b = await lockBatchRow(tx, id);
    if (BATCH_FLOW.indexOf(to) !== BATCH_FLOW.indexOf(b.status) + 1) throw new UserError(`A ${b.status} batch can't become ${to}.`);
    const inBatch = await tx.select().from(orders).where(eq(orders.batchId, id)).for("update");
    const step = ORDER_STEP[to];
    if (step) {
      const blocking = inBatch.filter((o) => o.status !== step.from && !["cancelled", "rejected"].includes(o.status));
      if (blocking.length) throw new UserError(`Not ready: ${blocking.map((o) => `#${o.id}`).join(", ")} must be at “${step.from.replace(/_/g, " ")}” first (or be removed).`);
      for (const o of inBatch.filter((x) => x.status === step.from)) await moveOrder(tx, o, step.to, { id: actorId, kind: "admin" }, { note: `Batch ${b.code} ${to}` });
    }
    if (to === "distributed") {
      const open = inBatch.filter((o) => !["completed", "cancelled", "rejected"].includes(o.status));
      if (open.length) throw new UserError(`Still to hand over: ${open.map((o) => `#${o.id}`).join(", ")}.`);
    }
    if (to === "consolidated" && inBatch.length === 0) throw new UserError("The batch is empty.");
    await tx.update(batches).set({ status: to, ...(to === "locked" ? { lockedAt: new Date() } : {}) }).where(eq(batches.id, id));
    await audit(tx, { actorId, action: `batch.${to}`, entityType: "batch", entityId: id, summary: `${b.code} → ${to}` });
  });
}

/** Item list for the forwarder, with the total estimated weight. */
export async function consolidationSummary(db: Db, id: string) {
  const data = await getBatch(db, id);
  if (!data) return null;
  const live = data.items.filter((i) => !["cancelled", "rejected"].includes(i.status));
  const totalG = live.reduce((s, i) => s + (i.finalWeightG ?? i.estWeightG ?? 0), 0);
  const lines = live.map(
    (i) => `#${i.id}  ${i.itemName} ×${i.quantity}  ${((i.finalWeightG ?? i.estWeightG ?? 0) / 1000).toFixed(2)} kg${i.finalWeightG ? "" : " (est.)"}${i.trackingNumber ? `  [${i.trackingNumber}]` : ""}`,
  );
  const text = [`${data.batch.code} — ${live.length} parcels — ~${(totalG / 1000).toFixed(2)} kg`, "", ...lines].join("\n");
  return { text, totalG, count: live.length };
}

async function weighInOrders(tx: Db, batchId: string): Promise<WeighInOrder[]> {
  const rows = await tx
    .select({ order: orders, paid: quotes.shippingEstimateMaxSen })
    .from(orders)
    .leftJoin(quotes, and(eq(quotes.orderId, orders.id), eq(quotes.status, "accepted")))
    .where(and(eq(orders.batchId, batchId), inArray(orders.status, ["ready_to_consolidate", "consolidated", "shipped", "arrived_my", "ready_for_pickup", "completed"])));
  return rows.map(({ order: o, paid }) => {
    const final = o.finalWeightG !== null;
    const parcel =
      o.finalWeightG !== null
        ? { weightG: o.finalWeightG, lengthMm: o.finalLengthMm ?? 0, widthMm: o.finalWidthMm ?? 0, heightMm: o.finalHeightMm ?? 0 }
        : o.estWeightG !== null
          ? { weightG: o.estWeightG, lengthMm: o.estLengthMm ?? 0, widthMm: o.estWidthMm ?? 0, heightMm: o.estHeightMm ?? 0 }
          : null;
    return { id: o.id, mode: o.shippingMode, parcel, parcelSource: final ? "final" : "estimate", paidSen: paid ?? 0, quotedMaxSen: paid ?? 0 };
  });
}

export interface WeighInInput {
  actualWeightG: number;
  actualCostFen: number;
  fxRate: string;
}

export async function weighInPreview(db: Db, id: string, input: WeighInInput) {
  const [b] = await db.select().from(batches).where(eq(batches.id, id));
  if (!b) throw new UserError("That batch no longer exists.");
  const [settings, rows] = await Promise.all([getSettings(db), weighInOrders(db, id)]);
  const preview = previewWeighIn(rows, { fxRate: parseFxRate(input.fxRate), settings, forwarder: b.forwarder ?? undefined });
  const costSen = Math.round((input.actualCostFen * parseFxRate(input.fxRate)) / 1_000_000);
  return { ...preview, batchCostSen: costSen, alreadyWeighed: b.weighedAt !== null };
}

/** Posts every order's shipping adjustment (once per batch) and records the batch's real weight and cost. */
export async function commitWeighIn(db: Db, actorId: string, id: string, input: WeighInInput) {
  return db.transaction(async (tx) => {
    const b = await lockBatchRow(tx, id);
    if (b.weighedAt) throw new UserError("This batch has already been weighed in.");
    if (!["locked", "consolidated", "shipped"].includes(b.status)) throw new UserError("Weigh in after locking and before arrival.");
    const settings = await getSettings(tx);
    const preview = previewWeighIn(await weighInOrders(tx, id), { fxRate: parseFxRate(input.fxRate), settings, forwarder: b.forwarder ?? undefined });
    for (const row of preview.rows) {
      const o = await lockOrder(tx, row.orderId);
      if (row.result.ledgerAmountSen !== 0) {
        await postLedger(tx, o, [{ type: "shipping_adjustment", amountSen: row.result.ledgerAmountSen, reference: `weigh-in:${b.code}` }], actorId);
      }
      await tx
        .update(orders)
        .set({ shippingBalanceDue: row.result.balanceDue || o.shippingBalanceDue, shippingRefundDue: row.result.refundDue || o.shippingRefundDue })
        .where(eq(orders.id, o.id));
      if (row.result.kind !== "none") {
        await noteOnOrder(tx, o, actorId, `Weigh-in: shipping ${formatMyr(row.actualSen)} vs ${formatMyr(row.paidSen)} paid → ${row.result.kind === "charge" ? `${formatMyr(row.result.ledgerAmountSen)} to pay` : `${formatMyr(-row.result.ledgerAmountSen)} credit`}`);
      }
    }
    await tx
      .update(batches)
      .set({ actualWeightG: input.actualWeightG, actualCostFen: input.actualCostFen, actualCostFxRate: input.fxRate, weighedAt: new Date() })
      .where(eq(batches.id, id));
    await audit(tx, {
      actorId,
      action: "batch.weigh_in",
      entityType: "batch",
      entityId: id,
      summary: `Weigh-in for ${b.code}: ${(input.actualWeightG / 1000).toFixed(2)} kg; charges ${formatMyr(preview.totals.chargeSen)}, credits ${formatMyr(preview.totals.creditSen)}`,
      data: { ...input, totals: preview.totals },
    });
    return preview.totals;
  });
}

export { lockDueBatches };
