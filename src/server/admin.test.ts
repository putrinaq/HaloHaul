// The order lifecycle through the admin and student operations, on a real
// (in-process) Postgres: board actions, money, sourcing, quotes, QC, batches,
// cancellations and refunds.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { batches, customerProfiles, ledgerEntries, orders, orderStatusHistory, payments, quotes, users } from "../db/schema";
import { createTestDb, publishedVersionId, type TestDb } from "../db/testing";
import { balanceOf } from "../domain/ledger";
import { actionBoardPage, getOrderForAdmin, listActionQueue } from "./data/admin";
import { UserError } from "./errors";
import {
  advanceOrder,
  assignBatch,
  cancelOrder,
  clearRestricted,
  confirmPayment,
  issueRefund,
  markFeePaid,
  recordPayment,
  recordQc,
  rejectPayment,
  saveSourcingOption,
  sendQuote,
  sendSourcingOptions,
} from "./orders/adminOps";
import { acceptQuote, cancelOwnOrder, declineQuote, selectSourcingOption, submitPaymentProof } from "./orders/studentOps";

const STUDENT = "studentUserId01";
const OTHER = "otherUserId0002";
const ADMIN = "adminUserId0001";
const PROOF = `photos/${STUDENT}/123e4567-e89b-12d3-a456-426614174000.webp`;

let db: TestDb;
let close: () => Promise<void>;
let topVersion: string;

type NewOrder = typeof orders.$inferInsert;
const base = (): NewOrder => ({
  customerId: STUDENT,
  itemName: "Canvas sneakers",
  pathType: "url",
  platform: "taobao",
  productUrl: "https://item.taobao.com/item.htm?id=1",
  categoryVersionId: topVersion,
  shippingMode: "air",
});

/** Inserts an order whose current status started `at`. */
async function addOrder(over: Partial<NewOrder>, at = "2026-10-12T00:00:00Z") {
  const [o] = await db.insert(orders).values({ ...base(), ...over }).returning({ id: orders.id, status: orders.status });
  await db.insert(orderStatusHistory).values({ orderId: o.id, toStatus: o.status, createdAt: new Date(at) });
  return o.id;
}

const statusOf = async (id: number) => (await db.select({ s: orders.status }).from(orders).where(eq(orders.id, id)))[0].s;
const ledgerOf = (id: number) => db.select().from(ledgerEntries).where(eq(ledgerEntries.orderId, id));
const actionOf = async (id: number) => (await getOrderForAdmin(db, id))!.action;

const quoteInput = (orderId: number) => ({
  orderId,
  itemPriceFen: 20000, // ¥200
  fxRate: "0.650000",
  serviceFeeSen: 600,
  shippingMode: "air" as const,
  sellerConfirmed: true,
  parcel: { weightG: 800, lengthMm: 300, widthMm: 200, heightMm: 100 },
  deliveryFeeSen: 0,
});

beforeAll(async () => {
  const t = await createTestDb();
  db = t.db;
  close = () => t.client.close();
  topVersion = await publishedVersionId(db, "clothing_top");
  await db.insert(users).values([
    { id: STUDENT, name: "student account", email: "s@example.com" },
    { id: OTHER, name: "Other", email: "o@example.com" },
    { id: ADMIN, name: "Admin", email: "a@example.com", role: "admin" },
  ]);
  await db.insert(customerProfiles).values({ userId: STUDENT, displayName: "Ahmad Nazri" });
});

afterAll(async () => close());

describe("the board", () => {
  it("lists only orders waiting on the admin, oldest first, with the category and profile name", async () => {
    const newer = await addOrder({ itemName: "Newer" }, "2026-10-17T00:00:00Z");
    const older = await addOrder({ itemName: "Older", status: "paid" }, "2026-10-10T00:00:00Z");
    await addOrder({ itemName: "Waiting on student", status: "quote_sent" }, "2026-10-01T00:00:00Z");

    const queue = (await listActionQueue(db)).filter((q) => [newer, older].includes(q.id));
    expect(queue.map((q) => q.id)).toEqual([older, newer]);
    expect(queue[0]).toMatchObject({
      customerName: "Ahmad Nazri",
      categoryName: "Clothing — top",
      action: { kind: "advance", label: "Mark bought", to: "order_submitted" },
    });
    const page = await actionBoardPage(db, "url", 1, new Date("2026-10-18T00:00:00Z"));
    expect(page.counts.all).toBeGreaterThanOrEqual(2);
    expect(page.items.every((i) => i.pathType === "url" && (i.status === "submitted" || i.status === "sourcing"))).toBe(true);
  });
});

describe("link order: quote → accept → pay → confirm", () => {
  it("runs end to end and settles the balance", async () => {
    const id = await addOrder({});
    expect(await actionOf(id)).toMatchObject({ dialog: "quote" });

    const { totalMaxSen } = await sendQuote(db, ADMIN, quoteInput(id));
    expect(await statusOf(id)).toBe("quote_sent");
    const [q] = await db.select().from(quotes).where(eq(quotes.orderId, id));
    expect(q).toMatchObject({ status: "sent", itemPriceSen: 13000, serviceFeeSen: 600, totalMaxSen });
    expect(q.shippingEstimateMaxSen).toBeGreaterThan(q.shippingEstimateMinSen);

    // A revised quote replaces the open one.
    await sendQuote(db, ADMIN, { ...quoteInput(id), serviceFeeSen: 500 });
    const qs = await db.select().from(quotes).where(eq(quotes.orderId, id));
    expect(qs.filter((x) => x.status === "sent")).toHaveLength(1);
    expect(qs.filter((x) => x.status === "expired")).toHaveLength(1);

    await expect(acceptQuote(db, OTHER, { orderId: id })).rejects.toThrow(UserError);
    await acceptQuote(db, STUDENT, { orderId: id });
    expect(await statusOf(id)).toBe("awaiting_payment");
    const owed = balanceOf(await ledgerOf(id)).owedSen;
    expect(owed).toBe(totalMaxSen - 100);

    await submitPaymentProof(db, STUDENT, { orderId: id, purpose: "order", amountSen: owed, proofKey: PROOF, reference: "DN123" });
    await expect(submitPaymentProof(db, STUDENT, { orderId: id, purpose: "order", amountSen: owed, proofKey: PROOF, reference: null })).rejects.toThrow(
      /already have a proof/,
    );
    expect(await actionOf(id)).toMatchObject({ dialog: "payment", label: "Confirm payment" });

    const [pay] = await db.select().from(payments).where(eq(payments.orderId, id));
    await confirmPayment(db, ADMIN, { paymentId: pay.id });
    expect(await statusOf(id)).toBe("paid");
    expect(balanceOf(await ledgerOf(id)).balanceSen).toBe(0);
    await expect(confirmPayment(db, ADMIN, { paymentId: pay.id })).rejects.toThrow(/already handled/);
  });

  it("lets the student decline (cancelling the order) and refuses a proof under another student's key", async () => {
    const id = await addOrder({});
    await sendQuote(db, ADMIN, quoteInput(id));
    await declineQuote(db, STUDENT, { orderId: id });
    expect(await statusOf(id)).toBe("cancelled");

    const id2 = await addOrder({ status: "awaiting_payment" });
    await expect(
      submitPaymentProof(db, STUDENT, { orderId: id2, purpose: "order", amountSen: 100, proofKey: `photos/${OTHER}/123e4567-e89b-12d3-a456-426614174000.webp`, reference: null }),
    ).rejects.toThrow(/Upload the screenshot again/);
  });

  it("records a payment received without a proof and moves the order to paid once settled", async () => {
    const id = await addOrder({});
    await sendQuote(db, ADMIN, quoteInput(id));
    await acceptQuote(db, STUDENT, { orderId: id });
    const owed = balanceOf(await ledgerOf(id)).owedSen;
    await recordPayment(db, ADMIN, { orderId: id, purpose: "order", amountSen: owed - 100, reference: "cash" });
    expect(await statusOf(id)).toBe("awaiting_payment"); // still RM1 short
    await recordPayment(db, ADMIN, { orderId: id, purpose: "order", amountSen: 100, reference: "cash" });
    expect(await statusOf(id)).toBe("paid");
  });

  it("rejecting a proof records the reason", async () => {
    const id = await addOrder({ status: "awaiting_payment" });
    await submitPaymentProof(db, STUDENT, { orderId: id, purpose: "order", amountSen: 999, proofKey: PROOF, reference: null });
    const [pay] = await db.select().from(payments).where(eq(payments.orderId, id));
    await rejectPayment(db, ADMIN, { paymentId: pay.id, reason: "Amount doesn't match" });
    const [after] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(after).toMatchObject({ status: "failed", rejectionReason: "Amount doesn't match" });
  });
});

describe("photo search: fee → options → pick → quote with credit", () => {
  it("credits the paid fee and waits for the student's pick", async () => {
    const id = await addOrder({ pathType: "reverse_search", productUrl: null, conditionPreference: "either" });
    expect(await actionOf(id)).toMatchObject({ label: "Mark fee paid" });
    await expect(saveSourcingOption(db, ADMIN, { orderId: id, title: "x", url: "https://a.b", priceFen: 1, isRecommended: false })).rejects.toThrow(/fee/);

    await markFeePaid(db, ADMIN, { orderId: id, amountSen: 400, reference: null });
    // Older orders get the fee charge posted on the way, so the payment nets to zero.
    expect(balanceOf(await ledgerOf(id)).balanceSen).toBe(0);
    expect(await actionOf(id)).toMatchObject({ label: "Add options" });

    for (const [i, title] of ["Same dress, seller A", "Similar dress, cheaper"].entries()) {
      await saveSourcingOption(db, ADMIN, { orderId: id, title, url: `https://item.taobao.com/item.htm?id=${i}`, priceFen: 15000 - i * 3000, isRecommended: i === 0 });
    }
    expect(await statusOf(id)).toBe("sourcing");
    await sendSourcingOptions(db, ADMIN, { orderId: id });
    expect(await actionOf(id)).toBeNull(); // waiting on the student

    const detail = await getOrderForAdmin(db, id);
    await selectSourcingOption(db, STUDENT, { orderId: id, optionId: detail!.options[1].id });
    expect(await actionOf(id)).toMatchObject({ label: "Send quote" });

    await sendQuote(db, ADMIN, quoteInput(id));
    const [q] = await db.select().from(quotes).where(and(eq(quotes.orderId, id), eq(quotes.status, "sent")));
    expect(q.feeCreditSen).toBe(400);
    expect(q.sourcingOptionId).toBe(detail!.options[1].id);
  });
});

describe("restricted items", () => {
  it("can't be quoted until cleared", async () => {
    const id = await addOrder({ restrictedFlag: true, restrictedReason: "battery" });
    expect(await actionOf(id)).toMatchObject({ dialog: "restricted" });
    await expect(sendQuote(db, ADMIN, quoteInput(id))).rejects.toThrow(/restricted/);
    await clearRestricted(db, ADMIN, { orderId: id, note: "No battery" });
    await sendQuote(db, ADMIN, quoteInput(id));
    expect(await statusOf(id)).toBe("quote_sent");
  });
});

describe("warehouse to batch", () => {
  it("records QC, approves it and adds the order to a batch of the same mode", async () => {
    const id = await addOrder({ status: "paid" });
    expect((await advanceOrder(db, { orderId: id, expectFrom: "paid", to: "order_submitted", actorId: ADMIN })).ok).toBe(true);
    expect((await advanceOrder(db, { orderId: id, expectFrom: "order_submitted", to: "at_warehouse", actorId: ADMIN })).ok).toBe(true);
    expect(await actionOf(id)).toMatchObject({ dialog: "qc" });

    await recordQc(db, ADMIN, { orderId: id, arrivedAt: new Date(), finalWeightG: 900, finalLengthMm: 300, finalWidthMm: 200, finalHeightMm: 100, qcPhotoKeys: [], qcNotes: "OK" });
    expect(await statusOf(id)).toBe("qc_review");
    await expect(recordQc(db, ADMIN, { orderId: id, arrivedAt: new Date(), finalWeightG: 1, finalLengthMm: null, finalWidthMm: null, finalHeightMm: null, qcPhotoKeys: ["photos/x/evil.webp"], qcNotes: null })).rejects.toThrow(/QC photos/);

    expect((await advanceOrder(db, { orderId: id, expectFrom: "qc_review", to: "ready_to_consolidate", actorId: ADMIN })).ok).toBe(true);
    expect(await actionOf(id)).toMatchObject({ dialog: "batch" });

    const [sea] = await db.insert(batches).values({ code: "Sea #1", mode: "sea", cutoffAt: new Date("2026-11-01") }).returning();
    const [air] = await db.insert(batches).values({ code: "Air #1", mode: "air", cutoffAt: new Date("2026-11-01") }).returning();
    await expect(assignBatch(db, ADMIN, { orderId: id, batchId: sea.id })).rejects.toThrow(/ships by air/);
    await assignBatch(db, ADMIN, { orderId: id, batchId: air.id });
    expect(await actionOf(id)).toBeNull(); // moves with the batch from here
  });

  it("refuses a stale card and steps the board doesn't offer", async () => {
    const id = await addOrder({ status: "at_warehouse" });
    expect(await advanceOrder(db, { orderId: id, expectFrom: "paid", to: "order_submitted", actorId: ADMIN })).toEqual({ ok: false, error: "stale", current: "at_warehouse" });
    // QC needs the drawer, not a one-tap jump.
    expect(await advanceOrder(db, { orderId: id, expectFrom: "at_warehouse", to: "qc_review", actorId: ADMIN })).toMatchObject({ ok: false, error: "not_offered" });
    const sub = await addOrder({});
    expect(await advanceOrder(db, { orderId: sub, expectFrom: "submitted", to: "rejected", actorId: ADMIN })).toMatchObject({ ok: false, error: "not_offered" });
    expect(await advanceOrder(db, { orderId: 999_999, expectFrom: "paid", to: "order_submitted", actorId: ADMIN })).toEqual({ ok: false, error: "not_found" });
  });

  it("won't release a parcel with a shipping balance owed", async () => {
    const id = await addOrder({ status: "arrived_my", shippingBalanceDue: true });
    expect(await actionOf(id)).toMatchObject({ dialog: "balance" });
    expect(await advanceOrder(db, { orderId: id, expectFrom: "arrived_my", to: "ready_for_pickup", actorId: ADMIN })).toMatchObject({ ok: false, error: "not_offered" });
  });
});

describe("cancellations and refunds", () => {
  it("reverses a paid order into a credit, then records the bank transfer", async () => {
    const id = await addOrder({});
    await sendQuote(db, ADMIN, quoteInput(id));
    await acceptQuote(db, STUDENT, { orderId: id });
    const owed = balanceOf(await ledgerOf(id)).owedSen;
    await submitPaymentProof(db, STUDENT, { orderId: id, purpose: "order", amountSen: owed, proofKey: PROOF, reference: null });
    const [pay] = await db.select().from(payments).where(and(eq(payments.orderId, id), eq(payments.status, "pending")));
    await confirmPayment(db, ADMIN, { paymentId: pay.id });

    await cancelOrder(db, ADMIN, { orderId: id, reason: "Seller out of stock" });
    expect(await statusOf(id)).toBe("cancelled");
    expect(balanceOf(await ledgerOf(id)).creditSen).toBe(owed);
    expect(await actionOf(id)).toMatchObject({ dialog: "refund", label: "Issue refund/credit" });

    await expect(issueRefund(db, ADMIN, { customerId: STUDENT, orderId: id, amountSen: owed + 1, method: "bank_transfer", reason: "x", fromExistingCredit: true })).rejects.toThrow(/only has/);
    await issueRefund(db, ADMIN, { customerId: STUDENT, orderId: id, amountSen: owed, method: "bank_transfer", reason: "Out of stock", fromExistingCredit: true });
    expect(balanceOf(await ledgerOf(id)).balanceSen).toBe(0);
    expect(await actionOf(id)).toBeNull();
  });

  it("lets a student cancel before buying but not after", async () => {
    const early = await addOrder({ status: "quote_sent" });
    await cancelOwnOrder(db, STUDENT, { orderId: early, reason: null });
    expect(await statusOf(early)).toBe("cancelled");
    const bought = await addOrder({ status: "order_submitted" });
    await expect(cancelOwnOrder(db, STUDENT, { orderId: bought, reason: null })).rejects.toThrow(/bought/);
    await expect(cancelOwnOrder(db, OTHER, { orderId: early, reason: null })).rejects.toThrow(/wasn't found/);
  });

  it("issues a goodwill credit as a new ledger entry", async () => {
    const id = await addOrder({ status: "completed" });
    await issueRefund(db, ADMIN, { customerId: STUDENT, orderId: id, amountSen: 500, method: "credit_balance", reason: "Late delivery", fromExistingCredit: false });
    const entries = await ledgerOf(id);
    expect(entries.map((e) => [e.type, e.amountSen])).toEqual([["refund", -500]]);
  });
});
