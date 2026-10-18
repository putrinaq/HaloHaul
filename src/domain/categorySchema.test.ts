import { describe, expect, it } from "vitest";
import { z } from "zod";
import { seedCatalog } from "../db/seed/catalog";
import { findCategory } from "./catalog";
import { definitionSchema, type CategoryDefinitionInput } from "./categoryDefinition";
import {
  buildCategorySchema,
  describeDetails,
  evaluateCondition,
  libraryFields,
  mergeMeasurements,
  prefillMeasurements,
  resolveFields,
  sanitizeSavedMeasurements,
  UnknownMeasurementError,
  validateDetails,
  validateOption,
} from "./categorySchema";

const catalog = seedCatalog();
const library = catalog.measurements;
const def = (d: CategoryDefinitionInput) => definitionSchema.parse(d);
const cat = (key: string) => findCategory(catalog, key)!.definition;

function check(definition: ReturnType<typeof def>, details: unknown) {
  return validateDetails(resolveFields(definition, library), details);
}
function errorsOf(definition: ReturnType<typeof def>, details: unknown) {
  const r = check(definition, details);
  return r.ok ? {} : r.fieldErrors;
}

describe("measurement fields", () => {
  it("take label, unit and limits from the library", () => {
    const [f] = resolveFields(cat("ring"), library);
    expect(f).toMatchObject({ key: "ring_inner_circumference_mm", label: "Ring inner circumference", unit: "mm", min: 35, max: 80, step: 0.5 });
    expect(f.helpText).toMatch(/paper strip/);
  });

  it("validate range and step, and name the field with its unit", () => {
    expect(errorsOf(cat("ring"), { ring_inner_circumference_mm: 30 })).toEqual({
      ring_inner_circumference_mm: "Ring inner circumference (mm) must be between 35 and 80",
    });
    expect(errorsOf(cat("ring"), { ring_inner_circumference_mm: 52.3 }).ring_inner_circumference_mm).toMatch(/steps of 0.5/);
    expect(check(cat("ring"), { ring_inner_circumference_mm: "52.5" })).toEqual({ ok: true, value: { ring_inner_circumference_mm: 52.5 } });
  });

  it("throw for a measurement missing from the library", () => {
    expect(() => resolveFields(def({ sections: [{ fields: [{ kind: "measurement", measurementKey: "wingspan_cm" }] }] }), library)).toThrow(
      UnknownMeasurementError,
    );
  });
});

describe("validateDetails", () => {
  it("names every missing required field and keeps what was entered", () => {
    const r = check(cat("clothing_top"), { chest_cm: 96, shoulder_cm: "" });
    expect(r).toEqual({
      ok: false,
      fieldErrors: {
        shoulder_cm: "Shoulder width (cm) is required",
        arm_length_cm: "Arm length (cm) is required",
        body_length_cm: "Body length (cm) is required",
      },
      partial: { chest_cm: 96 },
    });
  });

  it("handles every field kind", () => {
    const d = def({
      sections: [
        {
          fields: [
            { kind: "number", key: "n", label: "N", unit: "D", min: -2, max: 2, step: 0.25, required: true },
            { kind: "text", key: "t", label: "T", maxLength: 5 },
            { kind: "text", key: "email", label: "Email", format: "email" },
            { kind: "textarea", key: "ta", label: "Notes", maxLength: 10 },
            { kind: "select", key: "s", label: "Size system", options: ["UK", "EU"], required: true },
            { kind: "multiselect", key: "m", label: "Extras", options: ["A", "B", "C"], maxSelected: 2 },
            { kind: "boolean", key: "b", label: "Keep the box?" },
            { kind: "boolean", key: "agree", label: "I checked the size chart", required: true },
          ],
        },
      ],
    });
    expect(check(d, { n: "-0.75", t: " abc ", email: "a@b.co", ta: "hi", s: "UK", m: ["A", "B", "A"], b: "false", agree: true, extra: "dropped" })).toEqual({
      ok: true,
      value: { n: -0.75, t: "abc", email: "a@b.co", ta: "hi", s: "UK", m: ["A", "B"], b: false, agree: true },
    });
    expect(errorsOf(d, { n: 3, t: "toolong", email: "nope", ta: "x".repeat(11), s: "US", m: ["A", "B", "C"], b: "maybe" })).toEqual({
      n: "N (D) must be between -2 and 2",
      t: "T must be at most 5 characters",
      email: "Email must be a valid email",
      ta: "Notes must be at most 10 characters",
      s: "Choose a valid Size system",
      m: "Choose at most 2 for Extras",
      b: "Keep the box? must be yes or no",
      agree: "Please tick “I checked the size chart”",
    });
    expect(errorsOf(d, { n: 0.1, s: "UK", m: ["Z"], agree: true })).toEqual({
      n: "N (D) must be in steps of 0.25",
      m: "Choose valid options for Extras",
    });
  });

  it("applies requiredIf: axis only when CYL is not 0", () => {
    const glasses = cat("glasses_prescription");
    const base = { sph_left: -1, sph_right: -1.25, cyl_left: 0, cyl_right: 0, pd_mm: 62 };
    expect(check(glasses, base).ok).toBe(true);
    expect(errorsOf(glasses, { ...base, cyl_left: -0.5 })).toEqual({ axis_left: "Axis left (°) is required" });
    expect(check(glasses, { ...base, cyl_left: -0.5, axis_left: 90 }).ok).toBe(true);
    // An empty CYL is not "≠ 0": the axis stays optional until CYL is filled in.
    expect(errorsOf(glasses, { ...base, cyl_left: "" })).toEqual({ cyl_left: "CYL left (D) is required" });
  });

  it("applies showIf: hidden fields are neither required nor kept", () => {
    const d = def({
      sections: [
        {
          fields: [
            { kind: "select", key: "kind", label: "Kind", options: ["Hat", "Belt"], required: true },
            { kind: "number", key: "head_cm", label: "Head", unit: "cm", min: 40, max: 70, step: 0.5, required: true, showIf: { field: "kind", op: "eq", value: "Hat" } },
            { kind: "number", key: "belt_cm", label: "Belt length", unit: "cm", min: 50, max: 150, step: 1, required: true, showIf: { field: "kind", op: "in", value: ["Belt"] } },
          ],
        },
      ],
    });
    expect(errorsOf(d, { kind: "Hat" })).toEqual({ head_cm: "Head (cm) is required" });
    expect(check(d, { kind: "Hat", head_cm: 57, belt_cm: 90 })).toEqual({ ok: true, value: { kind: "Hat", head_cm: 57 } });
    expect(check(d, { kind: "Belt", belt_cm: 90 })).toEqual({ ok: true, value: { kind: "Belt", belt_cm: 90 } });
  });

  it("enforces mustExceed (overbust larger than underbust)", () => {
    expect(errorsOf(cat("bra"), { underbust_cm: 75, overbust_cm: 70 })).toEqual({ overbust_cm: "Overbust (cm) must be larger than underbust" });
    expect(check(cat("bra"), { underbust_cm: 70, overbust_cm: 85 }).ok).toBe(true);
  });

  it("ignores input that isn't an object", () => {
    expect(errorsOf(cat("ring"), "nope")).toEqual({ ring_inner_circumference_mm: "Ring inner circumference (mm) is required" });
    expect(errorsOf(cat("ring"), ["x"])).toEqual({ ring_inner_circumference_mm: "Ring inner circumference (mm) is required" });
  });
});

describe("evaluateCondition", () => {
  const v = { n: 5, s: "UK", m: ["A", "B"] };
  it("supports eq, neq, gt, lt and in", () => {
    expect(evaluateCondition({ field: "n", op: "gt", value: 4 }, v)).toBe(true);
    expect(evaluateCondition({ field: "n", op: "lt", value: 4 }, v)).toBe(false);
    expect(evaluateCondition({ field: "s", op: "eq", value: "UK" }, v)).toBe(true);
    expect(evaluateCondition({ field: "s", op: "neq", value: "UK" }, v)).toBe(false);
    expect(evaluateCondition({ field: "s", op: "in", value: ["EU", "UK"] }, v)).toBe(true);
    expect(evaluateCondition({ field: "m", op: "eq", value: "B" }, v)).toBe(true);
    expect(evaluateCondition({ field: "missing", op: "neq", value: 0 }, v)).toBe(false);
  });
});

describe("buildCategorySchema", () => {
  it("works as a Zod schema with errors at details.<key>", () => {
    const schema = z.object({ details: buildCategorySchema(cat("clothing_bottom"), library) });
    const bad = schema.safeParse({ details: { waist_cm: 70, hip_cm: 95 } });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues.map((i) => [i.path.join("."), i.message])).toEqual([["details.inseam_cm", "Inseam (cm) is required"]]);
    expect(schema.parse({ details: { waist_cm: "70", hip_cm: 95, inseam_cm: 80 } })).toEqual({ details: { waist_cm: 70, hip_cm: 95, inseam_cm: 80 } });
  });

  it("keeps validating an old order against its own version after a new one is published", () => {
    const v1 = cat("clothing_top");
    const v2 = def({ sections: [{ fields: [{ kind: "measurement", measurementKey: "chest_cm", required: true }, { kind: "text", key: "fit", label: "Fit", required: true }] }] });
    const oldOrder = { chest_cm: 96, shoulder_cm: 44, arm_length_cm: 62, body_length_cm: 70 };
    expect(buildCategorySchema(v1, library).safeParse(oldOrder).success).toBe(true);
    expect(buildCategorySchema(v2, library).safeParse(oldOrder).success).toBe(false);
  });
});

describe("validateOption", () => {
  it("requires the option line when the definition says so", () => {
    expect(validateOption(cat("cosmetics"), " ")).toBe("Shade is required");
    expect(validateOption(cat("cosmetics"), "#03 Rose")).toBeNull();
    expect(validateOption(cat("clothing_top"), "")).toBeNull();
  });
});

describe("describeDetails", () => {
  it("lists labelled values in form order, then anything unknown", () => {
    expect(describeDetails(cat("bra"), library, { overbust_cm: 85, underbust_cm: 70, legacy: "x" })).toEqual([
      { key: "underbust_cm", label: "Underbust (cm)", value: "70" },
      { key: "overbust_cm", label: "Overbust (cm)", value: "85" },
      { key: "legacy", label: "legacy", value: "x" },
    ]);
  });
});

describe("saved measurements", () => {
  it("keep only known, in-range values", () => {
    expect(sanitizeSavedMeasurements({ chest_cm: 96, hip_cm: 999, waist_cm: "70", nope: 1, foot_length_cm: 24.3 }, library)).toEqual({
      chest_cm: 96,
      foot_length_cm: 24.3,
    });
    expect(sanitizeSavedMeasurements(null, library)).toEqual({});
  });

  it("prefill any category that asks for the same measurement", () => {
    const saved = { chest_cm: 96, waist_cm: 70 };
    expect(prefillMeasurements(cat("dress"), saved)).toEqual({ chest_cm: 96, waist_cm: 70 });
    expect(prefillMeasurements(cat("clothing_top"), saved)).toEqual({ chest_cm: 96 });
  });

  it("merge a submitted order's measurements, ignoring other fields", () => {
    expect(mergeMeasurements({ chest_cm: 90 }, cat("dress"), { chest_cm: 96, length_cm: 110 })).toEqual({ chest_cm: 96 });
  });

  it("list the library as optional fields, grouped", () => {
    const fields = libraryFields(library);
    expect(fields.every((f) => !f.required)).toBe(true);
    expect(fields[0].section).toBe(0); // upper body first
    expect(fields.at(-1)!.key).toBe("pd_mm"); // "other" last
  });
});
