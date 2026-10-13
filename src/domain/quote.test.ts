import { describe, expect, it } from "vitest";
import { coordinationFeeSen, deliveryFeeSen, upfrontFee } from "./fees";
import { parseFxRate } from "./money";
import { computeQuote } from "./quote";
import { DEFAULT_SETTINGS, parseSettings } from "./settings";

const FX = parseFxRate("0.65");

describe("fees", () => {
  it("uses the defaults from the brief", () => {
    expect(coordinationFeeSen(DEFAULT_SETTINGS)).toBe(600);
    expect(upfrontFee("reverse_search", DEFAULT_SETTINGS)).toEqual({ type: "reverse_search_fee", amountSen: 400 });
    expect(upfrontFee("consultation", DEFAULT_SETTINGS)).toEqual({ type: "consultation_fee", amountSen: 2_500 });
    expect(upfrontFee("url", DEFAULT_SETTINGS)).toBeNull();
    expect(upfrontFee("digital", DEFAULT_SETTINGS)).toBeNull();
  });

  it("charges Lalamove delivery only", () => {
    expect(deliveryFeeSen("lalamove", DEFAULT_SETTINGS)).toBe(300);
    expect(deliveryFeeSen("campus_pickup", DEFAULT_SETTINGS)).toBe(0);
  });

  it("reads overridden values from settings", () => {
    const s = parseSettings({ fees: { coordinationFeeSen: 800 } });
    expect(coordinationFeeSen(s)).toBe(800);
    expect(s.fees.consultationFeeSen).toBe(2_500); // untouched defaults survive
  });
});

describe("computeQuote", () => {
  it("keeps every component separate and totals the range", () => {
    const q = computeQuote({
      itemPriceFen: 10_000, // ¥100
      fxRate: FX,
      serviceFeeSen: 600,
      shippingMinSen: 1_950,
      shippingMaxSen: 3_250,
      deliveryFeeSen: 0,
    });
    expect(q).toEqual({
      itemPriceSen: 6_500,
      serviceFeeSen: 600,
      shippingMinSen: 1_950,
      shippingMaxSen: 3_250,
      deliveryFeeSen: 0,
      feeCreditSen: 0,
      totalMinSen: 9_050,
      totalMaxSen: 10_350,
    });
  });

  it("credits an upfront consultation fee toward the order", () => {
    const q = computeQuote({
      itemPriceFen: 10_000,
      fxRate: FX,
      serviceFeeSen: 600,
      shippingMinSen: 1_000,
      shippingMaxSen: 2_000,
      deliveryFeeSen: 300,
      feeCreditSen: 2_500,
    });
    expect(q.feeCreditSen).toBe(2_500);
    expect(q.totalMinSen).toBe(6_500 + 600 + 300 + 1_000 - 2_500);
    expect(q.totalMaxSen).toBe(6_500 + 600 + 300 + 2_000 - 2_500);
  });

  it("never lets a credit push the total below zero", () => {
    const q = computeQuote({
      itemPriceFen: 100, // ¥1 → 65 sen
      fxRate: FX,
      serviceFeeSen: 600,
      shippingMinSen: 0,
      shippingMaxSen: 0,
      deliveryFeeSen: 0,
      feeCreditSen: 2_500,
    });
    expect(q.feeCreditSen).toBe(665);
    expect(q.totalMinSen).toBe(0);
    expect(q.totalMaxSen).toBe(0);
  });

  it("prices PDD direct-ship as item + coordination fee only", () => {
    const q = computeQuote({
      itemPriceFen: 4_990,
      fxRate: FX,
      serviceFeeSen: 600,
      shippingMinSen: 0,
      shippingMaxSen: 0,
      deliveryFeeSen: 0,
    });
    expect(q.totalMinSen).toBe(q.totalMaxSen);
    expect(q.totalMinSen).toBe(3_244 + 600); // 4990 × 0.65 = 3243.5 → 3244
  });

  it("rejects inverted shipping ranges and negative or fractional parts", () => {
    const ok = { itemPriceFen: 1, fxRate: FX, serviceFeeSen: 0, shippingMinSen: 0, shippingMaxSen: 0, deliveryFeeSen: 0 };
    expect(() => computeQuote({ ...ok, shippingMinSen: 2, shippingMaxSen: 1 })).toThrow();
    expect(() => computeQuote({ ...ok, serviceFeeSen: -1 })).toThrow();
    expect(() => computeQuote({ ...ok, itemPriceFen: 1.5 })).toThrow();
  });
});
