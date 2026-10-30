// Migrations 0003–0009: the code registry becomes database categories. Runs the
// old schema, inserts old-style data, then applies the new migrations on top.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { definitionSchema } from "../domain/categoryDefinition";
import { resolveFields, validateDetails } from "../domain/categorySchema";
import * as schema from "./schema";
import { BODY_MEASUREMENT_KEYS, SEED_CATEGORIES, SEED_MEASUREMENTS } from "./seed/catalog";

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

  // An admin's unpublished draft for Dress, waiting when 0008 arrives.
  const upTo0007 = migrationsUpTo("0007_category_aliases");
  await migrate(db, { migrationsFolder: upTo0007 });
  rmSync(upTo0007, { recursive: true, force: true });
  await client.query(
    `INSERT INTO category_versions (category_id, version, status, definition)
     SELECT c.id, 2, 'draft', jsonb_set(v.definition, '{sections,0,fields}', (v.definition #> '{sections,0,fields}') || $1::jsonb)
     FROM categories c JOIN category_versions v ON v.id = c.current_published_version_id WHERE c.key = 'dress'`,
    [JSON.stringify([{ kind: "text", key: "fit_note", label: "Fit", maxLength: 200, required: false }])],
  );

  await migrate(db, { migrationsFolder: MIGRATIONS });
}, 60_000);

afterAll(async () => {
  await client.close();
  rmSync(oldDir, { recursive: true, force: true });
});

describe("categories migration", () => {
  it("ends with every seed category published exactly as the seed defines it today, and the full library", async () => {
    const cats = await db.select().from(schema.categories);
    expect(cats.map((c) => c.key).sort()).toEqual(SEED_CATEGORIES.map((c) => c.key).sort());
    const published = await db
      .select({ key: schema.categories.key, version: schema.categoryVersions })
      .from(schema.categories)
      .innerJoin(schema.categoryVersions, eq(schema.categoryVersions.id, schema.categories.currentPublishedVersionId));
    expect(published).toHaveLength(SEED_CATEGORIES.length);
    for (const { key, version } of published) {
      expect(version.status, key).toBe("published");
      expect(version.publishedAt, key).not.toBeNull();
      expect(version.definition, key).toEqual(definitionSchema.parse(SEED_CATEGORIES.find((c) => c.key === key)!.definition));
    }
    const lens = cats.find((c) => c.key === "contact_lens")!;
    expect(lens.allowedShippingModes).toEqual(["air_sensitive", "sea"]);
    expect(await db.$count(schema.measurementDefinitions)).toBe(SEED_MEASUREMENTS.length);
  });

  it("asks every clothing category for height and weight first, in a new version (0008)", async () => {
    const lib = await db.select().from(schema.measurementDefinitions).where(inArray(schema.measurementDefinitions.key, [...BODY_MEASUREMENT_KEYS]));
    expect(lib.map((m) => [m.key, m.unit, m.group]).sort()).toEqual([
      ["height_cm", "cm", "body"],
      ["weight_kg", "kg", "body"],
    ]);

    for (const key of ["clothing_top", "clothing_bottom", "dress"]) {
      const versions = await db
        .select({ version: schema.categoryVersions.version, status: schema.categoryVersions.status, definition: schema.categoryVersions.definition })
        .from(schema.categoryVersions)
        .innerJoin(schema.categories, eq(schema.categories.id, schema.categoryVersions.categoryId))
        .where(eq(schema.categories.key, key));
      const v1 = versions.find((v) => v.version === 1)!;
      const live = versions.find((v) => v.status === "published")!;
      expect(v1.status, key).toBe("archived");
      // Dress: v2 was the test's draft, 0008 published v3, 0009 v5 (the draft moved ahead each time).
      expect(live.version, key).toBe(key === "dress" ? 5 : 2);
      const firstKeys = live.definition.sections[0].fields.slice(0, 2).map((f) => (f.kind === "measurement" ? f.measurementKey : f.key));
      expect(firstKeys, key).toEqual(["height_cm", "weight_kg"]);
    }
    // Everything else is untouched.
    const ring = await db.select().from(schema.categoryVersions).innerJoin(schema.categories, eq(schema.categories.id, schema.categoryVersions.categoryId)).where(eq(schema.categories.key, "ring"));
    expect(ring.map((r) => r.category_versions.status)).toEqual(["published"]);

    const entries = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "category.publish"));
    expect(entries.filter((e) => /height and weight/.test(e.summary))).toHaveLength(3);
    expect(entries.every((e) => e.actorId === null)).toBe(true);
  });

  it("keeps an admin's unpublished draft, adds the fields to it, and numbers it after the new version (0008)", async () => {
    const [draft] = await db
      .select({ version: schema.categoryVersions.version, definition: schema.categoryVersions.definition })
      .from(schema.categoryVersions)
      .innerJoin(schema.categories, eq(schema.categories.id, schema.categoryVersions.categoryId))
      .where(and(eq(schema.categories.key, "dress"), eq(schema.categoryVersions.status, "draft")));
    expect(draft.version).toBe(6);
    const keys = draft.definition.sections[0].fields.map((f) => (f.kind === "measurement" ? f.measurementKey : f.key));
    expect(keys.slice(0, 2)).toEqual(["height_cm", "weight_kg"]);
    expect(keys.at(-1)).toBe("fit_note");
    expect(keys).not.toContain("length_cm");
    definitionSchema.parse(draft.definition);
  });

  it("drops dress length from Dress, and old orders keep their answer (0009)", async () => {
    const [dress] = await db
      .select({ definition: schema.categoryVersions.definition })
      .from(schema.categories)
      .innerJoin(schema.categoryVersions, eq(schema.categoryVersions.id, schema.categories.currentPublishedVersionId))
      .where(eq(schema.categories.key, "dress"));
    const keys = dress.definition.sections.flatMap((s) => s.fields.map((f) => (f.kind === "measurement" ? f.measurementKey : f.key)));
    expect(keys).toEqual(["height_cm", "weight_kg", "chest_cm", "waist_cm", "hip_cm"]);
    const [entry] = await db.select().from(schema.auditLog).where(sql`${schema.auditLog.summary} like '%dress length%'`);
    expect(entry).toMatchObject({ action: "category.publish", actorId: null });
  });

  it("only allows known units and groups", async () => {
    const row = { label: "X", min: 1, max: 2, step: 1, sort_order: 0 };
    const insert = (key: string, unit: string, group: string) =>
      client.query(`INSERT INTO measurement_definitions (key, label, unit, min, max, step, "group", sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
        key, row.label, unit, row.min, row.max, row.step, group, row.sort_order,
      ]);
    expect(await fails(insert("x_m", "m", "body"))).toMatch(/measurement_definitions_unit/);
    expect(await fails(insert("x_cm", "cm", "torso"))).toMatch(/measurement_definitions_group/);
  });

  it("gives the seeded categories their search words (0007)", async () => {
    const rows = await db.select({ key: schema.categories.key, aliases: schema.categories.aliases }).from(schema.categories);
    const aliasesOf = Object.fromEntries(rows.map((r) => [r.key, r.aliases]));
    expect(aliasesOf.shoes).toEqual(SEED_CATEGORIES.find((c) => c.key === "shoes")!.aliases);
    expect(aliasesOf.shoes).toContain("kasut");
    expect(aliasesOf.digital).toEqual([]);
  });

  it("switches off the digital product category, and says why in the change log (0006)", async () => {
    const [digital] = await db.select().from(schema.categories).where(eq(schema.categories.key, "digital"));
    expect(digital.isActive).toBe(false);
    expect(await db.$count(schema.categories, eq(schema.categories.isActive, false))).toBe(1);
    const [entry] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, digital.id));
    expect(entry).toMatchObject({ action: "category.update", actorId: null, summary: expect.stringMatching(/no longer offered/) });
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
