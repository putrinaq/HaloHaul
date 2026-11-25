// Phones: signed-in people get a bottom tab bar (admins have an Admin tab where
// students have Orders); visitors get the header's menu instead.
import { expect, test } from "@playwright/test";
import path from "node:path";
import { AUTH_DIR } from "./helpers";

test.describe("admin", () => {
  test.use({ storageState: path.join(AUTH_DIR, "admin.json") });
  test("has Admin, not Orders or the cart", async ({ page }) => {
    await page.goto("/pricing");
    const tabs = page.getByRole("navigation", { name: "Main" });
    await expect(tabs.getByRole("link", { name: "Admin" })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Orders" })).toHaveCount(0);
    await expect(page.locator("header").getByRole("link", { name: /^Cart/ })).toHaveCount(0);
    await expect(page.locator("header").getByRole("link", { name: "Admin" })).toBeVisible();
  });
});

test.describe("student", () => {
  test.use({ storageState: path.join(AUTH_DIR, "student.json") });
  test("has Orders, and the cart in the header", async ({ page }) => {
    await page.goto("/pricing");
    const tabs = page.getByRole("navigation", { name: "Main" });
    await expect(tabs.getByRole("link", { name: "Orders" })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Admin" })).toHaveCount(0);
    await expect(page.locator("header").getByRole("link", { name: /^Cart/ })).toBeVisible();
  });
});

test.describe("signed out", () => {
  test("has the menu and no tab bar", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator("header").getByRole("link", { name: "Sign In" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);

    await page.getByRole("button", { name: "Menu" }).click();
    const menu = page.getByRole("dialog", { name: "Menu" });
    // Opens on the section you're in.
    await expect(menu.getByRole("link", { name: "Pricing" })).toHaveAttribute("aria-current", "page");
    await expect(menu.getByRole("link", { name: "Shipping schedule" })).toHaveCount(0);
    await menu.getByRole("button", { name: "Browse" }).click();
    await expect(menu.getByRole("link", { name: "Pricing" })).toBeHidden();
    await menu.getByRole("link", { name: "Shipping schedule" }).click();
    await expect(page).toHaveURL(/\/shipping$/);
    await expect(menu).toBeHidden();

    // Back closes it and leaves the page scrollable.
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(menu).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/pricing$/);
    await expect(menu).toBeHidden();
    await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
  });

  test("fits a small phone", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const p of ["/", "/pricing", "/sign-in"]) {
      await page.goto(p);
      await expect(page.getByRole("button", { name: "Menu" })).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), p).toBe(true);
    }
  });
});

test.describe("signed in", () => {
  test.use({ storageState: path.join(AUTH_DIR, "student.json") });
  test("has both the tab bar and the menu, which covers it", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/pricing");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Menu" })).toBeInViewport({ ratio: 1 });
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Place an order" }).click();
    await expect(page).toHaveURL(/\/order\/new/);
  });
});
