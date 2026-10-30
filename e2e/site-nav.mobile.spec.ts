// The phone's bottom tab bar: admins get an Admin tab where students have Orders.
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
