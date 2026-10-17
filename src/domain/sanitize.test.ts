import { describe, expect, it } from "vitest";
import { checkPassword, cleanEmail, cleanName, cleanText, passwordStrength } from "./sanitize";

describe("cleanText", () => {
  it("strips control, zero-width and bidi-override characters and collapses spaces", () => {
    expect(cleanText("  Ai​na\u0000 \n\t binti‮  Ali ")).toBe("Aina binti Ali");
  });
  it("normalises to NFC", () => {
    expect(cleanText("José")).toBe("José");
  });
});

describe("cleanName", () => {
  it.each(["Aina", "Muhammad bin Ali", "Siti Nur'aisyah", "Jean-Luc", "陈伟", "முருகன்", "O’Brien", "Dr. Tan"])(
    "accepts %s",
    (name) => expect(cleanName(name)).toEqual({ ok: true, value: name }),
  );

  it.each([
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "javascript:alert(1)",
    "Robert'); DROP TABLE users;--",
    "Aina <b>",
    "{{constructor}}",
    "Aina2",
    "https://evil.example",
    "a",
    "x".repeat(81),
  ])("rejects %j", (name) => expect(cleanName(name).ok).toBe(false));

  it("returns the cleaned value", () => {
    expect(cleanName("  Aina​   Ali ")).toEqual({ ok: true, value: "Aina Ali" });
  });
});

describe("cleanEmail", () => {
  it("trims and lowercases", () => {
    expect(cleanEmail("  Aina.Ali+orders@Example.COM ")).toEqual({ ok: true, value: "aina.ali+orders@example.com" });
  });
  it.each([
    "",
    "aina",
    "aina@",
    "aina@example",
    "aina@@example.com",
    "ai na@example.com",
    "aina..ali@example.com",
    '"<script>"@example.com',
    "<svg/onload=alert(1)>@x.com",
    "aina@exa_mple.com",
    `${"a".repeat(250)}@example.com`,
  ])("rejects %j", (email) => expect(cleanEmail(email).ok).toBe(false));
});

describe("checkPassword", () => {
  it("never alters the password", () => {
    expect(checkPassword("  spaced out pass  ")).toEqual({ ok: true, value: "  spaced out pass  " });
  });
  it("enforces length only for sign-up", () => {
    expect(checkPassword("short").ok).toBe(true);
    expect(checkPassword("short", { forSignUp: true }).ok).toBe(false);
    expect(checkPassword("x".repeat(129)).ok).toBe(false);
  });
  it("rejects control characters and non-strings", () => {
    expect(checkPassword("abc\u0000defghijk").ok).toBe(false);
    expect(checkPassword(12345).ok).toBe(false);
  });
});

describe("passwordStrength", () => {
  it("scores roughly by length and variety", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("short")).toBe(1);
    expect(passwordStrength("aaaaaaaaaaaa")).toBe(1);
    expect(passwordStrength("correcthorse")).toBe(1);
    expect(passwordStrength("Correct-Horse-9-Battery")).toBe(4);
  });
});
