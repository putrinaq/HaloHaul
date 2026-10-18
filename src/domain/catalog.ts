import type { CategoryDefinition } from "./categoryDefinition";
import { resolveFields, validateDetails, validateOption, type MeasurementDef } from "./categorySchema";
import type { CategoryFulfilment, ShippingMode } from "./enums";
import type { Parcel } from "./shipping";

// The published category catalogue as the app sees it: loaded from the
// database on the server (server/data/categories.ts) and passed to client
// components as plain data, so the browser validates with exactly the
// definitions the server will.

export interface CategoryInfo {
  id: string;
  key: string;
  name: string;
  icon: string;
  fulfilment: CategoryFulfilment;
  /** Per-item default parcel used for the shipping estimate. */
  defaultParcel: Parcel;
  allowedShippingModes: ShippingMode[];
  restrictedNote: string | null;
}

export interface PublishedCategory extends CategoryInfo {
  versionId: string;
  version: number;
  definition: CategoryDefinition;
}

export interface Catalog {
  /** Active categories with a published version, in display order. */
  categories: PublishedCategory[];
  /** The whole measurement library (inactive entries too, for old orders). */
  measurements: MeasurementDef[];
}

export function findCategory(catalog: Catalog, key: string | null | undefined): PublishedCategory | null {
  return key ? (catalog.categories.find((c) => c.key === key) ?? null) : null;
}

export function isShippable(c: Pick<CategoryInfo, "fulfilment">): boolean {
  return c.fulfilment === "physical";
}

export type CategoryInputResult =
  | { ok: true; details: Record<string, unknown> }
  | { ok: false; fieldErrors: Record<string, string>; partial: Record<string, unknown> };

/**
 * Validates details and the option line against one category version. Error
 * keys are field keys, or "variant_text" for the option line.
 */
export function validateCategoryInput(
  definition: CategoryDefinition,
  measurements: readonly MeasurementDef[],
  details: unknown,
  variantText: string | null | undefined,
): CategoryInputResult {
  const r = validateDetails(resolveFields(definition, measurements), details);
  const optionError = validateOption(definition, variantText);
  if (r.ok && !optionError) return { ok: true, details: r.value };
  const fieldErrors = r.ok ? {} : { ...r.fieldErrors };
  if (optionError) fieldErrors.variant_text = optionError;
  return { ok: false, fieldErrors, partial: r.ok ? r.value : r.partial };
}
