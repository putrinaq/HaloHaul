import "server-only";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { categories, categoryVersions, measurementDefinitions } from "../../db/schema";
import type { Db } from "../../db/types";
import type { Catalog, CategoryInfo, PublishedCategory } from "../../domain/catalog";
import type { CategoryDefinition } from "../../domain/categoryDefinition";
import type { MeasurementDef } from "../../domain/categorySchema";
import type { CategoryVersionStatus } from "../../domain/enums";

// Published categories and the measurement library, cached in memory. There is
// one app instance, so publishing (or any category/measurement edit) simply
// calls invalidateCatalog(). Published versions never change (a trigger
// freezes them), so they are cached by id for good.

type CategoryRow = typeof categories.$inferSelect;

export function toCategoryInfo(c: CategoryRow): CategoryInfo {
  return {
    id: c.id,
    key: c.key,
    name: c.name,
    icon: c.icon,
    fulfilment: c.fulfilment,
    defaultParcel: {
      weightG: c.defaultWeightG,
      lengthMm: c.defaultLengthMm,
      widthMm: c.defaultWidthMm,
      heightMm: c.defaultHeightMm,
    },
    allowedShippingModes: c.allowedShippingModes,
    restrictedNote: c.restrictedNote,
  };
}

export function toMeasurementDef(m: typeof measurementDefinitions.$inferSelect): MeasurementDef {
  return {
    key: m.key,
    label: m.label,
    unit: m.unit,
    min: m.min,
    max: m.max,
    step: m.step,
    helpText: m.helpText,
    helpImageKey: m.helpImageKey,
    group: m.group,
    sortOrder: m.sortOrder,
    isActive: m.isActive,
  };
}

export interface CategoryVersionView {
  category: CategoryInfo;
  versionId: string;
  version: number;
  status: CategoryVersionStatus;
  definition: CategoryDefinition;
}

// Keyed by the database handle, so tests with their own throwaway DBs never share a cache.
const catalogCache = new WeakMap<object, Promise<Catalog>>();
const versionCache = new WeakMap<object, Map<string, Promise<CategoryVersionView | null>>>();

async function loadMeasurements(db: Db): Promise<MeasurementDef[]> {
  const rows = await db
    .select()
    .from(measurementDefinitions)
    .orderBy(asc(measurementDefinitions.group), asc(measurementDefinitions.sortOrder), asc(measurementDefinitions.label));
  return rows.map(toMeasurementDef);
}

async function loadCatalog(db: Db): Promise<Catalog> {
  const [rows, measurements] = await Promise.all([
    db
      .select({ category: categories, version: categoryVersions })
      .from(categories)
      .innerJoin(categoryVersions, eq(categoryVersions.id, categories.currentPublishedVersionId))
      .where(and(eq(categories.isActive, true), isNotNull(categories.currentPublishedVersionId)))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    loadMeasurements(db),
  ]);
  return {
    categories: rows.map(
      (r): PublishedCategory => ({
        ...toCategoryInfo(r.category),
        versionId: r.version.id,
        version: r.version.version,
        definition: r.version.definition,
      }),
    ),
    measurements,
  };
}

/** Active, published categories and the full measurement library. */
export function getCatalog(db: Db): Promise<Catalog> {
  let p = catalogCache.get(db);
  if (!p) {
    p = loadCatalog(db);
    catalogCache.set(db, p);
    p.catch(() => catalogCache.delete(db));
  }
  return p;
}

/** Call after any change to categories, versions or measurements. */
export function invalidateCatalog(db: Db): void {
  catalogCache.delete(db);
  // Cached versions carry the category's name and icon, which can be edited.
  versionCache.delete(db);
}

/** One version (the one an order was made with), whatever its status now. */
export function getCategoryVersion(db: Db, versionId: string): Promise<CategoryVersionView | null> {
  let byId = versionCache.get(db);
  if (!byId) versionCache.set(db, (byId = new Map()));
  const cached = byId.get(versionId);
  if (cached) return cached;

  const p = db
    .select({ category: categories, version: categoryVersions })
    .from(categoryVersions)
    .innerJoin(categories, eq(categories.id, categoryVersions.categoryId))
    .where(eq(categoryVersions.id, versionId))
    .then(([r]): CategoryVersionView | null =>
      r
        ? {
            category: toCategoryInfo(r.category),
            versionId: r.version.id,
            version: r.version.version,
            status: r.version.status,
            definition: r.version.definition,
          }
        : null,
    );
  // Drafts can still change, so only frozen (published/archived) versions stay cached.
  byId.set(versionId, p);
  p.then(
    (v) => {
      if (!v || v.status === "draft") byId.delete(versionId);
    },
    () => byId.delete(versionId),
  );
  return p;
}
