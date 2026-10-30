// Category editor: add a field to a draft, see it in the live preview, publish.
import { expect, test } from "@playwright/test";
import path from "node:path";
import { AUTH_DIR } from "./helpers";

test.use({ storageState: path.join(AUTH_DIR, "admin.json") });

test("add a field to a category and publish a new version", async ({ page }) => {
  await page.goto("/admin/settings/categories");
  await page.getByRole("link", { name: /Dress/ }).first().click();
  // Dress is on version 3: 0008 added height and weight, 0009 removed dress length.
  await expect(page.getByText(/Published v3/)).toBeVisible();

  await page.getByRole("button", { name: "Add field" }).last().click();
  await page.getByRole("menuitem", { name: "Short text" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Label").fill("Fabric preference");
  await sheet.getByLabel("Key").fill("fabric_preference");
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();

  // The live preview renders the student's form from the draft.
  await expect(page.getByText("Fabric preference").first()).toBeVisible();

  await page.getByRole("button", { name: "Publish…" }).click();
  const publish = page.getByRole("dialog");
  await expect(publish.getByText("Publish version 4")).toBeVisible();
  await expect(publish.getByText("fabric_preference")).toBeVisible();
  await publish.getByRole("button", { name: "Publish now" }).click();
  await expect(publish).toBeHidden();
  await expect(page.getByText(/Published v4/)).toBeVisible();
});

test("a search word added in the admin finds the category straight away", async ({ page, request }) => {
  const before = await (await request.get("/api/categories?q=frock")).json();
  expect(before.categories.map((c: { key: string }) => c.key)).not.toContain("dress");

  await page.goto("/admin/settings/categories");
  await page.getByRole("link", { name: /Dress/ }).first().click();
  await page.getByRole("button", { name: "Basic info" }).click();
  const sheet = page.getByRole("dialog");
  const words = sheet.getByLabel(/Search words/);
  await expect(words).toHaveValue(/gown/);
  await words.fill(`${await words.inputValue()}, frock`);
  await sheet.getByRole("button", { name: "Save info" }).click();
  await expect(sheet).toBeHidden();

  const after = await (await request.get("/api/categories?q=frock")).json();
  expect(after.categories[0]).toMatchObject({ key: "dress", match: { via: "frock" } });
});

test("settings pages open", async ({ page }) => {
  for (const p of ["shipping", "fees", "exchange-rate", "restricted", "pickup", "messages", "store", "measurements", "audit"]) {
    await page.goto(`/admin/settings/${p}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});
