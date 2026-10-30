import type { Catalog, PublishedCategory } from "./catalog";
import type { CategoryDefinition } from "./categoryDefinition";
import { measurementKeysOf } from "./categoryDefinition";
import { resolveFields, type MeasurementDef, type ResolvedField } from "./categorySchema";
import { searchCategories } from "./categorySearch";
import type { MeasurementUnit, ShippingMode } from "./enums";

// The public category API (GET /api/categories and /api/categories/[key]):
// response shapes and the pure functions that build them. The order form's
// category search reads the same shapes.

/** One measurement a category asks for. */
export interface MeasurementSummary {
  key: string;
  label: string;
  unit: MeasurementUnit;
  /** "always", only under a condition (e.g. AXIS when CYL isn't 0), or optional. */
  required: "always" | "sometimes" | "optional";
}

export interface CategorySummary {
  key: string;
  name: string;
  /** Lucide icon name. */
  icon: string;
  aliases: string[];
  /** The published version; it changes whenever the admin publishes. */
  versionId: string;
  version: number;
  allowedShippingModes: ShippingMode[];
  restrictedNote: string | null;
  /** Measurements in form order, from the measurement library. */
  measurements: MeasurementSummary[];
  /** Every field on the form, measurements included. */
  fieldCount: number;
}

export interface CategoryListItem extends CategorySummary {
  /** Null without a search query. */
  match: { via: string | null; highlight: Array<[number, number]> } | null;
}

export interface CategoryListResponse {
  query: string;
  /** Matches before `limit` was applied. */
  total: number;
  categories: CategoryListItem[];
}

export interface CategoryDetailResponse {
  /** Everything the order form needs to show and validate this category. */
  category: PublishedCategory;
  summary: CategorySummary;
  definition: CategoryDefinition;
  /** The library entries this definition uses (with labels, units and limits). */
  measurements: MeasurementDef[];
  /** The form's fields in order, measurement fields filled in from the library. */
  fields: ResolvedField[];
  /** "How to measure" pictures by image key: stable URLs that redirect to the image. */
  helpImages: Record<string, string>;
}

export const MAX_LIST_LIMIT = 100;

/** Categories a student can order in (digital ones are no longer offered). */
export function orderableCategories(catalog: Catalog): PublishedCategory[] {
  return catalog.categories.filter((c) => c.fulfilment === "physical");
}

/**
 * Every "how to measure" picture the orderable categories show: library
 * pictures for the measurements they use, and per-field pictures. The help
 * image route serves only these, so other uploads can't be fetched through it.
 */
export function helpImageKeysOf(catalog: Catalog): Set<string> {
  const keys = new Set<string>();
  for (const c of orderableCategories(catalog)) {
    try {
      for (const f of resolveFields(c.definition, catalog.measurements)) if (f.helpImageKey) keys.add(f.helpImageKey);
    } catch {
      // Unresolvable definitions are left out of the API altogether.
    }
  }
  return keys;
}

/** Where the API serves a help picture: a stable path, redirected to a short-lived signed URL. */
export function helpImagePath(key: string): string {
  return `/api/help-images/${key}`;
}

export function toCategorySummary(c: PublishedCategory, library: readonly MeasurementDef[]): CategorySummary {
  const fields = resolveFields(c.definition, library);
  return {
    key: c.key,
    name: c.name,
    icon: c.icon,
    aliases: c.aliases,
    versionId: c.versionId,
    version: c.version,
    allowedShippingModes: c.allowedShippingModes,
    restrictedNote: c.restrictedNote,
    measurements: fields
      .filter((f) => f.kind === "measurement")
      .map((f) => ({
        key: f.key,
        label: f.label,
        unit: f.unit as MeasurementUnit,
        required: f.required ? "always" : f.requiredIf ? "sometimes" : "optional",
      })),
    fieldCount: fields.length,
  };
}

/**
 * Summaries of every orderable category, or only those matching `query`
 * (ranked by searchCategories). A category whose definition can't be resolved
 * is left out rather than failing the whole list.
 */
export function categoryList(catalog: Catalog, query = "", limit = MAX_LIST_LIMIT): CategoryListResponse {
  const summaries: CategoryListItem[] = [];
  for (const c of orderableCategories(catalog)) {
    try {
      summaries.push({ ...toCategorySummary(c, catalog.measurements), match: null });
    } catch {
      // An unknown measurement: publishing prevents this, so it's never shown half-broken.
    }
  }
  const q = query.trim();
  const matches = searchCategories(summaries, q);
  return {
    query: q,
    total: matches.length,
    categories: matches.slice(0, limit).map((m) => ({ ...m.item, match: q ? { via: m.via, highlight: m.highlight } : null })),
  };
}

/**
 * Everything the form needs for one category, or null when there's no such
 * orderable category. `helpImageUrl` returns where to load a help picture
 * (null to leave it out, e.g. a key that isn't an admin image).
 */
export function categoryDetail(catalog: Catalog, key: string, helpImageUrl: (key: string) => string | null): CategoryDetailResponse | null {
  const category = orderableCategories(catalog).find((c) => c.key === key);
  if (!category) return null;
  const fields = resolveFields(category.definition, catalog.measurements);
  const used = new Set(measurementKeysOf(category.definition));
  const helpImages: Record<string, string> = {};
  for (const f of fields) {
    if (!f.helpImageKey || f.helpImageKey in helpImages) continue;
    const url = helpImageUrl(f.helpImageKey);
    if (url) helpImages[f.helpImageKey] = url;
  }
  return {
    category,
    summary: toCategorySummary(category, catalog.measurements),
    definition: category.definition,
    measurements: catalog.measurements.filter((m) => used.has(m.key)),
    fields,
    helpImages,
  };
}
