// Students can only ever read their own orders, profiles and photos.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { batches, ledgerEntries, orders, orderStatusHistory, restrictedItems, users } from "../db/schema";
import { createTestDb, type TestDb } from "../db/testing";
import type { OrderFormInput } from "../domain/orderInput";
import { getProfile } from "./data/customer";
import { getOrderForCustomer, listOrdersForCustomer } from "./data/orders";
import { submitOrder } from "./orders/submit";

const ALICE = "aliceUserId0001";
const BOB = "bobUserId000002";
const ALICE_PHOTO = `photos/${ALICE}/123e4567-e89b-12d3-a456-426614174000.webp`;

let db: TestDb;
let close: () => Promise<void>;
const now = new Date("2026-10-14T02:00:00Z");

const top = { chest_cm: 96, shoulder_cm: 44, arm_length_cm: 62, body_length_cm: 70 };
const input = (over: Partial<OrderFormInput> = {}): OrderFormInput => ({
  pathType: "url",
  productUrl: "https://item.taobao.com/item.htm?id=1",
  itemName: "Canvas sneakers",
  quantity: 2,
  category: "clothing_top",
  details: top,
  variantText: "White / L",
  shippingMode: "air",
  contact: { displayName: "Alice Tan", phone: "012-345 6789", campus: "Main" },
  acceptTerms: true,
  ...over,
});

beforeAll(async () => {
  const t = await createTestDb();
  db = t.db;
  close = () => t.client.close();
  await db.insert(users).values([
    { id: ALICE, name: "Alice", email: "alice@example.com" },
    { id: BOB, name: "Bob", email: "bob@example.com" },
  ]);
  await db.insert(restrictedItems).values({ keyword: "power bank", appliesToModes: ["air"], note: "Lithium" });
  await db.insert(batches).values({ code: "Air #12", mode: "air", cutoffAt: new Date("2026-10-19T15:59:00Z") });
});

afterAll(async () => close());

describe("submitOrder", () => {
  it("stores the order, its first history row, the analytics snapshot and the profile", async () => {
    const r = await submitOrder(db, ALICE, input(), now);
    expect(r).toMatchObject({ ok: true, restricted: false, rerouted: false });
    if (!r.ok) return;

    const [o] = await db.select().from(orders).where(eq(orders.id, r.orderId));
    expect(o).toMatchObject({
      customerId: ALICE,
      itemName: "Canvas sneakers",
      platform: "taobao",
      status: "submitted",
      estWeightG: 700, // 350 g default × 2
      restrictedFlag: false,
    });
    expect(o.shippingChoiceSnapshot).toMatchObject({ chosen: "air", category: "clothing_top" });
    const air = o.shippingChoiceSnapshot!.options.find((x) => x.mode === "air")!;
    expect(air.etaDaysMin).toBe(6 + 7); // cutoff in ~5.6 days → 6, plus 7 days transit

    const history = await db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, r.orderId));
    expect(history).toMatchObject([{ fromStatus: null, toStatus: "submitted", actorId: ALICE }]);

    const profile = await getProfile(db, ALICE);
    expect(profile).toMatchObject({ displayName: "Alice Tan", phone: "+60123456789", campus: "Main" });
    // Saved per measurement now, so any category asking for chest etc. is prefilled.
    expect(profile!.savedMeasurements).toEqual(top);
  });

  it("holds restricted items for review without rejecting them", async () => {
    const r = await submitOrder(db, ALICE, input({ itemName: "Xiaomi power bank 20000mAh", category: "electronics", details: { model: "PB2", spec_notes: "20000mAh", voltage_plug_note: "USB-C" } }), now);
    expect(r).toMatchObject({ ok: true, restricted: true });
    if (!r.ok) return;
    const [o] = await db.select().from(orders).where(eq(orders.id, r.orderId));
    expect(o.restrictedFlag).toBe(true);
    expect(o.restrictedReason).toBe("power bank: Lithium");
  });

  it("returns field errors and stores nothing when a measurement is missing", async () => {
    const before = (await listOrdersForCustomer(db, ALICE)).length;
    const r = await submitOrder(db, ALICE, input({ details: { chest_cm: 96 } }), now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(["details.arm_length_cm", "details.body_length_cm", "details.shoulder_cm"]);
    expect((await listOrdersForCustomer(db, ALICE)).length).toBe(before);
  });

  it("refuses to attach another student's photo", async () => {
    const r = await submitOrder(
      db,
      BOB,
      input({ pathType: "reverse_search", productUrl: "", conditionPreference: "either", referencePhotoKeys: [ALICE_PHOTO], contact: { displayName: "Bob Lim", phone: "0198765432", campus: "" } }),
      now,
    );
    expect(r).toMatchObject({ ok: false, fieldErrors: { referencePhotoKeys: expect.stringMatching(/couldn't be found/) } });
  });

  it("records content-post reroutes in the history", async () => {
    const r = await submitOrder(db, BOB, input({ productUrl: "https://www.xiaohongshu.com/explore/abc", conditionPreference: "either", details: { ...top, chest_cm: 104 }, contact: { displayName: "Bob Lim", phone: "0198765432", campus: "" } }), now);
    expect(r).toMatchObject({ ok: true, rerouted: true });
    if (!r.ok) return;
    const [o] = await db.select().from(orders).where(eq(orders.id, r.orderId));
    expect(o).toMatchObject({ pathType: "reverse_search", platform: "rednote", customerId: BOB });
  });
});

describe("scoping", () => {
  it("lists only the student's own orders", async () => {
    const alice = await listOrdersForCustomer(db, ALICE);
    const bob = await listOrdersForCustomer(db, BOB);
    expect(alice.length).toBeGreaterThan(0);
    expect(bob.length).toBeGreaterThan(0);
    const aliceIds = new Set(alice.map((o) => o.id));
    expect(bob.some((o) => aliceIds.has(o.id))).toBe(false);
  });

  it("returns null for someone else's order, even by exact id", async () => {
    const [aliceOrder] = await listOrdersForCustomer(db, ALICE);
    expect(await getOrderForCustomer(db, ALICE, aliceOrder.id)).not.toBeNull();
    expect(await getOrderForCustomer(db, BOB, aliceOrder.id)).toBeNull();
    expect(await getOrderForCustomer(db, BOB, -1)).toBeNull();
    expect(await getOrderForCustomer(db, BOB, Number.NaN)).toBeNull();
  });

  it("never exposes admin-only fields to the student", async () => {
    const [aliceOrder] = await listOrdersForCustomer(db, ALICE);
    await db.update(orders).set({ internalNotes: "seller is slow" }).where(eq(orders.id, aliceOrder.id));
    const detail = await getOrderForCustomer(db, ALICE, aliceOrder.id);
    expect(detail!.order).not.toHaveProperty("internalNotes");
    expect(detail!.order).not.toHaveProperty("restrictedReason");
    expect(detail!.order).not.toHaveProperty("customerId");
  });

  it("computes the balance only from the student's own ledger entries", async () => {
    const [aliceOrder] = await listOrdersForCustomer(db, ALICE);
    await db.insert(ledgerEntries).values([
      { orderId: aliceOrder.id, customerId: ALICE, type: "service_fee", amountSen: 600 },
      { orderId: aliceOrder.id, customerId: ALICE, type: "shipping_adjustment", amountSen: -200 },
    ]);
    const detail = await getOrderForCustomer(db, ALICE, aliceOrder.id);
    expect(detail!.balance).toEqual({ balanceSen: 400, owedSen: 400, creditSen: 0 });
  });

  it("keeps profiles separate", async () => {
    const alice = await getProfile(db, ALICE);
    const bob = await getProfile(db, BOB);
    expect(alice!.phone).toBe("+60123456789");
    expect(bob!.phone).toBe("+60198765432");
    expect(alice!.savedMeasurements).toMatchObject({ chest_cm: 96 });
    expect(bob!.savedMeasurements).toMatchObject({ chest_cm: 104 });
    expect(await getProfile(db, "nobodyUserId0000")).toBeNull();
  });
});
