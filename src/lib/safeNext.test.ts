import { describe, expect, it } from "vitest";
import { safeAdminNext, safeNext } from "./safeNext";

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

describe("safeAdminNext", () => {
  it("keeps pages inside the console", () => {
    expect(safeAdminNext("/admin/orders/1001?tab=qc")).toBe("/admin/orders/1001?tab=qc");
    expect(safeAdminNext("/admin")).toBe("/admin");
  });
  it("sends everything else to the console's home, and never back to sign-in", () => {
    for (const bad of ["/orders", "/administrator", "//evil.com", "/admin/sign-in?next=/admin", null]) {
      expect(safeAdminNext(bad)).toBe("/admin");
    }
  });
});
