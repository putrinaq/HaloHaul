import { describe, expect, it } from "vitest";
import { pricingExample, shippingRateRows } from "./pricing";
import { DEFAULT_SETTINGS, parseSettings } from "./settings";

describe("shippingRateRows", () => {
  it("converts the consolidated per-kg rate at the default exchange rate", () => {
    const rows = shippingRateRows(DEFAULT_SETTINGS);
    expect(rows.map((r) => r.mode)).toEqual(["air", "air_sensitive", "sea"]);
    // Air: ¥20 + ¥3 spread per kg at 0.65 = RM 14.95.
    expect(rows[0]).toMatchObject({ perKgSen: 1495, minChargeSen: 500, transitDays: { min: 7, max: 12 } });
  });

  it("skips modes the forwarder has no rate for", () => {
    const settings = parseSettings({
      shipping: { forwarders: [{ name: "default", rates: { sea: { subsequentKgFen: 700 } } }] },
    });
    expect(shippingRateRows(settings).map((r) => r.mode)).toEqual(["sea"]);
  });
});

describe("pricingExample", () => {
  it("prices the sample hoodie the way a real quote would", () => {
    const ex = pricingExample(DEFAULT_SETTINGS)!;
    expect(ex.mode).toBe("air");
    // ¥89 × 0.65 = RM 57.85.
    expect(ex.quote.itemPriceSen).toBe(5785);
    expect(ex.quote.serviceFeeSen).toBe(600);
    // 0.6 kg billable (heavier than its 0.42 kg volume); top of range adds 15% → 0.7 kg.
    expect(ex.shipping.billableG).toBe(600);
    expect(ex.quote.shippingMinSen).toBe(897);
    expect(ex.quote.shippingMaxSen).toBe(1047);
    expect(ex.quote.payableNowSen).toBe(5785 + 600 + 1047);
    // Weighs 0.55 kg → charged as 0.6 kg → the difference comes back as credit.
    expect(ex.finalShippingSen).toBe(897);
    expect(ex.settlement.kind).toBe("credit");
    expect(ex.settlement.ledgerAmountSen).toBe(-150);
  });

  it("falls back to another mode when there is no air rate", () => {
    const settings = parseSettings({
      shipping: { forwarders: [{ name: "default", rates: { sea: { subsequentKgFen: 700, minChargeSen: 500 } } }] },
    });
    expect(pricingExample(settings)?.mode).toBe("sea");
  });
});
