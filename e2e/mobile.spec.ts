// Phone viewport: bottom nav, More sheet, pinned primary action, full-width drawers.
import { expect, test } from "@playwright/test";
import path from "node:path";
import { AUTH_DIR } from "./helpers";

test.use({ storageState: path.join(AUTH_DIR, "admin.json") });

test("bottom nav and More reach every section", async ({ page }) => {
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav).toBeVisible();
  for (const label of ["Actions", "Batches", "Payment", "Customer"]) await expect(nav.getByRole("link", { name: new RegExp(label) })).toBeVisible();

  await nav.getByRole("button", { name: "More" }).click();
  const more = page.getByRole("menu", { name: "More" });
  for (const label of ["Dashboard", "Products", "Calendar", "Messages", "Report", "Settings"]) await expect(more.getByRole("menuitem", { name: label })).toBeVisible();
  await more.getByRole("menuitem", { name: "Report" }).click();
  await expect(page).toHaveURL(/\/admin\/report$/);
});

test("order page pins the next step and drawers fill the screen", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("article").filter({ hasText: "Polka dot dress" }).getByRole("link", { name: /^Open order/ }).click();
  const action = page.getByRole("button", { name: "Mark fee paid" }).filter({ visible: true });
  await expect(action).toHaveCount(1);
  const box = (await action.boundingBox())!;
  // Pinned near the bottom, within thumb reach.
  expect(box.y + box.height).toBeGreaterThan(page.viewportSize()!.height * 0.75);

  await action.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect.poll(async () => {
    const d = (await drawer.boundingBox())!;
    return [Math.round(d.x), Math.round(d.width)];
  }).toEqual([0, page.viewportSize()!.width]);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  // No sideways scrolling.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
