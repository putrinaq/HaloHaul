import { describe, expect, it } from "vitest";
import { matchRestricted, restrictedReason, type RestrictedRule } from "./restricted";

const rules: RestrictedRule[] = [
  { keyword: "power bank", appliesToModes: ["air"], forwarder: null, note: "Lithium batteries" },
  { keyword: "充电宝", appliesToModes: ["air"], forwarder: null, note: "Power bank" },
  { keyword: "magnet", appliesToModes: [], forwarder: null, note: null },
  { keyword: "knife", appliesToModes: [], forwarder: "fastco", note: "Blades" },
];

const check = (texts: string[], shippingMode: "air" | "sea" = "air", forwarder = "default") =>
  matchRestricted({ texts, shippingMode, forwarder }, rules);

describe("matchRestricted", () => {
  it("matches case-insensitively across all text fields", () => {
    expect(check(["Anker POWER  Bank 20000mAh"])).toEqual([{ keyword: "power bank", note: "Lithium batteries" }]);
    expect(check(["", "remarks: needs a power bank too"])).toHaveLength(1);
  });

  it("matches Chinese keywords as substrings", () => {
    expect(check(["小米充电宝10000毫安"])).toEqual([{ keyword: "充电宝", note: "Power bank" }]);
  });

  it("respects shipping modes", () => {
    expect(check(["power bank"], "sea")).toEqual([]);
    expect(check(["fridge magnet set"], "sea")).toHaveLength(1);
  });

  it("respects forwarder-specific rules", () => {
    expect(check(["kitchen knife"], "air", "default")).toEqual([]);
    expect(check(["kitchen knife"], "air", "fastco")).toHaveLength(1);
  });

  it("matches Latin keywords from a word start only", () => {
    expect(check(["magnets for fridge"])).toHaveLength(1);
    expect(check(["electromagnetic toy"])).toHaveLength(0);
  });

  it("returns nothing for empty input", () => {
    expect(check([])).toEqual([]);
  });

  it("summarises matches for the admin", () => {
    expect(restrictedReason(check(["power bank with magnet"]))).toBe("power bank: Lithium batteries; magnet");
    expect(restrictedReason([])).toBeNull();
  });
});
