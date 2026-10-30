import { describe, expect, it } from "vitest";
import { seedCatalog } from "../db/seed/catalog";
import { cleanDraftData, summarizeDraft } from "./drafts";

const catalog = seedCatalog();
const complete = {
  pathType: "url",
  productUrl: "https://item.taobao.com/item.htm?id=1",
  itemName: "Canvas sneakers",
  quantity: 2,
  category: "clothing_top",
  details: { height_cm: 172, weight_kg: 63, chest_cm: 96, shoulder_cm: 44, arm_length_cm: 62, body_length_cm: 70 },
  variantText: "White / L",
  shippingMode: "air",
  contact: { displayName: "Alice Tan", phone: "012-345 6789", campus: "Main" },
};

describe("cleanDraftData", () => {
  it("keeps the form's fields and drops the terms box and anything else", () => {
    expect(cleanDraftData({ ...complete, acceptTerms: true, evil: "x" })).toEqual(complete);
  });

  it("refuses things that aren't a form, or are far too big", () => {
    expect(cleanDraftData(null)).toBeNull();
    expect(cleanDraftData([1])).toBeNull();
    expect(cleanDraftData("hi")).toBeNull();
    expect(cleanDraftData({ remarks: "x".repeat(70_000) })).toBeNull();
  });
});

describe("summarizeDraft", () => {
  it("is ready when the order would pass the same checks as a submitted one", () => {
    expect(summarizeDraft(complete, catalog)).toEqual({
      itemName: "Canvas sneakers",
      pathType: "url",
      categoryName: "Clothing — top",
      quantity: 2,
      ready: true,
      missing: 0,
      firstProblem: null,
    });
  });

  it("counts what's missing and names the first thing", () => {
    const s = summarizeDraft({ ...complete, details: { chest_cm: 96 } }, catalog);
    expect(s).toMatchObject({ ready: false, missing: 5, firstProblem: "Height (cm) is required" });
  });

  it("copes with a draft saved on the very first step", () => {
    expect(summarizeDraft({ pathType: "reverse_search" }, catalog)).toMatchObject({
      itemName: "Untitled item",
      pathType: "reverse_search",
      categoryName: null,
      quantity: 1,
      ready: false,
    });
  });
});
