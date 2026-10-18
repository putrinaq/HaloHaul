import { z } from "zod";
import {
  allFields,
  keyOf,
  type CategoryDefinition,
  type Condition,
  type FieldDef,
} from "./categoryDefinition";
import type { MeasurementGroup, MeasurementUnit } from "./enums";

// Turns a stored category definition into validation. Pure and dependency-free
// apart from Zod, so the same code runs in the order form (browser) and on the
// server, which is authoritative and re-validates every submission against the
// order's own category version.

export interface MeasurementDef {
  key: string;
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

/** A field with everything needed to render and check it, measurements looked up. */
export interface ResolvedField {
  key: string;
  kind: FieldDef["kind"];
  label: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  format?: "email";
  options?: string[];
  maxSelected?: number;
  placeholder?: string;
  required: boolean;
  requiredIf?: Condition;
  showIf?: Condition;
  mustExceed?: string;
  helpText?: string;
  helpImageKey?: string;
  section: number;
}

export class UnknownMeasurementError extends Error {
  constructor(key: string) {
    super(`Unknown measurement “${key}”`);
    this.name = "UnknownMeasurementError";
  }
}

/** Flattened fields in form order, with measurement fields filled in from the library. */
export function resolveFields(def: CategoryDefinition, library: readonly MeasurementDef[]): ResolvedField[] {
  const byKey = new Map(library.map((m) => [m.key, m]));
  return def.sections.flatMap((section, s) =>
    section.fields.map((f): ResolvedField => {
      const base = {
        key: keyOf(f),
        kind: f.kind,
        required: f.required,
        requiredIf: f.requiredIf,
        showIf: f.showIf,
        helpText: f.helpText,
        helpImageKey: f.helpImageKey,
        section: s,
      };
      switch (f.kind) {
        case "measurement": {
          const m = byKey.get(f.measurementKey);
          if (!m) throw new UnknownMeasurementError(f.measurementKey);
          return {
            ...base,
            label: m.label,
            unit: m.unit,
            min: m.min,
            max: m.max,
            step: m.step,
            mustExceed: f.mustExceed,
            helpText: f.helpText ?? m.helpText ?? undefined,
            helpImageKey: f.helpImageKey ?? m.helpImageKey ?? undefined,
          };
        }
        case "number":
          return { ...base, label: f.label, unit: f.unit, min: f.min, max: f.max, step: f.step, mustExceed: f.mustExceed, placeholder: f.placeholder };
        case "text":
          return { ...base, label: f.label, maxLength: f.maxLength, format: f.format, placeholder: f.placeholder };
        case "textarea":
          return { ...base, label: f.label, maxLength: f.maxLength, placeholder: f.placeholder };
        case "select":
          return { ...base, label: f.label, options: f.options };
        case "multiselect":
          return { ...base, label: f.label, options: f.options, maxSelected: f.maxSelected };
        case "boolean":
          return { ...base, label: f.label };
      }
    }),
  );
}

/** "Chest (cm)" — how a field is named in labels and error messages. */
export function fieldName(f: Pick<ResolvedField, "label" | "unit">): string {
  return f.unit ? `${f.label} (${f.unit})` : f.label;
}

// ---- conditions ---------------------------------------------------------------

/** A condition on a missing value is false (so `cyl neq 0` doesn't fire on an empty CYL). */
export function evaluateCondition(cond: Condition, values: Readonly<Record<string, unknown>>): boolean {
  const v = values[cond.field];
  if (v === undefined) return false;
  const list = Array.isArray(v) ? v : [v];
  const same = (a: unknown, b: unknown) => (typeof a === "number" || typeof b === "number" ? Number(a) === Number(b) : String(a) === String(b));
  switch (cond.op) {
    case "eq":
      return list.some((x) => same(x, cond.value));
    case "neq":
      return !list.some((x) => same(x, cond.value));
    case "in":
      return list.some((x) => (cond.value as Array<string | number>).some((c) => same(x, c)));
    case "gt":
      return typeof v === "number" && v > (cond.value as number);
    case "lt":
      return typeof v === "number" && v < (cond.value as number);
  }
}

// ---- coercion -----------------------------------------------------------------

const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/** True if `value` is a multiple of `step` from `min` (tolerant of float noise like 0.1+0.2). */
export function isOnStep(value: number, step: number, min: number): boolean {
  const n = (value - min) / step;
  return Math.abs(n - Math.round(n)) < 1e-9;
}

type Coerced = { value: unknown } | { error: string };

function coerce(f: ResolvedField, raw: unknown): Coerced {
  const name = fieldName(f);
  switch (f.kind) {
    case "measurement":
    case "number": {
      if (isBlank(raw)) return { value: undefined };
      const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : NaN;
      if (!Number.isFinite(n)) return { error: `${name} must be a number` };
      if (n < f.min! || n > f.max!) return { error: `${name} must be between ${f.min} and ${f.max}` };
      if (!isOnStep(n, f.step!, f.min!)) return { error: `${name} must be in steps of ${f.step}` };
      return { value: n };
    }
    case "text":
    case "textarea": {
      if (isBlank(raw)) return { value: undefined };
      if (typeof raw !== "string") return { error: `${name} must be text` };
      const s = raw.trim();
      if (s.length > f.maxLength!) return { error: `${name} must be at most ${f.maxLength} characters` };
      if (f.format === "email" && !z.email().safeParse(s).success) return { error: `${name} must be a valid email` };
      return { value: s };
    }
    case "select": {
      if (isBlank(raw)) return { value: undefined };
      if (typeof raw !== "string" || !f.options!.includes(raw)) return { error: `Choose a valid ${f.label}` };
      return { value: raw };
    }
    case "multiselect": {
      if (isBlank(raw)) return { value: undefined };
      const arr = Array.isArray(raw) ? raw : [raw];
      if (!arr.every((x) => typeof x === "string" && f.options!.includes(x))) return { error: `Choose valid options for ${f.label}` };
      const unique = [...new Set(arr as string[])];
      if (unique.length === 0) return { value: undefined };
      if (f.maxSelected && unique.length > f.maxSelected) return { error: `Choose at most ${f.maxSelected} for ${f.label}` };
      return { value: unique };
    }
    case "boolean": {
      if (isBlank(raw)) return { value: undefined };
      if (raw === true || raw === "true" || raw === "on") return { value: true };
      if (raw === false || raw === "false") return { value: false };
      return { error: `${name} must be yes or no` };
    }
  }
}

// ---- validation ---------------------------------------------------------------

export type DetailsResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; fieldErrors: Record<string, string>; partial: Record<string, unknown> };

/** Which fields show for these (raw) values. Conditions only look at fields above, so one pass suffices. */
export function visibleKeys(fields: readonly ResolvedField[], raw: Readonly<Record<string, unknown>>): Set<string> {
  const shown = new Set<string>();
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.showIf && !evaluateCondition(f.showIf, values)) continue;
    shown.add(f.key);
    const c = coerce(f, raw[f.key]);
    if ("value" in c && c.value !== undefined) values[f.key] = c.value;
  }
  return shown;
}

/**
 * Validates category details. Hidden and unknown keys are dropped; blanks are
 * removed; every problem is reported per field (all at once, not just the
 * first), and `partial` keeps whatever was valid so nothing the student typed
 * is lost. A required boolean means "must be ticked".
 */
export function validateDetails(fields: readonly ResolvedField[], rawInput: unknown): DetailsResult {
  const raw = rawInput && typeof rawInput === "object" && !Array.isArray(rawInput) ? (rawInput as Record<string, unknown>) : {};
  const values: Record<string, unknown> = {};
  const fieldErrors: Record<string, string> = {};
  const byKey = new Map(fields.map((f) => [f.key, f]));

  for (const f of fields) {
    if (f.showIf && !evaluateCondition(f.showIf, values)) continue;
    const c = coerce(f, raw[f.key]);
    if ("error" in c) {
      fieldErrors[f.key] = c.error;
      continue;
    }
    const required = f.required || (f.requiredIf ? evaluateCondition(f.requiredIf, values) : false);
    const empty = c.value === undefined || (f.kind === "boolean" && c.value === false);
    if (required && empty) {
      fieldErrors[f.key] =
        f.kind === "boolean" ? `Please tick “${f.label}”` : `${fieldName(f)} is required`;
      continue;
    }
    if (f.mustExceed && typeof c.value === "number") {
      const other = values[f.mustExceed];
      const otherField = byKey.get(f.mustExceed);
      if (typeof other === "number" && c.value <= other) {
        fieldErrors[f.key] = `${fieldName(f)} must be larger than ${otherField ? otherField.label.toLowerCase() : f.mustExceed}`;
        continue;
      }
    }
    if (c.value !== undefined) values[f.key] = c.value;
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors, partial: values } : { ok: true, value: values };
}

/**
 * Zod schema for one category version's details, for the React Hook Form
 * resolver and for server-side parsing. Issues carry the field key as their
 * path, so inside an object they surface as `details.<key>`.
 */
export function buildCategorySchema(def: CategoryDefinition, library: readonly MeasurementDef[]) {
  const fields = resolveFields(def, library);
  return z.unknown().transform((raw, ctx): Record<string, unknown> => {
    const r = validateDetails(fields, raw);
    if (r.ok) return r.value;
    for (const [key, message] of Object.entries(r.fieldErrors)) ctx.addIssue({ code: "custom", path: [key], message, input: raw });
    return z.NEVER;
  });
}

/** The order's option line (`variant_text`), when the definition asks for it. */
export function validateOption(def: CategoryDefinition, variantText: string | null | undefined): string | null {
  if (def.option?.required && !variantText?.trim()) return `${def.option.label} is required`;
  return null;
}

// ---- display ------------------------------------------------------------------

export function formatValue(f: ResolvedField, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (f.kind === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/** Label/value rows for the order pages, in form order. Values for unknown keys are listed last. */
export function describeDetails(
  def: CategoryDefinition,
  library: readonly MeasurementDef[],
  details: Readonly<Record<string, unknown>>,
): Array<{ key: string; label: string; value: string }> {
  let fields: ResolvedField[];
  try {
    fields = resolveFields(def, library);
  } catch {
    fields = [];
  }
  const rows = fields
    .filter((f) => details[f.key] !== undefined && details[f.key] !== "")
    .map((f) => ({ key: f.key, label: fieldName(f), value: formatValue(f, details[f.key]) }));
  const known = new Set(fields.map((f) => f.key));
  for (const [key, value] of Object.entries(details)) {
    if (!known.has(key)) rows.push({ key, label: key, value: String(value) });
  }
  return rows;
}

// ---- saved measurements -------------------------------------------------------

/** `customer_profiles.saved_measurements`: `{ [measurementKey]: number }`. */
export type SavedMeasurements = Record<string, number>;

/** Keeps only known, active, in-range measurement values. */
export function sanitizeSavedMeasurements(raw: unknown, library: readonly MeasurementDef[]): SavedMeasurements {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: SavedMeasurements = {};
  for (const m of library) {
    const v = (raw as Record<string, unknown>)[m.key];
    if (typeof v === "number" && Number.isFinite(v) && v >= m.min && v <= m.max && isOnStep(v, m.step, m.min)) out[m.key] = v;
  }
  return out;
}

/** Prefill values for this definition's measurement fields. */
export function prefillMeasurements(def: CategoryDefinition, saved: SavedMeasurements): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of allFields(def)) if (f.kind === "measurement" && saved[f.measurementKey] !== undefined) out[f.measurementKey] = saved[f.measurementKey];
  return out;
}

/** Merges a just-validated details object's measurements into the saved set. */
export function mergeMeasurements(saved: SavedMeasurements, def: CategoryDefinition, details: Readonly<Record<string, unknown>>): SavedMeasurements {
  const next = { ...saved };
  for (const f of allFields(def)) {
    if (f.kind !== "measurement") continue;
    const v = details[f.measurementKey];
    if (typeof v === "number") next[f.measurementKey] = v;
  }
  return next;
}

export const MEASUREMENT_GROUP_LABELS: Record<MeasurementGroup, string> = {
  upper_body: "Upper body",
  lower_body: "Lower body",
  feet: "Feet",
  hands: "Hands",
  other: "Other",
};

/**
 * The whole library as optional fields (the account page's measurements form),
 * in group order; `section` is the group's index in MEASUREMENT_GROUP_LABELS.
 */
export function libraryFields(library: readonly MeasurementDef[]): ResolvedField[] {
  const groups = Object.keys(MEASUREMENT_GROUP_LABELS) as MeasurementGroup[];
  return library
    .filter((m) => m.isActive)
    .toSorted((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group) || a.sortOrder - b.sortOrder)
    .map((m) => ({
      key: m.key,
      kind: "measurement" as const,
      label: m.label,
      unit: m.unit,
      min: m.min,
      max: m.max,
      step: m.step,
      required: false,
      helpText: m.helpText ?? undefined,
      helpImageKey: m.helpImageKey ?? undefined,
      section: groups.indexOf(m.group),
    }));
}

export function hasMeasurements(def: CategoryDefinition): boolean {
  return allFields(def).some((f) => f.kind === "measurement");
}
