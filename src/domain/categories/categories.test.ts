import { describe, expect, it } from "vitest";
import {
  CATEGORY_KEYS,
  currentCategories,
  getCategory,
  mergeSavedMeasurements,
  prefillFromSaved,
  sanitizeSavedMeasurements,
  UnknownCategoryError,
  validateCategoryDetails,
} from "./index";

describe("registry", () => {
  it("contains every category from the brief", () => {
    expect([...CATEGORY_KEYS].sort()).toEqual(
      [
        "clothing_top", "clothing_bottom", "dress", "bra", "shoes", "ring",
        "glasses_prescription", "contact_lens", "cosmetics", "electronics", "digital", "other",
      ].sort(),
    );
  });

  it("gives every category a version, a schema and a sane default parcel", () => {
    for (const def of currentCategories()) {
      expect(def.version).toBeGreaterThanOrEqual(1);
      expect(def.schema).toBeDefined();
      const p = def.defaultParcel;
      for (const v of [p.weightG, p.lengthMm, p.widthMm, p.heightMm]) {
        expect(Number.isInteger(v) && v >= 0).toBe(true);
      }
      if (def.shippable) expect(p.weightG).toBeGreaterThan(0);
      else expect(p.weightG).toBe(0);
    }
  });

  it("has unique field keys within each category", () => {
    for (const def of currentCategories()) {
      const keys = def.fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("looks up a specific version and rejects unknown ones", () => {
    expect(getCategory("ring", 1).key).toBe("ring");
    expect(() => getCategory("ring", 99)).toThrow(UnknownCategoryError);
    expect(() => getCategory("spaceship")).toThrow(UnknownCategoryError);
  });
});

describe("measurement categories", () => {
  it("reject a submission with a missing measurement and name the field", () => {
    const r = validateCategoryDetails({
      category: "clothing_top",
      details: { chest_cm: 92, shoulder_cm: 40, arm_length_cm: 60 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.fieldErrors)).toEqual(["body_length_cm"]);
      expect(r.fieldErrors.body_length_cm).toBe("Body length (cm) is required");
    }
  });

  it("treat empty strings from inputs as missing", () => {
    const r = validateCategoryDetails({
      category: "clothing_bottom",
      details: { waist_cm: "70", hip_cm: "", inseam_cm: "  " },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors).toEqual({
        hip_cm: "Hip (cm) is required",
        inseam_cm: "Inseam (cm) is required",
      });
    }
  });

  it("coerce numeric strings from form inputs", () => {
    const r = validateCategoryDetails({
      category: "clothing_bottom",
      details: { waist_cm: "70", hip_cm: "95.5", inseam_cm: 78 },
    });
    expect(r).toEqual({
      ok: true,
      category: "clothing_bottom",
      version: 1,
      details: { waist_cm: 70, hip_cm: 95.5, inseam_cm: 78 },
    });
  });

  it("reject out-of-range values (e.g. inches typed into cm)", () => {
    const r = validateCategoryDetails({
      category: "ring",
      details: { inner_circumference_mm: 7 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.inner_circumference_mm).toMatch(/between 35 and 80/);
  });

  it("reject values off the step and non-numbers", () => {
    const r = validateCategoryDetails({
      category: "glasses_prescription",
      details: { sph_left: -1.3, sph_right: "abc", cyl_left: 0, cyl_right: 0, pd_mm: 62 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors.sph_left).toMatch(/steps of 0.25/);
      expect(r.fieldErrors.sph_right).toMatch(/must be a number/);
    }
  });

  it("reject unknown keys rather than storing them", () => {
    const r = validateCategoryDetails({
      category: "ring",
      details: { inner_circumference_mm: 52, sneaky: "x" },
    });
    expect(r.ok).toBe(false);
  });
});

describe("glasses prescription", () => {
  const base = { sph_left: -2.25, sph_right: -2, cyl_left: 0, cyl_right: 0, pd_mm: 63 };

  it("accepts no-astigmatism prescriptions without an axis", () => {
    expect(validateCategoryDetails({ category: "glasses_prescription", details: base }).ok).toBe(true);
  });

  it("requires the axis when CYL is not 0", () => {
    const r = validateCategoryDetails({
      category: "glasses_prescription",
      details: { ...base, cyl_right: -0.75 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors).toEqual({ axis_right: "Axis right (°) is required when CYL right is not 0" });
  });

  it("accepts a full astigmatism prescription", () => {
    const r = validateCategoryDetails({
      category: "glasses_prescription",
      details: { ...base, cyl_left: -0.5, axis_left: 180, cyl_right: -0.75, axis_right: 90 },
    });
    expect(r.ok).toBe(true);
  });
});

describe("variant-driven categories", () => {
  it("require colour for contact lenses", () => {
    const details = { sph_left: -3, sph_right: -3.25 };
    const missing = validateCategoryDetails({ category: "contact_lens", details, variantText: " " });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.fieldErrors).toEqual({ variant_text: "Colour is required" });
    expect(validateCategoryDetails({ category: "contact_lens", details, variantText: "Hazel" }).ok).toBe(true);
  });

  it("require shade for cosmetics", () => {
    const r = validateCategoryDetails({ category: "cosmetics", details: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.variant_text).toBe("Shade is required");
  });
});

describe("other categories", () => {
  it("validate the digital delivery email", () => {
    const bad = validateCategoryDetails({ category: "digital", details: { region: "SEA", delivery_email: "nope" } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.fieldErrors.delivery_email).toMatch(/valid email/);
    const good = validateCategoryDetails({ category: "digital", details: { region: "SEA", delivery_email: " a@b.co " } });
    expect(good).toMatchObject({ ok: true, details: { delivery_email: "a@b.co" } });
  });

  it("validate the shoe size system", () => {
    const r = validateCategoryDetails({ category: "shoes", details: { size: "38", size_system: "JP", foot_length_cm: 24 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.size_system).toBe("Choose a valid Size system");
  });

  it("validate bra overbust > underbust", () => {
    const r = validateCategoryDetails({ category: "bra", details: { underbust_cm: 80, overbust_cm: 75 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.overbust_cm).toMatch(/larger than underbust/);
  });
});

describe("saved measurements", () => {
  const top = { chest_cm: 92, shoulder_cm: 40, arm_length_cm: 60, body_length_cm: 68 };

  it("prefills from a valid saved set", () => {
    expect(prefillFromSaved("clothing_top", { clothing_top: top })).toEqual(top);
    expect(prefillFromSaved("dress", { clothing_top: top })).toEqual({});
  });

  it("drops invalid, unknown and non-profile entries", () => {
    const saved = {
      clothing_top: top,
      ring: { inner_circumference_mm: 5 }, // invalid
      spaceship: { x: 1 }, // unknown
      cosmetics: {}, // never saved to profile
    };
    expect(sanitizeSavedMeasurements(saved)).toEqual({ clothing_top: top });
    expect(sanitizeSavedMeasurements(null)).toEqual({});
    expect(sanitizeSavedMeasurements([1, 2])).toEqual({});
  });

  it("merges a new submission into the saved set", () => {
    const merged = mergeSavedMeasurements({ clothing_top: top }, "ring", { inner_circumference_mm: "52" });
    expect(merged).toEqual({ clothing_top: top, ring: { inner_circumference_mm: 52 } });
    expect(mergeSavedMeasurements({}, "cosmetics", {})).toEqual({});
  });
});
