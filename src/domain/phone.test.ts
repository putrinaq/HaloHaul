import { describe, expect, it } from "vitest";
import { normalizeMyMobile, waMeNumber } from "./phone";

describe("normalizeMyMobile", () => {
  it.each([
    ["012-345 6789", "+60123456789"],
    ["0123456789", "+60123456789"],
    ["+60 12 345 6789", "+60123456789"],
    ["60123456789", "+60123456789"],
    ["011-2345 6789", "+601123456789"],
    ["(013) 456-7890", "+60134567890"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeMyMobile(input)).toBe(expected);
  });

  it("rejects landlines, short numbers and foreign numbers", () => {
    for (const bad of ["03-1234 5678", "0123", "+6591234567", "hello", "", "+60 3 1234 5678"]) {
      expect(normalizeMyMobile(bad), bad).toBeNull();
    }
  });

  it("formats for wa.me", () => {
    expect(waMeNumber("+60123456789")).toBe("60123456789");
  });
});
