// Category search on a phone: the list fits the screen and taps pick a category.
import { expect, test } from "@playwright/test";
import path from "node:path";
import { AUTH_DIR } from "./helpers";

test.use({ storageState: path.join(AUTH_DIR, "student.json") });

test("search and tap a category on a phone", async ({ page }) => {
  await page.goto("/order/new?path=url");
  await page.locator("#productUrl").fill("https://item.taobao.com/item.htm?id=1234567");
  await page.locator("#itemName").fill("Test item");
  await page.getByRole("button", { name: "Continue" }).click();

  const box = page.getByRole("combobox", { name: "Category" });
  await box.tap();
  await box.fill("鞋");
  const list = page.getByRole("listbox", { name: "Categories" });
  const option = list.getByRole("option", { name: /Shoes/ });
  await expect(option).toBeVisible();

  // The list stays inside the screen width.
  const vw = page.viewportSize()!.width;
  const b = (await list.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(vw);

  await option.tap();
  await expect(box).toHaveValue("Shoes");
  await expect(page.getByLabel(/Foot length/)).toBeVisible();
  await expect(page.getByText("Choose a category")).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
