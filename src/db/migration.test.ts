// Migrations 0003–0005: the code registry becomes database categories. Runs the
// old schema, inserts old-style data, then applies the new migrations on top.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { definitionSchema } from "../domain/categoryDefinition";
import { resolveFields, validateDetails } from "../domain/categorySchema";
import * as schema from "./schema";
import { SEED_CATEGORIES } from "./seed/catalog";

const MIGRATIONS = path.resolve(__dirname, "../../drizzle");
let client: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
let oldDir: string;

/** A copy of the migrations folder that stops after `lastTag`. */
function migrationsUpTo(lastTag: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-mig-"));
  cpSync(MIGRATIONS, dir, { recursive: true });
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  const idx = journal.entries.findIndex((e: { tag: string }) => e.tag === lastTag);
  journal.entries = journal.entries.slice(0, idx + 1);
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

async function fails(q: Promise<unknown>): Promise<string> {
  try {
    await q;
  } catch (e) {
    const err = e as { message: string; cause?: { message: string } };
    return `${err.message} ${err.cause?.message ?? ""}`;
  }
  throw new Error("expected the statement to fail");
}

const OLD_ORDERS: Array<[string, Record<string, unknown>]> = [
  ["clothing_top", { chest_cm: 96, shoulder_cm: 44, arm_length_cm: 62, body_length_cm: 70 }],
  ["ring", { inner_circumference_mm: 52 }],
  ["glasses_prescription", { sph_left: -1, sph_right: -1.25, cyl_left: -0.5, cyl_right: 0, axis_left: 90, pd_mm: 62 }],
  ["bra", { underbust_cm: 70, overbust_cm: 85 }],
  ["digital", { region: "SEA", delivery_email: "a@example.com" }],
];

beforeAll(async () => {
  client = new PGlite();
  db = drizzle({ client, schema, casing: "snake_case" });
  oldDir = migrationsUpTo("0002_order_item_name");
  await migrate(db, { migrationsFolder: oldDir });

  await client.exec(`INSERT INTO users (id, name, email) VALUES ('u1', 'Aina', 'a@example.com'), ('u2', 'Bo', 'b@example.com')`);
  for (const [category, details] of OLD_ORDERS) {
    const shipping = category === "digital" ? "none" : "air";
    const path = category === "digital" ? "digital" : "url";
    await client.query(
      `INSERT INTO orders (customer_id, item_name, path_type, platform, product_url, category, category_schema_version, details, shipping_mode)
       VALUES ('u1', $1, $2, 'taobao', 'https://item.taobao.com/item.htm?id=1', $1, 1, $3, $4)`,
      [category, path, JSON.stringify(details), shipping],
    );
  }
  await client.query(`INSERT INTO customer_profiles (user_id, display_name, saved_measurements) VALUES ('u1', 'Aina', $1), ('u2', 'Bo', $2)`, [
    JSON.stringify({
      clothing_top: { chest_cm: 96, shoulder_cm: 44, arm_length_cm: 62, body_length_cm: 70 },
      dress: { chest_cm: 90, waist_cm: 70, length_cm: 110 },
      ring: { inner_circumference_mm: 52 },
      shoes: { size: "38", size_system: "EU", foot_length_cm: 24 },
      glasses_prescription: { sph_left: -1, pd_mm: 62 },
    }),
    JSON.stringify("not an object"),
  ]);

  await migrate(db, { migrationsFolder: MIGRATIONS });
}, 60_000);

afterAll(async () => {
  await client.close();
  rmSync(oldDir, { recursive: true, force: true });
});

describe("categories migration", () => {
  it("loads every seed category with a published version 1 and the measurement library", async () => {
    const cats = await db.select().from(schema.categories);
    expect(cats.map((c) => c.key).sort()).toEqual(SEED_CATEGORIES.map((c) => c.key).sort());
    for (const c of cats) expect(c.currentPublishedVersionId, c.key).not.toBeNull();
    const versions = await db.select().from(schema.categoryVersions);
    expect(versions.every((v) => v.version === 1 && v.status === "published" && v.publishedAt)).toBe(true);
    for (const v of versions) definitionSchema.parse(v.definition);
    const lens = cats.find((c) => c.key === "contact_lens")!;
    expect(lens.allowedShippingModes).toEqual(["air_sensitive", "sea"]);
    expect(await db.$count(schema.measurementDefinitions)).toBe(12);
  });

  it("backfills every order with the version it was made under, and every order still validates", async () => {
    const rows = await db
      .select({ id: schema.orders.id, details: schema.orders.details, key: schema.categories.key, definition: schema.categoryVersions.definition })
      .from(schema.orders)
      .innerJoin(schema.categoryVersions, eq(schema.categoryVersions.id, schema.orders.categoryVersionId))
      .innerJoin(schema.categories, eq(schema.categories.id, schema.categoryVersions.categoryId));
    expect(rows.map((r) => r.key).sort()).toEqual(OLD_ORDERS.map(([k]) => k).sort());

    const library = (await db.select().from(schema.measurementDefinitions)).map((m) => ({ ...m, helpText: m.helpText, helpImageKey: m.helpImageKey }));
    for (const r of rows) {
      const result = validateDetails(resolveFields(r.definition, library), r.details);
      expect(result, r.key).toMatchObject({ ok: true });
    }
    const ring = rows.find((r) => r.key === "ring")!;
    expect(ring.details).toEqual({ ring_inner_circumference_mm: 52 });
  });

  it("drops the old category columns", async () => {
    const cols = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'orders' AND column_name IN ('category', 'category_schema_version', 'category_version_id')`,
    );
    expect(cols.rows.map((c) => c.column_name)).toEqual(["category_version_id"]);
  });

  it("flattens saved measurements to one value per measurement", async () => {
    const profiles = await db.select().from(schema.customerProfiles);
    const aina = profiles.find((p) => p.userId === "u1")!;
    expect(aina.savedMeasurements).toEqual({
      chest_cm: 96, // clothing_top listed first wins over dress
      shoulder_cm: 44,
      arm_length_cm: 62,
      body_length_cm: 70,
      waist_cm: 70,
      ring_inner_circumference_mm: 52,
      foot_length_cm: 24,
      pd_mm: 62,
    });
    expect(profiles.find((p) => p.userId === "u2")!.savedMeasurements).toEqual({});
  });
});

describe("new guards", () => {
  it("freeze published versions but allow archiving", async () => {
    const [v] = await db.select().from(schema.categoryVersions).limit(1);
    expect(await fails(db.update(schema.categoryVersions).set({ definition: { sections: [] } }).where(eq(schema.categoryVersions.id, v.id)))).toMatch(
      /cannot be edited/,
    );
    expect(await fails(db.delete(schema.categoryVersions).where(eq(schema.categoryVersions.id, v.id)))).toMatch(/cannot be deleted/);
  });

  it("let drafts change, allow one draft per category, and never republish an archived version", async () => {
    const [cat] = await db.select().from(schema.categories).where(eq(schema.categories.key, "other"));
    const [draft] = await db
      .insert(schema.categoryVersions)
      .values({ categoryId: cat.id, version: 2, status: "draft", definition: { sections: [] } })
      .returning();
    await db.update(schema.categoryVersions).set({ definition: { sections: [{ title: "x", fields: [] }] } }).where(eq(schema.categoryVersions.id, draft.id));
    expect(await fails(db.insert(schema.categoryVersions).values({ categoryId: cat.id, version: 3, status: "draft", definition: { sections: [] } }))).toMatch(
      /category_versions_one_draft/,
    );
    await db.update(schema.categoryVersions).set({ status: "archived" }).where(eq(schema.categoryVersions.id, draft.id));
    expect(await fails(db.update(schema.categoryVersions).set({ status: "published" }).where(eq(schema.categoryVersions.id, draft.id)))).toMatch(
      /cannot be republished/,
    );
  });

  it("keep the audit log append-only", async () => {
    await db.insert(schema.auditLog).values({ action: "test", entityType: "test", summary: "hello" });
    expect(await fails(db.execute(sql`DELETE FROM audit_log`))).toMatch(/append-only/);
  });
});
