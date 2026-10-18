// Batches: auto-lock, extend/roll, consolidation, the status chain and the weigh-in.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { batches, ledgerEntries, orders, quotes, users } from "../db/schema";
import { createTestDb, publishedVersionId, type TestDb } from "../db/testing";
import { balanceOf } from "../domain/ledger";
import { addOrdersToBatch, advanceBatch, commitWeighIn, consolidationSummary, extendBatch, rollBatch, saveBatch, weighInPreview } from "./admin/batches";
import { lockDueBatches } from "./jobs/batchLock";

const ADMIN = "adminUserId0001";
const STUDENT = "studentUserId01";
let db: TestDb;
let close: () => Promise<void>;
let version: string;

const day = 86_400_000;
const batch = (code: string, cutoffOffsetDays: number, minOrders = 2, mode: "air" | "sea" = "air") =>
  saveBatch(db, ADMIN, null, { code, mode, cutoffAt: new Date(Date.now() + cutoffOffsetDays * day), minOrders, pickupStartsAt: null, pickupEndsAt: null, forwarder: "default", notes: null });

async function readyOrder(over: Partial<typeof orders.$inferInsert> = {}) {
  const [o] = await db
    .insert(orders)
    .values({
      customerId: STUDENT,
      itemName: "Linen shirt",
      pathType: "url",
      platform: "taobao",
      productUrl: "https://item.taobao.com/item.htm?id=5",
      categoryVersionId: version,
      shippingMode: "air",
      status: "ready_to_consolidate",
      estWeightG: 800,
      estLengthMm: 300,
      estWidthMm: 200,
      estHeightMm: 100,
      ...over,
    })
    .returning();
  // An accepted quote that collected RM20 for shipping.
  await db.insert(quotes).values({
    orderId: o.id,
    itemPriceFen: 10000,
    fxRate: "0.650000",
    itemPriceSen: 6500,
    serviceFeeSen: 600,
    shippingEstimateMinSen: 1500,
    shippingEstimateMaxSen: 2000,
    totalMinSen: 8600,
    totalMaxSen: 9100,
    status: "accepted",
    expiresAt: new Date(Date.now() + day),
  });
  return o.id;
}

beforeAll(async () => {
  const t = await createTestDb();
  db = t.db;
  close = () => t.client.close();
  version = await publishedVersionId(db, "clothing_top");
  await db.insert(users).values([
    { id: ADMIN, name: "Admin", email: "a@example.com", role: "admin" },
    { id: STUDENT, name: "S", email: "s@example.com" },
  ]);
});

afterAll(async () => close());

describe("auto-lock, extend and roll", () => {
  it("locks past-cutoff batches and flags the ones below minimum", async () => {
    const past = await batch("Air #1", -1);
    await batch("Air #2", 5);
    await addOrdersToBatch(db, ADMIN, past, [await readyOrder()]);

    const locked = await lockDueBatches(db);
    expect(locked).toEqual([{ code: "Air #1", orderCount: 1, minOrders: 2, belowMin: true }]);
    const [b] = await db.select().from(batches).where(eq(batches.id, past));
    expect(b.status).toBe("locked");
    expect(b.belowMinAlertAt).not.toBeNull();

    await extendBatch(db, ADMIN, past);
    const [extended] = await db.select().from(batches).where(eq(batches.id, past));
    expect(extended.status).toBe("open");
    expect(extended.belowMinAlertAt).toBeNull();
    expect(extended.cutoffAt.getTime()).toBeGreaterThan(Date.now() + 47 * 3_600_000);
  });

  it("rolls orders into the next open batch of the same mode", async () => {
    const early = await batch("Sea #1", 1, 2, "sea");
    const later = await batch("Sea #2", 9, 2, "sea");
    await batch("Sea #0", -3, 2, "sea"); // earlier, so not a candidate
    const id = await readyOrder({ shippingMode: "sea" });
    await addOrdersToBatch(db, ADMIN, early, [id]);
    expect(await rollBatch(db, ADMIN, early)).toEqual({ moved: 1, into: "Sea #2" });
    expect((await db.select().from(orders).where(eq(orders.id, id)))[0].batchId).toBe(later);
    expect(await db.select().from(batches).where(eq(batches.id, early))).toEqual([]);
  });
});

describe("consolidate → ship → weigh-in → arrive → distribute", () => {
  it("moves the orders with the batch and posts each shipping adjustment once", async () => {
    const id = await batch("Air #9", 3, 1);
    const light = await readyOrder({ finalWeightG: 300, finalLengthMm: 200, finalWidthMm: 150, finalHeightMm: 50 });
    const pending = await readyOrder({ status: "qc_review" });
    await addOrdersToBatch(db, ADMIN, id, [light, pending]);

    await advanceBatch(db, ADMIN, id, "locked");
    await expect(advanceBatch(db, ADMIN, id, "consolidated")).rejects.toThrow(new RegExp(`#${pending}`));
    await db.update(orders).set({ status: "ready_to_consolidate" }).where(eq(orders.id, pending));
    await expect(advanceBatch(db, ADMIN, id, "shipped")).rejects.toThrow(/can't become shipped/);
    await advanceBatch(db, ADMIN, id, "consolidated");
    expect((await db.select().from(orders).where(eq(orders.id, light)))[0].status).toBe("consolidated");

    expect((await consolidationSummary(db, id))!.text).toMatch(/2 parcels/);

    const input = { actualWeightG: 1200, actualCostFen: 3000, fxRate: "0.650000" };
    const preview = await weighInPreview(db, id, input);
    const lightRow = preview.rows.find((r) => r.orderId === light)!;
    expect(lightRow).toMatchObject({ parcelSource: "final", result: { kind: "credit" } });
    expect(preview.rows.find((r) => r.orderId === pending)!.parcelSource).toBe("estimate");

    await commitWeighIn(db, ADMIN, id, input);
    await expect(commitWeighIn(db, ADMIN, id, input)).rejects.toThrow(/already been weighed/);
    const entries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.orderId, light));
    expect(entries.map((e) => e.type)).toEqual(["shipping_adjustment"]);
    expect(balanceOf(entries).balanceSen).toBe(lightRow.result.ledgerAmountSen);
    expect((await db.select().from(orders).where(eq(orders.id, light)))[0].shippingRefundDue).toBe(true);

    await advanceBatch(db, ADMIN, id, "shipped");
    await advanceBatch(db, ADMIN, id, "arrived");
    expect((await db.select().from(orders).where(eq(orders.id, light)))[0].status).toBe("arrived_my");
    await expect(advanceBatch(db, ADMIN, id, "distributed")).rejects.toThrow(/Still to hand over/);
    await db.update(orders).set({ status: "completed" }).where(eq(orders.batchId, id));
    await advanceBatch(db, ADMIN, id, "distributed");
  });

  it("refuses orders of another mode", async () => {
    const id = await batch("Air #10", 3);
    const sea = await readyOrder({ shippingMode: "sea" });
    await expect(addOrdersToBatch(db, ADMIN, id, [sea])).rejects.toThrow(/ships by sea/);
  });
});
