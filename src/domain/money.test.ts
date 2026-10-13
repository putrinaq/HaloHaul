import { describe, expect, it } from "vitest";
import {
  fenToSen,
  formatCny,
  formatFxRate,
  formatMyr,
  MoneyError,
  parseFxRate,
  parseMajorToMinor,
  percentOfFloor,
  sumMinor,
} from "./money";

describe("parseFxRate / formatFxRate", () => {
  it("parses decimal strings into micro-units", () => {
    expect(parseFxRate("0.6523")).toBe(652_300);
    expect(parseFxRate("0.652300")).toBe(652_300);
    expect(parseFxRate("1")).toBe(1_000_000);
    expect(parseFxRate(" 0.65 ")).toBe(650_000);
  });

  it("round-trips through the numeric(12,6) format", () => {
    expect(formatFxRate(parseFxRate("0.6523"))).toBe("0.652300");
    expect(formatFxRate(1_234_567)).toBe("1.234567");
  });

  it("rejects bad, zero, negative and over-precise rates", () => {
    for (const bad of ["", "abc", "-0.65", "0", "0.000000", "0.1234567", "1e3", ".5"]) {
      expect(() => parseFxRate(bad), bad).toThrow(MoneyError);
    }
  });
});

describe("fenToSen", () => {
  it("converts at the given rate", () => {
    // ¥100.00 at 0.65 → RM 65.00
    expect(fenToSen(10_000, parseFxRate("0.65"))).toBe(6_500);
  });

  it("rounds half up to the nearest sen", () => {
    // 1 fen × 0.65 = 0.65 sen → 1; 1 fen × 0.45 = 0.45 sen → 0
    expect(fenToSen(1, parseFxRate("0.65"))).toBe(1);
    expect(fenToSen(1, parseFxRate("0.45"))).toBe(0);
    // exactly half: 1 fen × 0.5 = 0.5 sen → 1
    expect(fenToSen(1, parseFxRate("0.5"))).toBe(1);
    // ¥12.34 at 0.6523 = 804.9382 sen → 805
    expect(fenToSen(1_234, parseFxRate("0.6523"))).toBe(805);
  });

  it("rounds negatives symmetrically (half away from zero)", () => {
    expect(fenToSen(-1, parseFxRate("0.5"))).toBe(-1);
    expect(fenToSen(-10_000, parseFxRate("0.65"))).toBe(-6_500);
  });

  it("stays exact for large amounts where float math would drift", () => {
    // ¥9,999,999.99 at 0.999999
    expect(fenToSen(999_999_999, 999_999)).toBe(999_998_999);
  });

  it("rejects non-integer minor units", () => {
    expect(() => fenToSen(1.5, 650_000)).toThrow(MoneyError);
    expect(() => fenToSen(100, 0.65)).toThrow(MoneyError);
  });
});

describe("percentOfFloor", () => {
  it("rounds down so caps never exceed the stated percentage", () => {
    expect(percentOfFloor(1_000, 20)).toBe(200);
    expect(percentOfFloor(1_001, 20)).toBe(200); // 200.2 → 200
    expect(percentOfFloor(1_004, 20)).toBe(200); // 200.8 → 200
    expect(percentOfFloor(0, 20)).toBe(0);
  });
});

describe("sumMinor", () => {
  it("sums integers and rejects floats", () => {
    expect(sumMinor([100, -30, 5])).toBe(75);
    expect(sumMinor([])).toBe(0);
    expect(() => sumMinor([0.1, 0.2])).toThrow(MoneyError);
  });
});

describe("formatting", () => {
  it("formats MYR and CNY", () => {
    expect(formatMyr(4_800)).toBe("RM 48.00");
    expect(formatMyr(123_456_7)).toBe("RM 12,345.67");
    expect(formatMyr(-300)).toBe("-RM 3.00");
    expect(formatMyr(5)).toBe("RM 0.05");
    expect(formatCny(12_350)).toBe("¥123.50");
  });
});

describe("parseMajorToMinor", () => {
  it("parses ringgit/yuan strings without floats", () => {
    expect(parseMajorToMinor("48")).toBe(4_800);
    expect(parseMajorToMinor("48.5")).toBe(4_850);
    expect(parseMajorToMinor("0.07")).toBe(7);
    expect(parseMajorToMinor("1,234.56")).toBe(123_456);
    expect(parseMajorToMinor("-3.00")).toBe(-300);
    // 0.1 + 0.2 style inputs stay exact
    expect(parseMajorToMinor("0.30")).toBe(30);
  });

  it("rejects malformed amounts", () => {
    for (const bad of ["", "abc", "1.234", "1.", "RM5"]) {
      expect(() => parseMajorToMinor(bad), bad).toThrow(MoneyError);
    }
  });
});
