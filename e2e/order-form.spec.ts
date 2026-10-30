// The order form's category search and its measurement fields, as a student.
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { AUTH_DIR } from "./helpers";

test.use({ storageState: path.join(AUTH_DIR, "student.json") });

/** Through the Item step of a link order, to the Details step. */
async function toDetails(page: Page, query = "") {
  await page.goto(`/order/new?path=url${query}`);
  await page.locator("#productUrl").fill("https://item.taobao.com/item.htm?id=1234567");
  await page.locator("#itemName").fill("Test item");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  return page.getByRole("combobox", { name: "Category" });
}

test("search, pick with the keyboard, and the measurement fields follow the category", async ({ page }) => {
  const box = await toDetails(page);
  await box.click();
  const list = page.getByRole("listbox", { name: "Categories" });
  await expect(list).toBeVisible();
  await expect(list.getByRole("option")).not.toHaveCount(0);

  // A Malay search word finds Shoes, and says why.
  await box.fill("kasut");
  const shoes = list.getByRole("option", { name: /Shoes/ });
  await expect(shoes).toContainText("Also: kasut");
  await box.press("Enter");
  await expect(list).toBeHidden();
  await expect(box).toHaveValue("Shoes");
  await expect(page.getByLabel(/Foot length/)).toBeVisible();
  // A good choice is never flagged while its form loads.
  await expect(page.getByText("Choose a category")).toHaveCount(0);
  await expect(box).not.toHaveAttribute("aria-invalid", "true");

  // Switching category swaps the fields; nothing from Shoes is left behind.
  await box.click();
  await box.fill("ring");
  await box.press("ArrowDown");
  await box.press("ArrowUp");
  await box.press("Enter");
  await expect(box).toHaveValue("Ring");
  await expect(page.getByLabel(/Ring inner circumference/)).toBeVisible();
  await expect(page.getByLabel(/Foot length/)).toHaveCount(0);

  // Required measurements are checked before moving on.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/Ring inner circumference.*required/i)).toBeVisible();
  await page.getByLabel(/Ring inner circumference/).fill("52");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Delivery" })).toBeVisible();
});

test("continuing with no category asks for one, and picking one clears the error", async ({ page }) => {
  const box = await toDetails(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Choose a category")).toBeVisible();
  await expect(box).toHaveAttribute("aria-invalid", "true");
  await box.click();
  await box.fill("bra");
  await box.press("Enter");
  await expect(page.getByLabel(/^Underbust/)).toBeVisible();
  await expect(page.getByText("Choose a category")).toHaveCount(0);
});

test("no match offers Something else, and Escape keeps the current choice", async ({ page }) => {
  const box = await toDetails(page);
  await box.click();
  await box.fill("dress");
  await box.press("Enter");
  await expect(box).toHaveValue("Dress");

  await box.click();
  await box.fill("qwertyuiop");
  const list = page.getByRole("listbox", { name: "Categories" });
  await expect(page.getByText("No category matches “qwertyuiop”.").first()).toBeVisible();
  await expect(list.getByRole("option")).toHaveCount(1);
  await expect(list.getByRole("option")).toContainText("Something else");
  await box.press("Escape");
  await expect(list).toBeHidden();
  await expect(box).toHaveValue("Dress");
});

test("a category link opens with the student's saved measurements filled in", async ({ page }) => {
  const box = await toDetails(page, "&category=clothing_top");
  await expect(box).toHaveValue("Clothing — top");
  // The demo student has these saved on their profile. Clothing asks for height and weight first.
  await expect(page.getByLabel(/^Height/)).toHaveValue("172");
  await expect(page.getByLabel(/^Weight/)).toHaveValue("63");
  await expect(page.getByLabel(/^Chest/)).toHaveValue("96");
  await expect(page.getByLabel(/^Shoulder width/)).toHaveValue("44");
  await expect(page.getByText("Prefilled from your saved measurements.", { exact: false })).toBeVisible();
});

test("the search list can be used with a mouse", async ({ page }) => {
  const box = await toDetails(page);
  await page.getByRole("button", { name: "Show all categories" }).click();
  const list = page.getByRole("listbox", { name: "Categories" });
  await expect(list).toBeVisible();
  await list.getByRole("option", { name: /Cosmetics/ }).click();
  await expect(box).toHaveValue("Cosmetics");
  await expect(list).toBeHidden();
});
