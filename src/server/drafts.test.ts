// The cart: saved drafts, scoped to their owner, submitted as real orders.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderDrafts, orders, users } from "../db/schema";
import { createTestDb, type TestDb } from "../db/testing";
import { MAX_DRAFTS } from "../domain/drafts";
import { countDrafts, deleteDraft, getDraft, listDrafts, saveDraft, submitDraft } from "./drafts";
import { deleteStaleDrafts } from "./jobs/draftCleanup";

const ALICE = "aliceUserId0001";
const BOB = "bobUserId000002";
const now = new Date("2026-10-30T02:00:00Z");

const complete = {
  pathType: "url",
  productUrl: "https://item.taobao.com/item.htm?id=1",
  itemName: "Canvas sneakers",
  quantity: 1,
  category: "clothing_top",
  details: { height_cm: 172, weight_kg: 63, chest_cm: 96, shoulder_cm: 44, arm_length_cm: 62, body_length_cm: 70 },
  variantText: "White / L",
  shippingMode: "air",
  contact: { displayName: "Alice Tan", phone: "012-345 6789", campus: "Main" },
};

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  const t = await createTestDb();
  db = t.db;
  close = () => t.client.close();
  await db.insert(users).values([
    { id: ALICE, name: "Alice", email: "alice@example.com" },
    { id: BOB, name: "Bob", email: "bob@example.com" },
  ]);
}, 60_000);

afterAll(async () => close());

describe("cart", () => {
  it("saves, updates and lists a student's drafts, newest first", async () => {
    const first = await saveDraft(db, ALICE, null, { pathType: "url", itemName: "Hoodie", acceptTerms: true });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await saveDraft(db, ALICE, null, { pathType: "reverse_search" });
    if (!second.ok) throw new Error("save failed");
    const updated = await saveDraft(db, ALICE, first.id, { pathType: "url", itemName: "Hoodie, black" });
    expect(updated).toEqual({ ok: true, id: first.id });

    const list = await listDrafts(db, ALICE);
    expect(list.map((d) => d.id)).toEqual([first.id, second.id]);
    expect(list[0].data).toEqual({ pathType: "url", itemName: "Hoodie, black" });
    expect(list[0].data).not.toHaveProperty("acceptTerms");
    await deleteDraft(db, ALICE, first.id);
    await deleteDraft(db, ALICE, second.id);
  });

  it("never shows, changes, removes or submits another student's draft", async () => {
    const mine = await saveDraft(db, ALICE, null, complete);
    if (!mine.ok) throw new Error("save failed");
    expect(await getDraft(db, BOB, mine.id)).toBeNull();
    expect(await listDrafts(db, BOB)).toEqual([]);
    expect(await deleteDraft(db, BOB, mine.id)).toBe(false);
    // Bob "updating" Alice's id makes a new draft of his own; Alice's is untouched.
    const bobs = await saveDraft(db, BOB, mine.id, { itemName: "Bob's" });
    expect(bobs.ok && bobs.id).not.toBe(mine.id);
    expect((await getDraft(db, ALICE, mine.id))!.data).toMatchObject({ itemName: "Canvas sneakers" });
    expect(await submitDraft(db, BOB, mine.id, now)).toMatchObject({ ok: false, formError: expect.stringMatching(/no longer in your cart/) });
    await deleteDraft(db, ALICE, mine.id);
    if (bobs.ok) await deleteDraft(db, BOB, bobs.id);
  });

  it("submits a complete draft as an order and takes it out of the cart", async () => {
    const d = await saveDraft(db, ALICE, null, complete);
    if (!d.ok) throw new Error("save failed");
    const r = await submitDraft(db, ALICE, d.id, now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [order] = await db.select().from(orders).where(eq(orders.id, r.orderId));
    expect(order).toMatchObject({ customerId: ALICE, itemName: "Canvas sneakers" });
    expect(await getDraft(db, ALICE, d.id)).toBeNull();
  });

  it("keeps an incomplete draft in the cart and says what's missing", async () => {
    const d = await saveDraft(db, ALICE, null, { ...complete, details: { chest_cm: 96 } });
    if (!d.ok) throw new Error("save failed");
    const r = await submitDraft(db, ALICE, d.id, now);
    expect(r).toMatchObject({ ok: false, fieldErrors: { "details.height_cm": expect.any(String) } });
    expect(await getDraft(db, ALICE, d.id)).not.toBeNull();
    await deleteDraft(db, ALICE, d.id);
  });

  it(`holds at most ${MAX_DRAFTS} items, and refuses junk`, async () => {
    for (let i = 0; i < MAX_DRAFTS; i++) expect((await saveDraft(db, BOB, null, { itemName: `Item ${i}` })).ok).toBe(true);
    expect(await saveDraft(db, BOB, null, { itemName: "one too many" })).toMatchObject({ ok: false, error: expect.stringMatching(/full/) });
    expect(await countDrafts(db, BOB)).toBe(MAX_DRAFTS);
    expect(await saveDraft(db, BOB, null, "not a form")).toMatchObject({ ok: false });
    await db.delete(orderDrafts).where(eq(orderDrafts.customerId, BOB));
  });

  it("clears out drafts nobody has touched for 90 days", async () => {
    const old = await saveDraft(db, ALICE, null, { itemName: "Old" });
    const fresh = await saveDraft(db, ALICE, null, { itemName: "Fresh" });
    if (!old.ok || !fresh.ok) throw new Error("save failed");
    // Raw SQL: Drizzle's $onUpdate would stamp an update with the current time.
    await db.execute(sql`UPDATE order_drafts SET updated_at = ${new Date(now.getTime() - 91 * 86_400_000).toISOString()} WHERE id = ${old.id}`);
    expect(await deleteStaleDrafts(db, now)).toBe(1);
    expect(await getDraft(db, ALICE, old.id)).toBeNull();
    expect(await getDraft(db, ALICE, fresh.id)).not.toBeNull();
  });
});
