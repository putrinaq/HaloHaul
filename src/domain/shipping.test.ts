import { describe, expect, it } from "vitest";
import { parseFxRate } from "./money";
import { DEFAULT_SETTINGS, parseSettings, type Rate } from "./settings";
import {
  billableWeightG,
  consolidatedRateFen,
  estimateShipping,
  finalShippingCost,
  orderShippingCost,
  roundUpTo100g,
  scaleParcel,
  volumetricWeightG,
} from "./shipping";

const FX = parseFxRate("0.65");
// Default air: ¥20.00/kg forwarder + ¥3.00/kg spread = ¥23.00/kg, min RM5.
const air = DEFAULT_SETTINGS.shipping.forwarders[0].rates.air as Rate;

describe("volumetric and billable weight", () => {
  it("computes L×W×H/6000 in grams", () => {
    // 30×20×10 cm = 6000 cm³ → 1 kg
    expect(volumetricWeightG({ weightG: 0, lengthMm: 300, widthMm: 200, heightMm: 100 })).toBe(1000);
  });

  it("rounds volumetric weight up to the next gram", () => {
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

describe("orderShippingCost (consolidated, per order)", () => {
  it("rounds billable weight up to 0.1 kg", () => {
    expect(roundUpTo100g(0)).toBe(0);
    expect(roundUpTo100g(1)).toBe(100);
    expect(roundUpTo100g(100)).toBe(100);
    expect(roundUpTo100g(101)).toBe(200);
  });

  it("charges billable kg × (subsequent-kg rate + spread)", () => {
    expect(consolidatedRateFen(air)).toBe(2_300);
    // 625 g → 0.7 kg × ¥23 = ¥16.10 → RM 10.465 → 1047 sen
    expect(orderShippingCost(625, air, FX)).toEqual({ chargedG: 700, fen: 1_610, sen: 1_047 });
  });

  it("has no first-kg premium: cost is linear in weight", () => {
    const one = orderShippingCost(1000, air, FX);
    const two = orderShippingCost(2000, air, FX);
    expect(two.fen).toBe(one.fen * 2);
  });

  it("applies the per-order minimum charge", () => {
    // 40 g → 0.1 kg × ¥23 = ¥2.30 → RM 1.50, below the RM 5 minimum
    expect(orderShippingCost(40, air, FX)).toEqual({ chargedG: 100, fen: 230, sen: 500 });
  });

  it("rounds the RMB amount up to a whole fen", () => {
    const odd: Rate = { subsequentKgFen: 1_001, spreadFen: 0, minChargeSen: 0, volumetricDivisor: 6000 };
    expect(orderShippingCost(100, odd, FX).fen).toBe(101); // 100.1 fen → 101
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
    expect(seller.minSen).toBe(1_047); // 0.7 kg
    expect(seller.maxSen).toBe(1_196); // 0.8 kg → ¥18.40 → 1196
    expect(fallback.maxSen).toBe(1_346); // 0.9 kg → ¥20.70 → 1345.5 → 1346
  });

  it("uses the configured headroom percentages", () => {
    const tight = parseSettings({ shipping: { rangeHeadroomPct: { sellerConfirmed: 0 } } });
    const est = estimateShipping({ mode: "air", parcel: top, source: "seller_confirmed", quantity: 1, fxRate: FX, settings: tight });
    expect(est.minSen).toBe(est.maxSen);
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
        forwarders: [{ name: "fastco", rates: { air: { subsequentKgFen: 1_000 } } }],
      },
    });
    const est = estimateShipping({ mode: "air", parcel: top, source: "seller_confirmed", quantity: 1, fxRate: FX, settings });
    expect(est.minFen).toBe(700); // 0.7 kg × ¥10, no spread, no minimum
    expect(est.minSen).toBe(455);
    expect(() =>
      estimateShipping({ mode: "sea", parcel: top, source: "seller_confirmed", quantity: 1, fxRate: FX, settings }),
    ).toThrow(/no rate for mode "sea"/);
    expect(() =>
      estimateShipping({ mode: "air", parcel: top, source: "seller_confirmed", quantity: 1, fxRate: FX, settings, forwarder: "nope" }),
    ).toThrow(/Unknown forwarder/);
  });
});

describe("finalShippingCost", () => {
  it("prices the warehouse weigh-in with the same formula", () => {
    const cost = finalShippingCost({
      mode: "air",
      parcel: { weightG: 1500, lengthMm: 300, widthMm: 200, heightMm: 100 },
      fxRate: FX,
      settings: DEFAULT_SETTINGS,
    });
    // 1.5 kg × ¥23 = ¥34.50 → RM 22.425 → 2243
    expect(cost).toEqual({ billableG: 1500, fen: 3_450, sen: 2_243 });
  });

  it("is zero for modes without a forwarder leg", () => {
    expect(
      finalShippingCost({ mode: "pdd_direct", parcel: { weightG: 1, lengthMm: 1, widthMm: 1, heightMm: 1 }, fxRate: FX, settings: DEFAULT_SETTINGS }),
    ).toEqual({ billableG: 0, fen: 0, sen: 0 });
  });
});
