// Settings → Categories, the measurement library and the settings sections.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, categories, categoryVersions, fxRates, orders, users } from "../db/schema";
import { createTestDb, publishedVersionId, type TestDb } from "../db/testing";
import {
  createCategory,
  createMeasurement,
  deleteCategory,
  deleteMeasurement,
  discardDraft,
  draftDiff,
  publishDraft,
  saveDraft,
  updateCategoryInfo,
} from "./admin/categories";
import { auditPage, updateSettingsSection } from "./admin/settings";
import { getCatalog } from "./data/categories";
import { getSettings } from "./data/catalog";

const ADMIN = "adminUserId0001";
let db: TestDb;
let close: () => Promise<void>;

const info = {
  name: "Hats",
  icon: "Package",
  fulfilment: "physical" as const,
  defaultWeightG: 200,
  defaultLengthMm: 300,
  defaultWidthMm: 300,
  defaultHeightMm: 150,
  allowedShippingModes: ["air" as const, "sea" as const],
  restrictedNote: null,
  isActive: true,
};
const head = { kind: "number", key: "head_cm", label: "Head", unit: "cm", min: 40, max: 70, step: 0.5, required: true };

beforeAll(async () => {
  const t = await createTestDb();
  db = t.db;
  close = () => t.client.close();
  await db.insert(users).values([
    { id: ADMIN, name: "Admin", email: "a@example.com", role: "admin" },
    { id: "studentUser0001", name: "S", email: "s@example.com" },
  ]);
});

afterAll(async () => close());

describe("categories", () => {
  it("create → draft → publish → new draft → publish archives the old version", async () => {
    const id = await createCategory(db, ADMIN, { ...info, key: "hat" });
    expect((await getCatalog(db)).categories.some((c) => c.key === "hat")).toBe(false); // not published yet

    await expect(saveDraft(db, ADMIN, id, { sections: [{ fields: [{ ...head, min: 80 }] }] })).rejects.toThrow(/Min must be below max/);
    await expect(saveDraft(db, ADMIN, id, { sections: [{ fields: [{ kind: "measurement", measurementKey: "wingspan_cm" }] }] })).rejects.toThrow(/Unknown measurement/);
    await saveDraft(db, ADMIN, id, { sections: [{ title: "Size", fields: [head] }] });
    expect(await draftDiff(db, id)).toMatchObject({ from: null, to: 1, diff: { added: ["head_cm"] } });
    await publishDraft(db, ADMIN, id);

    const live = (await getCatalog(db)).categories.find((c) => c.key === "hat")!;
    expect(live.version).toBe(1);

    // An order made under v1…
    await db.insert(orders).values({
      customerId: "studentUser0001",
      itemName: "Bucket hat",
      pathType: "url",
      platform: "taobao",
      productUrl: "https://item.taobao.com/item.htm?id=9",
      categoryVersionId: live.versionId,
      details: { head_cm: 57 },
      shippingMode: "air",
    });

    // …stays on v1 when v2 replaces the field.
    await expect(saveDraft(db, ADMIN, id, { sections: [{ fields: [{ kind: "text", key: "head_cm", label: "Head size" }] }] })).rejects.toThrow(/was a number field/);
    await saveDraft(db, ADMIN, id, { sections: [{ fields: [head, { kind: "select", key: "style", label: "Style", options: ["Bucket", "Cap"], required: true }] }] });
    await publishDraft(db, ADMIN, id);
    const versions = await db.select().from(categoryVersions).where(eq(categoryVersions.categoryId, id));
    expect(versions.map((v) => [v.version, v.status]).sort()).toEqual([
      [1, "archived"],
      [2, "published"],
    ]);
    const [order] = await db.select().from(orders).where(eq(orders.itemName, "Bucket hat"));
    expect(order.categoryVersionId).toBe(live.versionId);
    expect((await getCatalog(db)).categories.find((c) => c.key === "hat")!.version).toBe(2);

    const actions = (await db.select({ a: auditLog.action }).from(auditLog)).map((r) => r.a);
    expect(actions).toEqual(expect.arrayContaining(["category.create", "category.publish"]));
  });

  it("discards a draft back to the live version, and won't delete a used category", async () => {
    const id = await publishedVersionId(db, "ring").then(async (v) => (await db.select({ id: categoryVersions.categoryId }).from(categoryVersions).where(eq(categoryVersions.id, v)))[0].id);
    await saveDraft(db, ADMIN, id, { sections: [{ fields: [] }] });
    await discardDraft(db, ADMIN, id);
    expect(await draftDiff(db, id)).toBeNull();
    await expect(deleteCategory(db, ADMIN, id)).rejects.toThrow(/Switch it off/);

    await updateCategoryInfo(db, ADMIN, id, { ...info, name: "Rings", isActive: false });
    expect((await getCatalog(db)).categories.some((c) => c.key === "ring")).toBe(false);
  });

  it("deletes a never-published category", async () => {
    const id = await createCategory(db, ADMIN, { ...info, key: "scratch" });
    await deleteCategory(db, ADMIN, id);
    expect(await db.select().from(categories).where(eq(categories.id, id))).toEqual([]);
  });

  it("digital categories only offer no shipping", async () => {
    const id = await createCategory(db, ADMIN, { ...info, key: "game_credit", fulfilment: "digital" });
    const [row] = await db.select().from(categories).where(eq(categories.id, id));
    expect(row.allowedShippingModes).toEqual(["none"]);
  });
});

describe("measurement library", () => {
  it("adds new measurements and refuses to delete one in use", async () => {
    await createMeasurement(db, ADMIN, { key: "neck_cm", label: "Neck", unit: "cm", min: 25, max: 60, step: 0.5, helpText: null, helpImageKey: null, group: "upper_body", sortOrder: 70, isActive: true });
    await expect(createMeasurement(db, ADMIN, { key: "neck_cm", label: "Neck", unit: "cm", min: 25, max: 60, step: 0.5, helpText: null, helpImageKey: null, group: "upper_body", sortOrder: 70, isActive: true })).rejects.toThrow(/taken/);
    await expect(deleteMeasurement(db, ADMIN, "chest_cm")).rejects.toThrow(/Used by/);
    await deleteMeasurement(db, ADMIN, "neck_cm");
  });
});

describe("settings sections", () => {
  it("validates, saves, audits and keeps the exchange-rate history", async () => {
    await expect(updateSettingsSection(db, ADMIN, "fees", { coordinationFeeSen: -1 })).rejects.toThrow();
    await updateSettingsSection(db, ADMIN, "fees", { coordinationFeeSen: 700, reverseSearchFeeSen: 400, consultationFeeSen: 2500, lalamoveFeeSen: 300 });
    expect((await getSettings(db)).fees.coordinationFeeSen).toBe(700);

    await updateSettingsSection(db, ADMIN, "fx", { defaultMyrPerCny: "0.662000" }, "Bank rate");
    await updateSettingsSection(db, ADMIN, "fx", { defaultMyrPerCny: "0.662000" }); // unchanged: no new history row
    const history = await db.select().from(fxRates);
    expect(history.map((h) => [h.myrPerCny, h.note])).toEqual([["0.662000", "Bank rate"]]);

    const { rows } = await auditPage(db, 1);
    expect(rows.map((r) => r.summary)).toEqual(expect.arrayContaining(["Changed fees", "Changed exchange rate"]));
  });
});
