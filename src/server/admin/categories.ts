import "server-only";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { categories, categoryVersions, measurementDefinitions, orders, showcaseProducts } from "../../db/schema";
import type { Db } from "../../db/types";
import {
  definitionSchema,
  diffDefinitions,
  keyKindConflicts,
  measurementKeysOf,
  measurementRefErrors,
  type CategoryDefinition,
} from "../../domain/categoryDefinition";
import type { CategoryFulfilment, MeasurementGroup, MeasurementUnit, ShippingMode } from "../../domain/enums";
import { audit } from "../audit";
import { invalidateCatalog, toCategoryInfo, toMeasurementDef } from "../data/categories";
import { UserError } from "../errors";

// Settings → Categories and the measurement library. Published versions are
// frozen (a trigger enforces it); edits happen on a draft, which is validated
// by the meta-schema on every save and again on publish.

/** Runs a change in a transaction, then drops the cached catalogue once it's committed. */
async function mutate<T>(db: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  const result = await db.transaction(fn);
  invalidateCatalog(db);
  return result;
}

// ---- reads ------------------------------------------------------------------------------

export async function listCategoriesAdmin(db: Db) {
  const [rows, usage, drafts] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)),
    db
      .select({ categoryId: categoryVersions.categoryId, n: count() })
      .from(orders)
      .innerJoin(categoryVersions, eq(categoryVersions.id, orders.categoryVersionId))
      .groupBy(categoryVersions.categoryId),
    db.select({ categoryId: categoryVersions.categoryId, version: categoryVersions.version }).from(categoryVersions).where(eq(categoryVersions.status, "draft")),
  ]);
  const used = new Map(usage.map((u) => [u.categoryId, u.n]));
  const draftOf = new Map(drafts.map((d) => [d.categoryId, d.version]));
  return rows.map((c) => ({ ...toCategoryInfo(c), sortOrder: c.sortOrder, isActive: c.isActive, published: c.currentPublishedVersionId !== null, orderCount: used.get(c.id) ?? 0, draftVersion: draftOf.get(c.id) ?? null }));
}

export async function getCategoryAdmin(db: Db, id: string) {
  const [cat] = await db.select().from(categories).where(eq(categories.id, id));
  if (!cat) return null;
  const [versions, library, [{ n }]] = await Promise.all([
    db.select().from(categoryVersions).where(eq(categoryVersions.categoryId, id)).orderBy(desc(categoryVersions.version)),
    db.select().from(measurementDefinitions).orderBy(asc(measurementDefinitions.group), asc(measurementDefinitions.sortOrder)),
    db.select({ n: count() }).from(orders).innerJoin(categoryVersions, eq(categoryVersions.id, orders.categoryVersionId)).where(eq(categoryVersions.categoryId, id)),
  ]);
  const published = versions.find((v) => v.status === "published") ?? null;
  const draft = versions.find((v) => v.status === "draft") ?? null;
  // Keys any version ever published: those can't be renamed (only dropped).
  const lockedKeys = [...new Set(versions.filter((v) => v.status !== "draft").flatMap((v) => v.definition.sections.flatMap((s) => s.fields.map((f) => (f.kind === "measurement" ? f.measurementKey : f.key)))))];
  return {
    category: { ...toCategoryInfo(cat), sortOrder: cat.sortOrder, isActive: cat.isActive },
    versions: versions.map((v) => ({ id: v.id, version: v.version, status: v.status, createdAt: v.createdAt, publishedAt: v.publishedAt })),
    published: published ? { id: published.id, version: published.version, definition: published.definition } : null,
    draft: draft ? { id: draft.id, version: draft.version, definition: draft.definition } : null,
    library: library.map(toMeasurementDef),
    orderCount: n,
    lockedKeys,
  };
}

// ---- category info --------------------------------------------------------------------------

export interface CategoryInfoInput {
  name: string;
  icon: string;
  fulfilment: CategoryFulfilment;
  defaultWeightG: number;
  defaultLengthMm: number;
  defaultWidthMm: number;
  defaultHeightMm: number;
  allowedShippingModes: ShippingMode[];
  restrictedNote: string | null;
  isActive: boolean;
}

function modesFor(input: Pick<CategoryInfoInput, "fulfilment" | "allowedShippingModes">): ShippingMode[] {
  if (input.fulfilment === "digital") return ["none"];
  const modes = input.allowedShippingModes.filter((m) => m !== "none");
  if (modes.length === 0) throw new UserError("Choose at least one shipping mode.", { allowedShippingModes: "Choose at least one" });
  return modes;
}

export async function createCategory(db: Db, actorId: string, input: CategoryInfoInput & { key: string }) {
  return mutate(db, async (tx) => {
    const [exists] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.key, input.key));
    if (exists) throw new UserError("That key is taken.", { key: "Already used by another category" });
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${categories.sortOrder}), 0)::int` }).from(categories);
    const [cat] = await tx
      .insert(categories)
      .values({ ...input, allowedShippingModes: modesFor(input), sortOrder: max + 10 })
      .returning({ id: categories.id });
    await tx.insert(categoryVersions).values({ categoryId: cat.id, version: 1, status: "draft", definition: { sections: [{ title: "", fields: [] }] }, createdBy: actorId });
    await audit(tx, { actorId, action: "category.create", entityType: "category", entityId: cat.id, summary: `Created category “${input.name}” (${input.key})` });
    return cat.id;
  });
}

export async function updateCategoryInfo(db: Db, actorId: string, id: string, input: CategoryInfoInput) {
  return mutate(db, async (tx) => {
    const [before] = await tx.select().from(categories).where(eq(categories.id, id));
    if (!before) throw new UserError("That category no longer exists.");
    await tx.update(categories).set({ ...input, allowedShippingModes: modesFor(input) }).where(eq(categories.id, id));
    await audit(tx, {
      actorId,
      action: "category.update",
      entityType: "category",
      entityId: id,
      summary: `Updated “${input.name}”${before.isActive !== input.isActive ? (input.isActive ? " (switched on)" : " (switched off)") : ""}`,
      data: { before: toCategoryInfo(before), after: input },
    });
  });
}

export async function reorderCategories(db: Db, actorId: string, ids: string[]) {
  return mutate(db, async (tx) => {
    const rows = await tx.select({ id: categories.id }).from(categories);
    if (rows.length !== ids.length || !rows.every((r) => ids.includes(r.id))) throw new UserError("The list changed. Reload and try again.");
    for (const [i, id] of ids.entries()) await tx.update(categories).set({ sortOrder: (i + 1) * 10 }).where(eq(categories.id, id));
    await audit(tx, { actorId, action: "category.reorder", entityType: "category", summary: "Reordered categories" });
  });
}

/** Only a category no order has ever used (and that was never published) can be deleted; otherwise switch it off. */
export async function deleteCategory(db: Db, actorId: string, id: string) {
  return mutate(db, async (tx) => {
    const [cat] = await tx.select().from(categories).where(eq(categories.id, id));
    if (!cat) return;
    const versions = await tx.select({ id: categoryVersions.id, status: categoryVersions.status }).from(categoryVersions).where(eq(categoryVersions.categoryId, id));
    const [{ n }] = versions.length
      ? await tx.select({ n: count() }).from(orders).where(inArray(orders.categoryVersionId, versions.map((v) => v.id)))
      : [{ n: 0 }];
    if (n > 0 || versions.some((v) => v.status !== "draft")) {
      throw new UserError("This category has been published or used by orders, so it can't be deleted. Switch it off instead.");
    }
    await tx.delete(categoryVersions).where(eq(categoryVersions.categoryId, id));
    await tx.update(showcaseProducts).set({ category: null }).where(eq(showcaseProducts.category, cat.key));
    await tx.delete(categories).where(eq(categories.id, id));
    await audit(tx, { actorId, action: "category.delete", entityType: "category", entityId: id, summary: `Deleted unused category “${cat.name}”` });
  });
}

// ---- drafts and publishing --------------------------------------------------------------------

async function checkDefinition(tx: Db, categoryId: string, raw: unknown, { forPublish }: { forPublish: boolean }): Promise<CategoryDefinition> {
  const parsed = definitionSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new UserError(`${first.message}${first.path.length ? ` (at ${first.path.join(".")})` : ""}`);
  }
  const library = await tx.select({ key: measurementDefinitions.key, isActive: measurementDefinitions.isActive }).from(measurementDefinitions);
  const refErrors = measurementRefErrors(parsed.data, library, { requireActive: forPublish });
  if (refErrors.length) throw new UserError(refErrors.join(". "));
  const previous = await tx
    .select({ definition: categoryVersions.definition })
    .from(categoryVersions)
    .where(and(eq(categoryVersions.categoryId, categoryId), inArray(categoryVersions.status, ["published", "archived"])));
  const conflicts = keyKindConflicts(previous.map((p) => p.definition), parsed.data);
  if (conflicts.length) throw new UserError(conflicts.join(". "));
  return parsed.data;
}

/** Creates or replaces the category's single draft (version = latest + 1). */
export async function saveDraft(db: Db, actorId: string, categoryId: string, raw: unknown) {
  return mutate(db, async (tx) => {
    const [cat] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId)).for("update");
    if (!cat) throw new UserError("That category no longer exists.");
    const definition = await checkDefinition(tx, categoryId, raw, { forPublish: false });
    const [draft] = await tx.select({ id: categoryVersions.id }).from(categoryVersions).where(and(eq(categoryVersions.categoryId, categoryId), eq(categoryVersions.status, "draft")));
    if (draft) {
      await tx.update(categoryVersions).set({ definition, createdBy: actorId }).where(eq(categoryVersions.id, draft.id));
    } else {
      const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${categoryVersions.version}), 0)::int` }).from(categoryVersions).where(eq(categoryVersions.categoryId, categoryId));
      await tx.insert(categoryVersions).values({ categoryId, version: max + 1, status: "draft", definition, createdBy: actorId });
    }
  });
}

export async function discardDraft(db: Db, actorId: string, categoryId: string) {
  return mutate(db, async (tx) => {
    const [cat] = await tx.select({ published: categories.currentPublishedVersionId }).from(categories).where(eq(categories.id, categoryId));
    if (!cat?.published) throw new UserError("This category has never been published; delete it instead.");
    await tx.delete(categoryVersions).where(and(eq(categoryVersions.categoryId, categoryId), eq(categoryVersions.status, "draft")));
  });
}

/** What publishing would change (shown before confirming). */
export async function draftDiff(db: Db, categoryId: string) {
  const versions = await db.select().from(categoryVersions).where(eq(categoryVersions.categoryId, categoryId));
  const draft = versions.find((v) => v.status === "draft");
  const published = versions.find((v) => v.status === "published");
  if (!draft) return null;
  return { diff: diffDefinitions(published?.definition ?? null, draft.definition), from: published?.version ?? null, to: draft.version };
}

/** The draft becomes the published version; the old one is archived (still used by its orders). */
export async function publishDraft(db: Db, actorId: string, categoryId: string) {
  return mutate(db, async (tx) => {
    const [cat] = await tx.select().from(categories).where(eq(categories.id, categoryId)).for("update");
    if (!cat) throw new UserError("That category no longer exists.");
    const versions = await tx.select().from(categoryVersions).where(eq(categoryVersions.categoryId, categoryId));
    const draft = versions.find((v) => v.status === "draft");
    if (!draft) throw new UserError("There's no draft to publish.");
    const published = versions.find((v) => v.status === "published");
    const definition = await checkDefinition(tx, categoryId, draft.definition, { forPublish: true });

    if (published) await tx.update(categoryVersions).set({ status: "archived" }).where(eq(categoryVersions.id, published.id));
    await tx.update(categoryVersions).set({ definition, status: "published", publishedAt: new Date() }).where(eq(categoryVersions.id, draft.id));
    await tx.update(categories).set({ currentPublishedVersionId: draft.id }).where(eq(categories.id, categoryId));
    const diff = diffDefinitions(published?.definition ?? null, definition);
    await audit(tx, {
      actorId,
      action: "category.publish",
      entityType: "category",
      entityId: categoryId,
      summary: `Published “${cat.name}” v${draft.version} (+${diff.added.length} −${diff.removed.length} ~${diff.changed.length})`,
      data: { version: draft.version, diff },
    });
    return { version: draft.version };
  });
}

// ---- measurement library --------------------------------------------------------------------

export interface MeasurementInput {
  label: string;
  unit: MeasurementUnit;
  min: number;
  max: number;
  step: number;
  helpText: string | null;
  helpImageKey: string | null;
  group: MeasurementGroup;
  sortOrder: number;
  isActive: boolean;
}

function checkRange(input: Pick<MeasurementInput, "min" | "max" | "step">) {
  if (input.min >= input.max) throw new UserError("Min must be below max.", { min: "Below max" });
  if (input.step <= 0 || (input.max - input.min) / input.step > 1_000_000) throw new UserError("Check the step.", { step: "Too small or zero" });
}

export async function createMeasurement(db: Db, actorId: string, input: MeasurementInput & { key: string }) {
  checkRange(input);
  return mutate(db, async (tx) => {
    const [exists] = await tx.select({ key: measurementDefinitions.key }).from(measurementDefinitions).where(eq(measurementDefinitions.key, input.key));
    if (exists) throw new UserError("That key is taken.", { key: "Already in the library" });
    await tx.insert(measurementDefinitions).values(input);
    await audit(tx, { actorId, action: "measurement.create", entityType: "measurement", entityId: input.key, summary: `Added measurement “${input.label}”` });
  });
}

export async function updateMeasurement(db: Db, actorId: string, key: string, input: MeasurementInput) {
  checkRange(input);
  return mutate(db, async (tx) => {
    const [before] = await tx.select().from(measurementDefinitions).where(eq(measurementDefinitions.key, key));
    if (!before) throw new UserError("That measurement no longer exists.");
    await tx.update(measurementDefinitions).set(input).where(eq(measurementDefinitions.key, key));
    await audit(tx, { actorId, action: "measurement.update", entityType: "measurement", entityId: key, summary: `Updated measurement “${input.label}”`, data: { before: toMeasurementDef(before), after: input } });
  });
}

/** Categories (any version) that use a measurement. */
export async function measurementUsage(db: Db): Promise<Map<string, string[]>> {
  const rows = await db
    .select({ name: categories.name, definition: categoryVersions.definition })
    .from(categoryVersions)
    .innerJoin(categories, eq(categories.id, categoryVersions.categoryId));
  const usage = new Map<string, Set<string>>();
  for (const r of rows) for (const k of measurementKeysOf(r.definition)) usage.set(k, (usage.get(k) ?? new Set()).add(r.name));
  return new Map([...usage].map(([k, v]) => [k, [...v]]));
}

export async function deleteMeasurement(db: Db, actorId: string, key: string) {
  const usage = await measurementUsage(db);
  if (usage.has(key)) throw new UserError(`Used by ${usage.get(key)!.join(", ")} — switch it off instead.`);
  return mutate(db, async (tx) => {
    await tx.delete(measurementDefinitions).where(eq(measurementDefinitions.key, key));
    await audit(tx, { actorId, action: "measurement.delete", entityType: "measurement", entityId: key, summary: `Deleted unused measurement ${key}` });
  });
}
