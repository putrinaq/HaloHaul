// Category editor: add a field to a draft, see it in the live preview, publish.
import { expect, test } from "@playwright/test";
import path from "node:path";
import { AUTH_DIR } from "./helpers";

test.use({ storageState: path.join(AUTH_DIR, "admin.json") });

test("add a field to a category and publish a new version", async ({ page }) => {
  await page.goto("/admin/settings/categories");
  await page.getByRole("link", { name: /Dress/ }).first().click();
  await expect(page.getByText(/Published v1/)).toBeVisible();

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
  await expect(publish.getByText("Publish version 2")).toBeVisible();
  await expect(publish.getByText("fabric_preference")).toBeVisible();
  await publish.getByRole("button", { name: "Publish now" }).click();
  await expect(publish).toBeHidden();
  await expect(page.getByText(/Published v2/)).toBeVisible();
});

test("settings pages open", async ({ page }) => {
  for (const p of ["shipping", "fees", "exchange-rate", "restricted", "pickup", "messages", "store", "measurements", "audit"]) {
    await page.goto(`/admin/settings/${p}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});
