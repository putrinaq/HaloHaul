import { describe, expect, it } from "vitest";
import { seedCatalog } from "../db/seed/catalog";
import { cleanAliases, MAX_ALIASES, normalizeForSearch, parseAliases, searchCategories } from "./categorySearch";

const categories = seedCatalog().categories.filter((c) => c.fulfilment === "physical");
const keys = (q: string, limit?: number) => searchCategories(categories, q, limit).map((m) => m.item.key);
const top = (q: string) => searchCategories(categories, q)[0];

describe("normalizeForSearch", () => {
  it("lowercases, drops accents and punctuation, and folds full-width letters", () => {
    expect(normalizeForSearch("  Clothing — Top!! ")).toBe("clothing top");
    expect(normalizeForSearch("Café")).toBe("cafe");
    expect(normalizeForSearch("ＳＨＯＥＳ")).toBe("shoes");
    expect(normalizeForSearch("T恤")).toBe("t恤");
  });
});

describe("parseAliases", () => {
  it("splits on commas (including Chinese ones) and new lines, trims and drops duplicates", () => {
    expect(parseAliases(" kasut, Sneakers ,,\n鞋、运动鞋， KASUT , sneakers")).toEqual(["kasut", "Sneakers", "鞋", "运动鞋"]);
    expect(parseAliases("   ")).toEqual([]);
  });

  it("collapses inner spaces and caps the count and length", () => {
    expect(cleanAliases(["baju   kurung", "!!!"])).toEqual(["baju kurung"]);
    expect(cleanAliases(Array.from({ length: 50 }, (_, i) => `w${i}`))).toHaveLength(MAX_ALIASES);
    expect(cleanAliases(["x".repeat(100)])[0]).toHaveLength(40);
  });
});

describe("searchCategories", () => {
  it("returns everything in display order for an empty query", () => {
    expect(keys("")).toEqual(categories.map((c) => c.key));
    expect(keys("   ", 3)).toHaveLength(3);
  });

  it("finds categories by name, start of a word, or inside a word", () => {
    expect(top("dress").item.key).toBe("dress");
    expect(top("dre").item.key).toBe("dress");
    expect(top("cosmet").item.key).toBe("cosmetics");
    expect(top("lenses").item.key).toBe("contact_lens");
  });

  it("finds categories by their search words in English, Malay and Chinese", () => {
    expect(top("kasut")).toMatchObject({ item: { key: "shoes" }, via: "kasut" });
    expect(top("sneakers").item.key).toBe("shoes");
    expect(top("seluar").item.key).toBe("clothing_bottom");
    expect(top("cermin mata").item.key).toBe("glasses_prescription");
    expect(top("鞋").item.key).toBe("shoes");
    expect(top("T恤").item.key).toBe("clothing_top");
  });

  it("forgives one typo in longer words", () => {
    expect(top("cosmetcs").item.key).toBe("cosmetics");
    expect(top("shose").item.key).toBe("shoes");
    expect(keys("xyz")).toEqual([]);
  });

  it("ranks by how many words matched, so a pasted product title still works", () => {
    expect(top("Nike Air Force 1 white shoes size 40").item.key).toBe("shoes");
    expect(top("red polka dot dress").item.key).toBe("dress");
  });

  it("prefers the category the query names outright", () => {
    // "baju" is also part of "baju kurung" (dress) and "baju dalam" (bra).
    expect(keys("baju").slice(0, 3)).toEqual(["clothing_top", "dress", "bra"]);
    expect(top("skirt").item.key).toBe("clothing_bottom");
  });

  it("highlights the matched part of the name, and says which search word matched otherwise", () => {
    expect(top("dre")).toMatchObject({ via: null, highlight: [[0, 3]] });
    expect(top("contact lens")).toMatchObject({ item: { name: "Contact lenses" }, highlight: [[0, 7], [8, 12]] });
    expect(top("jeans")).toMatchObject({ item: { key: "clothing_bottom" }, via: "jeans", highlight: [] });
  });

  it("caps results and ignores absurdly long queries past the limit", () => {
    expect(keys("a", 2).length).toBeLessThanOrEqual(2);
    expect(top(`shoes ${"x".repeat(500)}`).item.key).toBe("shoes");
  });
});
