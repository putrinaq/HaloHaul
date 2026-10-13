import { describe, expect, it } from "vitest";
import { parseFxRate } from "./money";
import { DEFAULT_SETTINGS, parseSettings, type Rate } from "./settings";
import {
  billableWeightG,
  estimateShipping,
  finalShippingCost,
  rateCostFen,
  scaleParcel,
  volumetricWeightG,
} from "./shipping";

const FX = parseFxRate("0.65");
const rate: Rate = { firstKgFen: 3_000, additionalKgFen: 2_000, stepG: 1000, volumetricDivisor: 6000 };

describe("volumetric and billable weight", () => {
  it("computes L×W×H/6000 in grams", () => {
    // 30×20×10 cm = 6000 cm³ → 1 kg
    expect(volumetricWeightG({ weightG: 0, lengthMm: 300, widthMm: 200, heightMm: 100 })).toBe(1000);
  });

  it("rounds volumetric weight up to the next gram", () => {
    // 1 mm³ is a sliver of a gram, but still counts
    expect(volumetricWeightG({ weightG: 0, lengthMm: 1, widthMm: 1, heightMm: 1 })).toBe(1);
  });

  it("takes the larger of actual and volumetric", () => {
    const light = { weightG: 400, lengthMm: 300, widthMm: 200, heightMm: 100 };
    const heavy = { weightG: 2500, lengthMm: 300, widthMm: 200, heightMm: 100 };
    expect(billableWeightG(light)).toBe(1000); // bulky → volumetric
    expect(billableWeightG(heavy)).toBe(2500); // dense → actual
  });

  it("supports a custom divisor", () => {
    const box = { weightG: 0, lengthMm: 300, widthMm: 200, heightMm: 100 };
    expect(volumetricWeightG(box, 5000)).toBe(1200);
  });

  it("rejects fractional or negative inputs", () => {
    expect(() => billableWeightG({ weightG: 1.5, lengthMm: 1, widthMm: 1, heightMm: 1 })).toThrow();
    expect(() => billableWeightG({ weightG: -1, lengthMm: 1, widthMm: 1, heightMm: 1 })).toThrow();
  });

  it("scales by quantity", () => {
    const p = { weightG: 300, lengthMm: 300, widthMm: 250, heightMm: 50 };
    expect(scaleParcel(p, 3)).toEqual({ weightG: 900, lengthMm: 300, widthMm: 250, heightMm: 150 });
    expect(() => scaleParcel(p, 0)).toThrow();
  });
});

describe("rateCostFen", () => {
  it("charges the first-kg price for anything up to 1 kg", () => {
    expect(rateCostFen(1, rate)).toBe(3_000);
    expect(rateCostFen(1000, rate)).toBe(3_000);
  });

  it("charges each additional kg, rounding the excess up", () => {
    expect(rateCostFen(1001, rate)).toBe(5_000);
    expect(rateCostFen(2000, rate)).toBe(5_000);
    expect(rateCostFen(2001, rate)).toBe(7_000);
  });

  it("pro-rates with finer steps", () => {
    const half = { ...rate, stepG: 500 as const };
    expect(rateCostFen(1200, half)).toBe(4_000); // 1 kg + one 500 g step
    expect(rateCostFen(1600, half)).toBe(5_000);
  });

  it("charges nothing for zero weight", () => {
    expect(rateCostFen(0, rate)).toBe(0);
  });
});

describe("estimateShipping", () => {
  const top = { weightG: 350, lengthMm: 300, widthMm: 250, heightMm: 50 }; // vol 625 g

  it("returns a range with more headroom for category defaults", () => {
    const base = { mode: "air" as const, parcel: top, quantity: 1, fxRate: FX, settings: DEFAULT_SETTINGS };
    const seller = estimateShipping({ ...base, source: "seller_confirmed" });
    const fallback = estimateShipping({ ...base, source: "category_default" });

    expect(seller.applies).toBe(true);
    expect(seller.billableG).toBe(625);
    expect(seller.billableMaxG).toBe(719); // ceil(625 × 1.15)
    expect(fallback.billableMaxG).toBe(844); // ceil(625 × 1.35)
    expect(seller.minSen).toBe(1_950); // ¥30 × 0.65
    expect(seller.minSen).toBeLessThanOrEqual(seller.maxSen);
  });

  it("widens to a real range once headroom crosses a kg boundary", () => {
    const est = estimateShipping({
      mode: "air",
      parcel: { weightG: 900, lengthMm: 100, widthMm: 100, heightMm: 100 },
      source: "category_default",
      quantity: 1,
      fxRate: FX,
      settings: DEFAULT_SETTINGS,
    });
    expect(est.minFen).toBe(3_000);
    expect(est.maxFen).toBe(5_000); // 1215 g → 2 kg
    expect(est.minSen).toBe(1_950);
    expect(est.maxSen).toBe(3_250);
  });

  it("multiplies by quantity", () => {
    const one = estimateShipping({ mode: "sea", parcel: top, source: "seller_confirmed", quantity: 1, fxRate: FX, settings: DEFAULT_SETTINGS });
    const four = estimateShipping({ mode: "sea", parcel: top, source: "seller_confirmed", quantity: 4, fxRate: FX, settings: DEFAULT_SETTINGS });
    expect(four.billableG).toBeGreaterThan(one.billableG);
    expect(four.minFen).toBeGreaterThan(one.minFen);
  });

  it("returns zero, not-applicable for PDD direct-ship and digital", () => {
    for (const mode of ["pdd_direct", "none"] as const) {
      const est = estimateShipping({ mode, parcel: top, source: "seller_confirmed", quantity: 1, fxRate: FX, settings: DEFAULT_SETTINGS });
      expect(est).toMatchObject({ applies: false, minSen: 0, maxSen: 0 });
    }
  });

  it("uses the per-forwarder, per-mode rate table from settings", () => {
    const settings = parseSettings({
      shipping: {
        defaultForwarder: "fastco",
        forwarders: [
          { name: "fastco", rates: { air: { firstKgFen: 1_000, additionalKgFen: 500 } } },
        ],
      },
    });
    const est = estimateShipping({ mode: "air", parcel: top, source: "seller_confirmed", quantity: 1, fxRate: FX, settings });
    expect(est.minFen).toBe(1_000);
    expect(() =>
      estimateShipping({ mode: "sea", parcel: top, source: "seller_confirmed", quantity: 1, fxRate: FX, settings }),
    ).toThrow(/no rate for mode "sea"/);
    expect(() =>
      estimateShipping({ mode: "air", parcel: top, source: "seller_confirmed", quantity: 1, fxRate: FX, settings, forwarder: "nope" }),
    ).toThrow(/Unknown forwarder/);
  });
});

describe("finalShippingCost", () => {
  it("prices the warehouse weigh-in with the same table", () => {
    const cost = finalShippingCost({
      mode: "air",
      parcel: { weightG: 1500, lengthMm: 300, widthMm: 200, heightMm: 100 },
      fxRate: FX,
      settings: DEFAULT_SETTINGS,
    });
    expect(cost).toEqual({ billableG: 1500, fen: 5_000, sen: 3_250 });
  });

  it("is zero for modes without a forwarder leg", () => {
    expect(
      finalShippingCost({ mode: "pdd_direct", parcel: { weightG: 1, lengthMm: 1, widthMm: 1, heightMm: 1 }, fxRate: FX, settings: DEFAULT_SETTINGS }),
    ).toEqual({ billableG: 0, fen: 0, sen: 0 });
  });
});
