import { describe, expect, it } from "vitest";
import { seedCatalog } from "../db/seed/catalog";
import type { Catalog } from "./catalog";
import { categoryDetail, categoryList, helpImageKeysOf, helpImagePath, orderableCategories, toCategorySummary } from "./categoryApi";
import { validateCategoryInput } from "./catalog";

const catalog = seedCatalog();
const HELP = "admin/help/0b6c7a52-3f1e-4c8e-9a51-7d2f4c1e9b10.webp";

/** The seed with a help picture on the ring measurement. */
function withHelpImage(): Catalog {
  return {
    ...catalog,
    measurements: catalog.measurements.map((m) => (m.key === "ring_inner_circumference_mm" ? { ...m, helpImageKey: HELP } : m)),
  };
}

describe("categoryList", () => {
  it("lists every orderable category in display order, without digital products", () => {
    const list = categoryList(catalog);
    expect(list.query).toBe("");
    expect(list.categories.map((c) => c.key)).toEqual(orderableCategories(catalog).map((c) => c.key));
    expect(list.categories.map((c) => c.key)).not.toContain("digital");
    expect(list.total).toBe(list.categories.length);
    expect(list.categories.every((c) => c.match === null)).toBe(true);
  });

  it("summarises the measurements each category asks for", () => {
    const top = categoryList(catalog).categories.find((c) => c.key === "clothing_top")!;
    expect(top.measurements).toEqual([
      { key: "height_cm", label: "Height", unit: "cm", required: "always" },
      { key: "weight_kg", label: "Weight", unit: "kg", required: "always" },
      { key: "chest_cm", label: "Chest", unit: "cm", required: "always" },
      { key: "shoulder_cm", label: "Shoulder width", unit: "cm", required: "always" },
      { key: "arm_length_cm", label: "Arm length", unit: "cm", required: "always" },
      { key: "body_length_cm", label: "Body length", unit: "cm", required: "always" },
    ]);
    expect(top.fieldCount).toBe(6);
    // Glasses: the axis is only required when the cylinder isn't 0.
    const glasses = categoryList(catalog).categories.find((c) => c.key === "glasses_prescription")!;
    expect(glasses.measurements.map((m) => m.key)).toEqual(["pd_mm"]);
    expect(glasses.fieldCount).toBeGreaterThan(1);
  });

  it("searches and ranks with the same rules as the order form, then applies the limit", () => {
    const list = categoryList(catalog, "  kasut ");
    expect(list.query).toBe("kasut");
    expect(list.categories[0]).toMatchObject({ key: "shoes", match: { via: "kasut", highlight: [] } });
    const capped = categoryList(catalog, "a", 2);
    expect(capped.categories.length).toBeLessThanOrEqual(2);
    expect(capped.total).toBeGreaterThanOrEqual(capped.categories.length);
    expect(categoryList(catalog, "zzzz").categories).toEqual([]);
  });

  it("leaves out a category whose definition no longer resolves instead of failing", () => {
    const broken: Catalog = { ...catalog, measurements: catalog.measurements.filter((m) => m.key !== "chest_cm") };
    const keys = categoryList(broken).categories.map((c) => c.key);
    expect(keys).not.toContain("clothing_top");
    expect(keys).toContain("shoes");
  });
});

describe("categoryDetail", () => {
  it("returns everything the form needs, and it validates like the server", () => {
    const detail = categoryDetail(catalog, "ring", () => null)!;
    expect(detail.category).toMatchObject({ key: "ring", versionId: "ver-ring-1" });
    expect(detail.summary).toEqual(toCategorySummary(detail.category, catalog.measurements));
    expect(detail.measurements.map((m) => m.key)).toEqual(["ring_inner_circumference_mm"]);
    expect(detail.fields.map((f) => f.key)).toContain("ring_inner_circumference_mm");
    expect(detail.helpImages).toEqual({});
    // A browser holding only this response validates exactly as the server does.
    const ok = validateCategoryInput(detail.definition, detail.measurements, { ring_inner_circumference_mm: 52 }, "");
    expect(ok.ok).toBe(true);
    const missing = validateCategoryInput(detail.definition, detail.measurements, {}, "");
    expect(missing).toMatchObject({ ok: false, fieldErrors: { ring_inner_circumference_mm: expect.any(String) } });
  });

  it("serves help pictures through stable paths, and drops keys the caller rejects", () => {
    expect(categoryDetail(withHelpImage(), "ring", helpImagePath)!.helpImages).toEqual({ [HELP]: `/api/help-images/${HELP}` });
    expect(categoryDetail(withHelpImage(), "ring", () => null)!.helpImages).toEqual({});
  });

  it("is null for unknown keys and for digital products", () => {
    expect(categoryDetail(catalog, "nope", () => null)).toBeNull();
    expect(categoryDetail(catalog, "digital", () => null)).toBeNull();
  });
});

describe("helpImageKeysOf", () => {
  it("collects the help pictures orderable categories use, and nothing else", () => {
    expect(helpImageKeysOf(catalog)).toEqual(new Set());
    expect(helpImageKeysOf(withHelpImage())).toEqual(new Set([HELP]));
    // A picture on a measurement no orderable category uses isn't served.
    const unused: Catalog = {
      ...catalog,
      measurements: [...catalog.measurements, { ...catalog.measurements[0], key: "neck_cm", helpImageKey: HELP }],
    };
    expect(helpImageKeysOf(unused)).toEqual(new Set());
  });
});
