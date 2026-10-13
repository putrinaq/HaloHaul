import { z } from "zod";
import { CATEGORY_DEFINITIONS, type CategoryDefinition } from "./definitions";

export type { CategoryDefinition } from "./definitions";
export type { FieldMeta, NumberField, SelectField, TextField } from "./fields";

// Registry keyed by category, holding every version ever shipped. New schema
// versions are appended (never edited in place) so old orders, which store
// `category_schema_version`, keep rendering with the fields they were made with.

const registry = new Map<string, Map<number, CategoryDefinition>>();
for (const def of CATEGORY_DEFINITIONS) {
  const versions = registry.get(def.key) ?? new Map<number, CategoryDefinition>();
  if (versions.has(def.version)) {
    throw new Error(`Duplicate category definition ${def.key}@${def.version}`);
  }
  versions.set(def.version, def);
  registry.set(def.key, versions);
}

export const CATEGORY_KEYS = [...registry.keys()] as [string, ...string[]];

export const categoryKeySchema = z.enum(CATEGORY_KEYS, { error: "Choose a category" });

export class UnknownCategoryError extends Error {
  constructor(key: string, version?: number) {
    super(`Unknown category ${key}${version === undefined ? "" : `@${version}`}`);
    this.name = "UnknownCategoryError";
  }
}

export function latestVersion(key: string): number {
  const versions = registry.get(key);
  if (!versions) throw new UnknownCategoryError(key);
  return Math.max(...versions.keys());
}

/** The definition an order was created with, or the latest if no version given. */
export function getCategory(key: string, version?: number): CategoryDefinition {
  const versions = registry.get(key);
  const def = versions?.get(version ?? latestVersion(key));
  if (!def) throw new UnknownCategoryError(key, version);
  return def;
}

/** Categories offered on new orders (latest version of each). */
export function currentCategories(): CategoryDefinition[] {
  return CATEGORY_KEYS.map((k) => getCategory(k));
}

export interface CategoryValidationInput {
  category: string;
  version?: number;
  details: unknown;
  variantText?: string | null;
}

export type CategoryValidationResult =
  | { ok: true; category: string; version: number; details: Record<string, unknown> }
  | { ok: false; fieldErrors: Record<string, string> };

/**
 * Validate category details + the variant requirement. The same function runs
 * in the browser (via the Zod resolver) and on the server before insert.
 * Error keys are field keys, or "variant_text".
 */
export function validateCategoryDetails(input: CategoryValidationInput): CategoryValidationResult {
  const def = getCategory(input.category, input.version);
  const fieldErrors: Record<string, string> = {};

  const parsed = def.schema.safeParse(input.details ?? {});
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path.length ? String(issue.path[0]) : "_form";
      fieldErrors[key] ??= issue.message;
    }
  }
  if (def.variantRequired && !input.variantText?.trim()) {
    fieldErrors.variant_text = `${def.variantRequired.label} is required`;
  }

  if (!parsed.success || Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, category: def.key, version: def.version, details: parsed.data };
}

// ---- saved measurements ----------------------------------------------------

/**
 * `customer_profiles.saved_measurements` shape: `{ [categoryKey]: details }`,
 * only for categories that save to the profile. Each entry is validated with
 * that category's latest schema; invalid or stale entries are dropped rather
 * than prefilled.
 */
export type SavedMeasurements = Record<string, Record<string, unknown>>;

export function sanitizeSavedMeasurements(raw: unknown): SavedMeasurements {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: SavedMeasurements = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!registry.has(key)) continue;
    const def = getCategory(key);
    if (!def.savesToProfile) continue;
    const parsed = def.schema.safeParse(value);
    if (parsed.success) out[key] = parsed.data;
  }
  return out;
}

/** Values to prefill the form with for this category (empty object if none). */
export function prefillFromSaved(category: string, saved: unknown): Record<string, unknown> {
  return sanitizeSavedMeasurements(saved)[category] ?? {};
}

/** Merge a just-submitted measurement set back into the profile's saved set. */
export function mergeSavedMeasurements(
  saved: unknown,
  category: string,
  details: Record<string, unknown>,
): SavedMeasurements {
  const current = sanitizeSavedMeasurements(saved);
  const def = getCategory(category);
  if (!def.savesToProfile) return current;
  const parsed = def.schema.parse(details);
  return { ...current, [category]: parsed };
}
