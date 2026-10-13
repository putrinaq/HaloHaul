import { describe, expect, it } from "vitest";
import { getCategory } from "./categories";
import { parseFxRate } from "./money";
import { DEFAULT_SETTINGS } from "./settings";
import { availableShippingModes, buildShippingSnapshot, shippingOptions } from "./shippingOptions";

const now = new Date("2026-10-14T00:00:00Z");
const base = {
  platform: "taobao" as const,
  pathType: "url" as const,
  category: getCategory("clothing_top"),
  quantity: 1,
  settings: DEFAULT_SETTINGS,
  fxRate: parseFxRate("0.65"),
  nextCutoffs: {
    air: new Date("2026-10-19T15:59:00Z"), // 5d16h away → waits 6 days
    sea: new Date("2026-11-03T15:59:00Z"),
  },
  now,
};

describe("availableShippingModes", () => {
  it("offers batch modes, plus PDD direct-ship for PDD links", () => {
    expect(availableShippingModes("taobao", "url", getCategory("dress"))).toEqual(["air", "air_sensitive", "sea"]);
    expect(availableShippingModes("pdd", "url", getCategory("dress"))).toEqual(["pdd_direct", "air", "air_sensitive", "sea"]);
  });

  it("offers no shipping for digital products", () => {
    expect(availableShippingModes("taobao", "digital", getCategory("digital"))).toEqual(["none"]);
  });
});

describe("shippingOptions", () => {
  it("prices each mode and adds the wait until cutoff to the transit time", () => {
    const opts = shippingOptions(base);
    const air = opts.find((o) => o.mode === "air")!;
    const sea = opts.find((o) => o.mode === "sea")!;
    expect(air.etaDaysMin).toBe(6 + 7);
    expect(air.etaDaysMax).toBe(6 + 12);
    expect(air.cutoffAt).toBe("2026-10-19T15:59:00.000Z");
    expect(air.minSen).toBeGreaterThan(0);
    expect(air.minSen).toBeLessThanOrEqual(air.maxSen);
    // Sea is slower and cheaper than air.
    expect(sea.etaDaysMin!).toBeGreaterThan(air.etaDaysMin!);
    expect(sea.maxSen).toBeLessThanOrEqual(air.maxSen);
  });

  it("has no ETA when a mode has no batch scheduled", () => {
    const sensitive = shippingOptions(base).find((o) => o.mode === "air_sensitive")!;
    expect(sensitive.etaDaysMin).toBeNull();
    expect(sensitive.cutoffAt).toBeNull();
  });

  it("shows PDD direct-ship with no shipping cost and the PDD note", () => {
    const pdd = shippingOptions({ ...base, platform: "pdd" })[0];
    expect(pdd).toMatchObject({ mode: "pdd_direct", minSen: 0, maxSen: 0, note: expect.stringMatching(/set by PDD/) });
  });

  it("scales the estimate with quantity", () => {
    const one = shippingOptions(base).find((o) => o.mode === "air")!;
    const five = shippingOptions({ ...base, quantity: 5 }).find((o) => o.mode === "air")!;
    expect(five.maxSen).toBeGreaterThan(one.maxSen);
  });
});

describe("buildShippingSnapshot", () => {
  it("records what was shown and what was chosen", () => {
    const opts = shippingOptions(base);
    const snap = buildShippingSnapshot("sea", "clothing_top", opts, now);
    expect(snap.chosen).toBe("sea");
    expect(snap.category).toBe("clothing_top");
    expect(snap.capturedAt).toBe(now.toISOString());
    expect(snap.options.map((o) => o.mode)).toEqual(["air", "air_sensitive", "sea"]);
  });
});
