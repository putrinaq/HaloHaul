import { describe, expect, it } from "vitest";
import { parseFxRate } from "./money";
import { DEFAULT_SETTINGS } from "./settings";
import { previewWeighIn } from "./weighIn";

const fxRate = parseFxRate("0.65");
const base = { mode: "air" as const, parcelSource: "final" as const, quotedMaxSen: 2000, paidSen: 2000 };

describe("previewWeighIn", () => {
  it("credits orders that weighed less than paid and charges (capped) those that weighed more", () => {
    const p = previewWeighIn(
      [
        { ...base, id: 1, parcel: { weightG: 300, lengthMm: 200, widthMm: 150, heightMm: 50 } },
        { ...base, id: 2, parcel: { weightG: 9000, lengthMm: 600, widthMm: 400, heightMm: 300 } },
        { ...base, id: 3, parcel: null, parcelSource: "estimate" },
      ],
      { fxRate, settings: DEFAULT_SETTINGS },
    );
    const [light, heavy, missing] = p.rows;
    expect(light.result.kind).toBe("credit");
    expect(light.result.ledgerAmountSen).toBe(light.actualSen - 2000);
    expect(heavy.result.kind).toBe("charge");
    // Capped at +20% of the top of the range; the rest is absorbed.
    expect(heavy.result.ledgerAmountSen).toBe(400);
    expect(heavy.result.absorbedSen).toBe(heavy.actualSen - 2400);
    expect(missing).toMatchObject({ parcelSource: "missing", result: { kind: "none", ledgerAmountSen: 0 } });
    expect(p.totals.chargeSen).toBe(400);
    expect(p.totals.creditSen).toBe(2000 - light.actualSen);
  });

  it("falls back to the default forwarder for an unknown name", () => {
    const p = previewWeighIn([{ ...base, id: 1, parcel: { weightG: 1000, lengthMm: 100, widthMm: 100, heightMm: 100 } }], { fxRate, settings: DEFAULT_SETTINGS, forwarder: "nobody" });
    expect(p.rows[0].actualSen).toBeGreaterThan(0);
  });
});
