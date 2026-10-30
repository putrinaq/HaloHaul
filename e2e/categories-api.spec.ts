// The public category API over real HTTP: list, search, detail, caching, errors.
import { expect, test } from "@playwright/test";

test("lists orderable categories with the measurements they ask for", async ({ request }) => {
  const res = await request.get("/api/categories");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(/application\/json/);
  const body = await res.json();
  const keys = body.categories.map((c: { key: string }) => c.key);
  expect(keys).toContain("shoes");
  expect(keys).not.toContain("digital");
  const top = body.categories.find((c: { key: string }) => c.key === "clothing_top");
  expect(top.measurements.map((m: { key: string }) => m.key)).toEqual(["height_cm", "weight_kg", "chest_cm", "shoulder_cm", "arm_length_cm", "body_length_cm"]);
  expect(top.measurements[1]).toEqual({ key: "weight_kg", label: "Weight", unit: "kg", required: "always" });
  expect(top).toMatchObject({ icon: "Shirt", match: null, versionId: expect.any(String) });
});

test("searches in English, Malay and Chinese, best match first", async ({ request }) => {
  for (const [q, key] of [["kasut", "shoes"], ["鞋", "shoes"], ["dress", "dress"], ["cermin mata", "glasses_prescription"]] as const) {
    const body = await (await request.get(`/api/categories?q=${encodeURIComponent(q)}`)).json();
    expect(body.categories[0]?.key, q).toBe(key);
  }
  const limited = await (await request.get("/api/categories?q=a&limit=1")).json();
  expect(limited.categories).toHaveLength(1);
});

test("answers 304 when nothing changed", async ({ request }) => {
  const first = await request.get("/api/categories");
  const etag = first.headers()["etag"];
  expect(etag).toBeTruthy();
  expect(first.headers()["cache-control"]).toBe("public, no-cache");
  const again = await request.get("/api/categories", { headers: { "if-none-match": etag } });
  expect(again.status()).toBe(304);
});

test("rejects bad parameters with a JSON error", async ({ request }) => {
  for (const qs of ["limit=0", "limit=abc", "limit=101", `q=${"x".repeat(81)}`]) {
    const res = await request.get(`/api/categories?${qs}`);
    expect(res.status(), qs).toBe(400);
    expect((await res.json()).error, qs).toEqual(expect.any(String));
  }
});

test("returns one category's form, and 404 for unknown or digital ones", async ({ request }) => {
  const ring = await (await request.get("/api/categories/ring")).json();
  expect(ring.category.key).toBe("ring");
  expect(ring.fields.map((f: { key: string }) => f.key)).toContain("ring_inner_circumference_mm");
  expect(ring.measurements.map((m: { key: string }) => m.key)).toEqual(["ring_inner_circumference_mm"]);
  expect(ring.definition.sections.length).toBeGreaterThan(0);

  for (const key of ["digital", "nope", "NOT_A_KEY", "a%2Fb"]) {
    const res = await request.get(`/api/categories/${key}`);
    expect(res.status(), key).toBe(404);
  }
});

test("only serves help pictures the catalogue uses", async ({ request }) => {
  const res = await request.get("/api/help-images/admin/help/00000000-0000-4000-8000-000000000000.webp", { maxRedirects: 0 });
  expect(res.status()).toBe(404);
  expect((await request.get("/api/help-images/photos/x/../../etc/passwd", { maxRedirects: 0 })).status()).toBe(404);
});
