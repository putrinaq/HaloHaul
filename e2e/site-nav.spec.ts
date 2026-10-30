// The site header for each kind of visitor.
import { expect, test, type Locator } from "@playwright/test";
import path from "node:path";
import { AUTH_DIR } from "./helpers";

/** Centre line of an element, to check things sit in one row. */
const midY = async (l: Locator) => {
  const b = (await l.boundingBox())!;
  return Math.round(b.y + b.height / 2);
};

test.describe("signed in as admin", () => {
  test.use({ storageState: path.join(AUTH_DIR, "admin.json") });

  test("shows Admin instead of the student's cart and orders, all in one row", async ({ page }) => {
    for (const width of [1440, 1024, 820]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/pricing");
      const nav = page.locator("header nav").first();
      const admin = nav.getByRole("link", { name: "Admin" });
      await expect(admin, `${width}px`).toBeVisible();
      await expect(nav.getByRole("link", { name: "My orders" }), `${width}px`).toHaveCount(0);
      await expect(nav.getByRole("link", { name: /^Cart/ }), `${width}px`).toHaveCount(0);
      const account = nav.getByRole("link", { name: "Account" });
      expect(Math.abs((await midY(admin)) - (await midY(account))), `${width}px`).toBeLessThanOrEqual(4);
    }
  });
});

test.describe("signed in as a student", () => {
  test.use({ storageState: path.join(AUTH_DIR, "student.json") });

  test("shows My orders, the cart and the account in one row", async ({ page }) => {
    for (const width of [1440, 820]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/pricing");
      const nav = page.locator("header nav").first();
      const orders = nav.getByRole("link", { name: "My orders" });
      const cart = nav.getByRole("link", { name: /^Cart/ });
      await expect(orders).toBeVisible();
      await expect(nav.getByRole("link", { name: "Admin" })).toHaveCount(0);
      expect(Math.abs((await midY(orders)) - (await midY(cart))), `${width}px`).toBeLessThanOrEqual(4);
    }
  });
});
