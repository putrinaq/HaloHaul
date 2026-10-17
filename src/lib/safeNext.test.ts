import { describe, expect, it } from "vitest";
import { safeNext } from "./safeNext";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/order/new?path=url")).toBe("/order/new?path=url");
  });
  it("rejects absolute, protocol-relative and backslash URLs", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "", null, undefined]) {
      expect(safeNext(bad)).toBe("/orders");
    }
  });
  it("rejects backslashes and control characters anywhere in the path", () => {
    for (const bad of ["/orders\\..\\\\evil.com", "/orders\n/x", "/a\u0000b", `/${"a".repeat(600)}`]) {
      expect(safeNext(bad)).toBe("/orders");
    }
  });
});
