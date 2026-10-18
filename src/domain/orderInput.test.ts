import { describe, expect, it } from "vitest";
import { seedCatalog } from "../db/seed/catalog";
import { validateOrderInput, type OrderFormInput } from "./orderInput";

const catalog = seedCatalog();

const top = { chest_cm: 96, shoulder_cm: 44, arm_length_cm: 62, body_length_cm: 70 };

const valid: OrderFormInput = {
  pathType: "url",
  productUrl: "【淘宝】 https://item.taobao.com/item.htm?id=123 复制打开",
  itemName: "Canvas sneakers",
  quantity: 1,
  category: "clothing_top",
  details: top,
  variantText: "White / L",
  conditionPreference: null,
  shippingMode: "air",
  fulfilment: "campus_pickup",
  domesticFreeShipping: false,
  remarks: "",
  referencePhotoKeys: [],
  saveMeasurements: true,
  contact: { displayName: "Ahmad Nazri", phone: "012-345 6789", campus: "Main campus" },
  acceptTerms: true,
};

function errors(input: Partial<OrderFormInput>) {
  const r = validateOrderInput({ ...valid, ...input }, catalog);
  if (r.ok) throw new Error("expected validation to fail");
  return r.fieldErrors;
}

describe("validateOrderInput", () => {
  it("normalises a valid link order", () => {
    const r = validateOrderInput(valid, catalog);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      pathType: "url",
      rerouted: false,
      platform: "taobao",
      productUrl: "https://item.taobao.com/item.htm?id=123",
      category: "clothing_top",
      categoryVersionId: "ver-clothing_top-1",
      details: top,
      variantText: "White / L",
      shippingMode: "air",
      contact: { displayName: "Ahmad Nazri", phone: "+60123456789", campus: "Main campus" },
    });
  });

  it("names a missing measurement and keeps the rest", () => {
    const e = errors({ details: { chest_cm: 96, shoulder_cm: 44, arm_length_cm: 62 } });
    expect(e).toEqual({ "details.body_length_cm": "Body length (cm) is required" });
  });

  it("requires a supported product link on the link path", () => {
    expect(errors({ productUrl: "" }).productUrl).toBe("Paste the product link");
    expect(errors({ productUrl: "https://www.amazon.com/dp/1" }).productUrl).toMatch(/supported platforms/);
  });

  it("reroutes a RedNote post to reverse search and asks for the condition", () => {
    const e = errors({ productUrl: "https://www.xiaohongshu.com/explore/abc" });
    expect(e).toEqual({ conditionPreference: "Tell us whether secondhand is OK" });

    const r = validateOrderInput({
      ...valid,
      productUrl: "https://www.xiaohongshu.com/explore/abc",
      conditionPreference: "either",
    }, catalog);
    expect(r).toMatchObject({ ok: true, value: { pathType: "reverse_search", rerouted: true, platform: "rednote" } });
  });

  it("requires a photo (or a post link) for reverse search", () => {
    const e = errors({ pathType: "reverse_search", productUrl: "", conditionPreference: "new_only" });
    expect(e.referencePhotoKeys).toMatch(/at least one photo/);
    const ok = validateOrderInput({
      ...valid,
      pathType: "reverse_search",
      productUrl: "",
      conditionPreference: "new_only",
      referencePhotoKeys: ["photos/u1/a.webp"],
    }, catalog);
    expect(ok).toMatchObject({ ok: true, value: { platform: "other", productUrl: null } });
  });

  it("requires a description for consultations", () => {
    const e = errors({ pathType: "consultation", productUrl: "", conditionPreference: "either", remarks: "hi" });
    expect(e.remarks).toMatch(/Describe what you need/);
  });

  it("keeps digital orders on the digital category with no shipping", () => {
    const digital = {
      pathType: "digital" as const,
      productUrl: "",
      category: "digital",
      details: { region: "SEA", delivery_email: "me@example.com" },
      variantText: "",
      shippingMode: "none" as const,
    };
    expect(validateOrderInput({ ...valid, ...digital }, catalog)).toMatchObject({
      ok: true,
      value: { pathType: "digital", shippingMode: "none", conditionPreference: null, fulfilment: "campus_pickup" },
    });
    expect(errors({ ...digital, shippingMode: "air" }).shippingMode).toBe("Digital items don't ship");
    expect(errors({ ...digital, category: "clothing_top", details: top }).category).toMatch(/digital product category/i);
    expect(errors({ category: "digital", details: digital.details }).category).toMatch(/digital product/);
  });

  it("only offers PDD direct-ship for PDD links", () => {
    expect(errors({ shippingMode: "pdd_direct" }).shippingMode).toMatch(/shipping options shown/);
    const pdd = validateOrderInput({
      ...valid,
      productUrl: "https://mobile.yangkeduo.com/goods.html?goods_id=1",
      shippingMode: "pdd_direct",
    }, catalog);
    expect(pdd).toMatchObject({ ok: true, value: { platform: "pdd", shippingMode: "pdd_direct" } });
  });

  it("validates the WhatsApp number and terms", () => {
    expect(errors({ contact: { displayName: "A N", phone: "03-1234 5678", campus: "" } })["contact.phone"]).toMatch(
      /Malaysian mobile/,
    );
    expect(errors({ acceptTerms: false }).acceptTerms).toMatch(/accept the terms/);
  });

  it("requires the variant for variant-driven categories", () => {
    expect(errors({ category: "cosmetics", details: {}, variantText: "" })).toEqual({ variantText: "Shade is required" });
  });

  it("reports errors in early fields even while later steps are still empty", () => {
    const r = validateOrderInput({ pathType: "url", productUrl: "https://www.amazon.com/dp/1", itemName: "", quantity: 1 }, catalog);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors.productUrl).toMatch(/supported platforms/);
    expect(r.fieldErrors.itemName).toBeDefined();
    expect(Object.keys(r.fieldErrors)).toEqual(
      expect.arrayContaining(["productUrl", "itemName", "category", "shippingMode", "contact", "acceptTerms"]),
    );
  });

  it("caps quantity and photos", () => {
    expect(errors({ quantity: 0 }).quantity).toMatch(/at least 1/);
    expect(errors({ referencePhotoKeys: Array.from({ length: 7 }, (_, i) => `k${i}`) }).referencePhotoKeys).toMatch(/Up to 6/);
  });
});
