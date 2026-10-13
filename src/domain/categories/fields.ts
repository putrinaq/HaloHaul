import { z } from "zod";

// Field metadata drives both the Zod schema and the generic <CategoryFields>
// renderer, so the form, the browser validation and the server validation all
// come from one definition.

interface BaseField {
  key: string;
  label: string;
  help?: string;
  placeholder?: string;
  optional?: boolean;
}

export interface NumberField extends BaseField {
  input: "number";
  unit?: string;
  min: number;
  max: number;
  step: number;
}

export interface TextField extends BaseField {
  input: "text" | "textarea" | "email";
  maxLength: number;
}

export interface SelectField extends BaseField {
  input: "select";
  options: readonly { value: string; label: string }[];
}

export type FieldMeta = NumberField | TextField | SelectField;

/** "" / null / whitespace from an empty input → undefined, so "required" fires. */
function emptyToUndefined(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

function labelWithUnit(f: FieldMeta): string {
  return f.input === "number" && f.unit ? `${f.label} (${f.unit})` : f.label;
}

/** True if `value` is a multiple of `step` (tolerant of float noise like 0.1+0.2). */
function isOnStep(value: number, step: number, min: number): boolean {
  const n = (value - min) / step;
  return Math.abs(n - Math.round(n)) < 1e-9;
}

export function fieldSchema(f: FieldMeta): z.ZodType {
  const name = labelWithUnit(f);
  const required = `${name} is required`;
  let schema: z.ZodType;

  switch (f.input) {
    case "number": {
      const num = z
        .number({
          error: (iss) => (iss.input === undefined ? required : `${name} must be a number`),
        })
        .refine((v) => Number.isFinite(v), `${name} must be a number`)
        .refine((v) => v >= f.min && v <= f.max, `${name} must be between ${f.min} and ${f.max}`)
        .refine((v) => isOnStep(v, f.step, f.min), `${name} must be in steps of ${f.step}`);
      schema = z.preprocess((v) => {
        const e = emptyToUndefined(v);
        if (typeof e === "string") {
          const n = Number(e.trim());
          return Number.isNaN(n) ? e : n;
        }
        return e;
      }, f.optional ? num.optional() : num);
      break;
    }
    case "select": {
      const values = f.options.map((o) => o.value) as [string, ...string[]];
      const sel = z.enum(values, {
        error: (iss) => (iss.input === undefined ? required : `Choose a valid ${f.label}`),
      });
      schema = z.preprocess(emptyToUndefined, f.optional ? sel.optional() : sel);
      break;
    }
    case "email":
    case "text":
    case "textarea": {
      const tooLong = `${name} must be at most ${f.maxLength} characters`;
      const str =
        f.input === "email"
          ? z
              .email({
                error: (iss) =>
                  iss.input === undefined ? required : `${name} must be a valid email`,
              })
              .max(f.maxLength, tooLong)
          : z.string({ error: required }).max(f.maxLength, tooLong);
      schema = z.preprocess((v) => {
        const e = emptyToUndefined(v);
        return typeof e === "string" ? e.trim() : e;
      }, f.optional ? str.optional() : str);
      break;
    }
  }
  return schema;
}

export function buildDetailsSchema(fields: readonly FieldMeta[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) shape[f.key] = fieldSchema(f);
  return z.strictObject(shape);
}

// ---- builders --------------------------------------------------------------

export const cm = (
  key: string,
  label: string,
  min: number,
  max: number,
  extra: Partial<NumberField> = {},
): NumberField => ({ key, label, input: "number", unit: "cm", min, max, step: 0.5, ...extra });

export const text = (
  key: string,
  label: string,
  extra: Partial<TextField> = {},
): TextField => ({ key, label, input: "text", maxLength: 200, ...extra });

/** Spherical / cylindrical power in dioptres, 0.25 steps. */
export const dioptre = (key: string, label: string, min: number, max: number): NumberField => ({
  key,
  label,
  input: "number",
  unit: "D",
  min,
  max,
  step: 0.25,
});
