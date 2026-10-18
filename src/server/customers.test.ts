// Customers (incl. the PDPA delete), showcase products and the dashboard query.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accounts, customerProfiles, ledgerEntries, orders, quotes, sessions, users } from "../db/schema";
import { createTestDb, publishedVersionId, type TestDb } from "../db/testing";
import { anonymiseCustomer, getCustomer, listCustomers, updateCustomerMeasurements } from "./admin/customers";
import { dashboard } from "./admin/dashboard";
import { createFromOrder, saveProduct, setPublished } from "./admin/products";
import { MemoryStore } from "./storage";

const ADMIN = "adminUserId0001";
const AINA = "ainaUserId00001";
let db: TestDb;
let close: () => Promise<void>;
let version: string;
const photo = `photos/${AINA}/123e4567-e89b-12d3-a456-426614174000.webp`;

async function order(status: (typeof orders.$inferInsert)["status"]) {
  const [o] = await db
    .insert(orders)
    .values({
      customerId: AINA,
      itemName: "Linen shirt",
      pathType: "url",
      platform: "taobao",
      productUrl: "https://item.taobao.com/item.htm?id=7",
      categoryVersionId: version,
      details: { chest_cm: 90 },
      remarks: "Ship to my hostel",
      referencePhotoKeys: [photo],
      shippingMode: "air",
      status,
    })
    .returning();
  return o.id;
}

beforeAll(async () => {
  const t = await createTestDb();
  db = t.db;
  close = () => t.client.close();
  version = await publishedVersionId(db, "clothing_top");
  await db.insert(users).values([
    { id: ADMIN, name: "Admin", email: "a@example.com", role: "admin" },
    { id: AINA, name: "aina", email: "aina@example.com" },
  ]);
  await db.insert(customerProfiles).values({ userId: AINA, displayName: "Aina Rahman", phone: "+60123456789", campus: "Main", savedMeasurements: { chest_cm: 90 } });
  await db.insert(sessions).values({ id: "s1", token: "t1", userId: AINA, expiresAt: new Date(Date.now() + 86_400_000) });
  await db.insert(accounts).values({ id: "a1", accountId: AINA, providerId: "credential", userId: AINA, password: "x" });
});

afterAll(async () => close());

describe("customers", () => {
  it("lists and searches with order counts and balances", async () => {
    const id = await order("completed");
    await db.insert(ledgerEntries).values({ orderId: id, customerId: AINA, type: "refund", amountSen: -500, reference: "goodwill" });
    const { rows } = await listCustomers(db, "rahman", 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Aina Rahman", orderCount: 1, balanceSen: -500 });
    expect((await listCustomers(db, "nobody", 1)).rows).toHaveLength(0);
  });

  it("lets the admin correct saved measurements, validated against the library", async () => {
    await expect(updateCustomerMeasurements(db, ADMIN, AINA, { chest_cm: 999 })).rejects.toThrow(/highlighted/);
    await updateCustomerMeasurements(db, ADMIN, AINA, { chest_cm: 92, waist_cm: 70 });
    expect((await getCustomer(db, AINA))!.profile!.savedMeasurements).toEqual({ chest_cm: 92, waist_cm: 70 });
  });

  it("won't anonymise while an order is in progress, then clears personal data but keeps the books", async () => {
    const open = await order("paid");
    const store = new MemoryStore();
    await store.put(photo, new Uint8Array([1]), "image/webp");
    await expect(anonymiseCustomer(db, ADMIN, AINA, store)).rejects.toThrow(/in progress/);
    await db.update(orders).set({ status: "completed" }).where(eq(orders.id, open));

    await anonymiseCustomer(db, ADMIN, AINA, store);
    const [u] = await db.select().from(users).where(eq(users.id, AINA));
    expect(u.name).toBe("Deleted customer");
    expect(u.email).toMatch(/@anonymised\.invalid$/);
    const [p] = await db.select().from(customerProfiles).where(eq(customerProfiles.userId, AINA));
    expect(p).toMatchObject({ displayName: "Deleted customer", phone: null, campus: null, savedMeasurements: {} });
    expect(p.anonymisedAt).not.toBeNull();
    const kept = await db.select().from(orders).where(eq(orders.customerId, AINA));
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((o) => Object.keys(o.details).length === 0 && o.remarks === null && o.referencePhotoKeys.length === 0)).toBe(true);
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.customerId, AINA))).toHaveLength(1);
    expect(await db.select().from(sessions).where(eq(sessions.userId, AINA))).toEqual([]);
    expect(await db.select().from(accounts).where(eq(accounts.userId, AINA))).toEqual([]);
    expect(store.objects.has(photo)).toBe(false);
  });
});

describe("products", () => {
  it("prefills from a completed order and won't publish without a photo", async () => {
    const [o] = await db.select().from(orders).where(eq(orders.status, "completed")).limit(1);
    await db.insert(quotes).values({
      orderId: o.id,
      itemPriceFen: 10000,
      fxRate: "0.650000",
      itemPriceSen: 6500,
      serviceFeeSen: 600,
      shippingEstimateMinSen: 900,
      shippingEstimateMaxSen: 1200,
      totalMinSen: 8000,
      totalMaxSen: 8300,
      status: "accepted",
      expiresAt: new Date(),
    });
    const draft = await createFromOrder(db, o.id);
    expect(draft).toMatchObject({ title: "Linen shirt", category: "clothing_top", halohaulPriceSen: 8300, sourceOrderId: o.id });
    await expect(saveProduct(db, ADMIN, null, { ...draft, photoKey: null, retailCheckedAt: null, isPublished: true, sortOrder: 0 })).rejects.toThrow(/photo/);
    const id = await saveProduct(db, ADMIN, null, { ...draft, retailPriceSen: 15000, photoKey: null, retailCheckedAt: new Date(), isPublished: false, sortOrder: 0 });
    await expect(setPublished(db, ADMIN, id, true)).rejects.toThrow(/photo/);
    await expect(createFromOrder(db, 999_999)).rejects.toThrow(/wasn't found/);
  });
});

describe("dashboard", () => {
  it("runs on an almost empty database", async () => {
    const d = await dashboard(db, new Date());
    expect(d).toMatchObject({ pendingPayments: 0, air: null, sea: null });
    expect(d.activity.length).toBeGreaterThan(0);
  });
});
