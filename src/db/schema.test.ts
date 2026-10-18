import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseSettings } from "../domain/settings";
import { batches, ledgerEntries, orders, orderStatusHistory, payments, quotes, settings, users } from "./schema";
import { createTestDb, publishedVersionId, type TestDb } from "./testing";

let db: TestDb;
let close: () => Promise<void>;
const versions: Record<string, string> = {};

beforeAll(async () => {
  const t = await createTestDb();
  db = t.db;
  close = () => t.client.close();
  await db.insert(users).values({ id: "u1", name: "Aina", email: "aina@example.com" });
  for (const key of ["clothing_top", "other"]) versions[key] = await publishedVersionId(db, key);
});

afterAll(async () => close());

/** Postgres error from drizzle (wrapped) or the driver. */
async function pgError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as { message: string; cause?: { message: string } };
    return `${err.message} ${err.cause?.message ?? ""}`;
  }
  throw new Error("expected the query to fail");
}

async function newOrder() {
  const [o] = await db
    .insert(orders)
    .values({
      customerId: "u1",
      itemName: "Test item",
      pathType: "url",
      platform: "taobao",
      productUrl: "https://item.taobao.com/item.htm?id=1",
      categoryVersionId: versions.clothing_top,
      shippingMode: "air",
    })
    .returning();
  return o;
}

describe("users", () => {
  it("default to the student role", async () => {
    const [u] = await db.select().from(users).where(eq(users.id, "u1"));
    expect(u.role).toBe("student");
    expect(u.twoFactorEnabled).toBe(false);
  });
});

describe("orders", () => {
  it("number from 1001 upwards", async () => {
    const a = await newOrder();
    const b = await newOrder();
    expect(a.id).toBeGreaterThanOrEqual(1001);
    expect(b.id).toBe(a.id + 1);
    expect(a.status).toBe("submitted");
  });

  it("require a condition preference when there is no product link", async () => {
    const msg = await pgError(
      db.insert(orders).values({
        customerId: "u1",
        itemName: "Test item",
        pathType: "reverse_search",
        platform: "other",
        categoryVersionId: versions.other,
        shippingMode: "air",
      }),
    );
    expect(msg).toMatch(/orders_link_or_condition/);
  });

  it("refuse a batch on PDD direct-ship orders", async () => {
    const [batch] = await db
      .insert(batches)
      .values({ code: "Air #1", mode: "air", cutoffAt: new Date() })
      .returning();
    const msg = await pgError(
      db.insert(orders).values({
        customerId: "u1",
        itemName: "Test item",
        pathType: "url",
        platform: "pdd",
        productUrl: "https://mobile.yangkeduo.com/goods.html?goods_id=1",
        categoryVersionId: versions.other,
        shippingMode: "pdd_direct",
        batchId: batch.id,
      }),
    );
    expect(msg).toMatch(/orders_no_batch_for_direct/);
  });
});

describe("append-only tables", () => {
  it("forbid updating, deleting or truncating ledger entries", async () => {
    const o = await newOrder();
    const [entry] = await db
      .insert(ledgerEntries)
      .values({ orderId: o.id, customerId: "u1", type: "service_fee", amountSen: 600 })
      .returning();

    expect(await pgError(db.update(ledgerEntries).set({ amountSen: 1 }).where(eq(ledgerEntries.id, entry.id)))).toMatch(
      /append-only: UPDATE/,
    );
    expect(await pgError(db.delete(ledgerEntries).where(eq(ledgerEntries.id, entry.id)))).toMatch(/append-only: DELETE/);
    expect(await pgError(db.execute(sql`TRUNCATE ledger_entries CASCADE`))).toMatch(/append-only: TRUNCATE/);

    // Corrections are new entries.
    await db.insert(ledgerEntries).values({ orderId: o.id, customerId: "u1", type: "refund", amountSen: -600 });
    const rows = await db.select().from(ledgerEntries).where(eq(ledgerEntries.orderId, o.id));
    expect(rows.reduce((s, r) => s + r.amountSen, 0)).toBe(0);
  });

  it("reject zero-amount ledger entries and RMB amounts without a rate", async () => {
    const o = await newOrder();
    expect(
      await pgError(db.insert(ledgerEntries).values({ orderId: o.id, customerId: "u1", type: "refund", amountSen: 0 })),
    ).toMatch(/ledger_amount_nonzero/);
    expect(
      await pgError(
        db.insert(ledgerEntries).values({
          orderId: o.id,
          customerId: "u1",
          type: "item_payment",
          amountSen: 6_500,
          sourceAmountFen: 10_000,
        }),
      ),
    ).toMatch(/ledger_fen_has_rate/);
  });

  it("forbid rewriting status history", async () => {
    const o = await newOrder();
    const [h] = await db
      .insert(orderStatusHistory)
      .values({ orderId: o.id, fromStatus: null, toStatus: "submitted", actorId: "u1" })
      .returning();
    expect(
      await pgError(db.update(orderStatusHistory).set({ note: "x" }).where(eq(orderStatusHistory.id, h.id))),
    ).toMatch(/append-only/);
    expect(await pgError(db.delete(orderStatusHistory).where(eq(orderStatusHistory.id, h.id)))).toMatch(/append-only/);
  });
});

describe("payments", () => {
  it("make duplicate provider callbacks a no-op (idempotent insert)", async () => {
    const o = await newOrder();
    const insert = () =>
      db
        .insert(payments)
        .values({ orderId: o.id, method: "fiuu", amountSen: 9_050, providerTranId: "FIUU-123", status: "confirmed" })
        .onConflictDoNothing({ target: payments.providerTranId })
        .returning();

    expect(await insert()).toHaveLength(1);
    expect(await insert()).toHaveLength(0); // second callback: nothing inserted → no second ledger entry
  });

  it("allow many manual payments without a provider id", async () => {
    const o = await newOrder();
    for (let i = 0; i < 2; i++) {
      await db.insert(payments).values({ orderId: o.id, method: "duitnow_manual", amountSen: 100, proofPhotoKey: `proof/${i}.jpg` });
    }
  });

  it("require a proof photo for manual DuitNow payments", async () => {
    const o = await newOrder();
    expect(await pgError(db.insert(payments).values({ orderId: o.id, method: "duitnow_manual", amountSen: 100 }))).toMatch(
      /payments_manual_has_proof/,
    );
  });
});

describe("quotes", () => {
  it("allow only one open quote per order", async () => {
    const o = await newOrder();
    const q = {
      orderId: o.id,
      itemPriceFen: 10_000,
      fxRate: "0.650000",
      itemPriceSen: 6_500,
      serviceFeeSen: 600,
      shippingEstimateMinSen: 1_950,
      shippingEstimateMaxSen: 3_250,
      totalMinSen: 9_050,
      totalMaxSen: 10_350,
      expiresAt: new Date(Date.now() + 86_400_000),
    };
    const [first] = await db.insert(quotes).values(q).returning();
    expect(first.fxRate).toBe("0.650000");
    expect(await pgError(db.insert(quotes).values(q))).toMatch(/quotes_one_open_per_order/);
    await db.update(quotes).set({ status: "expired" }).where(eq(quotes.id, first.id));
    await db.insert(quotes).values(q);
  });

  it("reject inverted ranges", async () => {
    const o = await newOrder();
    expect(
      await pgError(
        db.insert(quotes).values({
          orderId: o.id,
          itemPriceFen: 1,
          fxRate: "0.65",
          itemPriceSen: 1,
          serviceFeeSen: 0,
          shippingEstimateMinSen: 500,
          shippingEstimateMaxSen: 100,
          totalMinSen: 1,
          totalMaxSen: 1,
          expiresAt: new Date(),
        }),
      ),
    ).toMatch(/quotes_shipping_range/);
  });
});

describe("settings", () => {
  it("is a single row that parses to full defaults", async () => {
    await db.insert(settings).values({});
    const [row] = await db.select().from(settings);
    expect(parseSettings(row.data).fees.coordinationFeeSen).toBe(600);
    expect(await pgError(db.insert(settings).values({ id: 2 }))).toMatch(/settings_singleton/);
  });
});
