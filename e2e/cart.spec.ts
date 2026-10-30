// The cart: save an order part-way, come back to it, submit it from the cart.
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { AUTH_DIR } from "./helpers";

test.use({ storageState: path.join(AUTH_DIR, "student.json") });
test.describe.configure({ mode: "serial" });

async function startShoeOrder(page: Page, name: string) {
  await page.goto("/order/new?path=url");
  await page.locator("#productUrl").fill("https://item.taobao.com/item.htm?id=7654321");
  await page.locator("#itemName").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  const box = page.getByRole("combobox", { name: "Category" });
  await box.click();
  await box.fill("shoes");
  await box.press("Enter");
  await expect(page.getByLabel(/Foot length/)).toBeVisible();
}

test("save an unfinished order to the cart, then finish and submit it from there", async ({ page }) => {
  await startShoeOrder(page, "Canvas loafers");
  await page.getByRole("button", { name: "Add to cart" }).click();

  await expect(page).toHaveURL(/\/cart\?added=/);
  await expect(page.getByText("Saved to your cart.")).toBeVisible();
  const item = page.getByRole("listitem").filter({ hasText: "Canvas loafers" });
  await expect(item).toContainText(/things? to finish/);
  // The header shows how many items are waiting.
  await expect(page.getByRole("link", { name: /^Cart, 1 item/ })).toBeVisible();

  // Come back, finish it, and save it back to the cart.
  await item.getByRole("link", { name: "Finish" }).click();
  await expect(page.getByText("From your cart.")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("combobox", { name: "Category" })).toHaveValue("Shoes");
  await page.getByLabel(/^Size$/).fill("40");
  await page.getByLabel(/Size system/).selectOption("EU");
  await page.getByLabel(/Foot length/).fill("25.5");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/Air/).first().check();
  await page.getByRole("button", { name: "Save to cart" }).click();

  await expect(page).toHaveURL(/\/cart/);
  const ready = page.getByRole("listitem").filter({ hasText: "Canvas loafers" });
  await expect(ready).toContainText("Ready to submit");

  const submit = page.getByRole("button", { name: "Submit 1 ready order" });
  await expect(submit).toBeDisabled();
  await page.getByRole("checkbox").check();
  await submit.click();
  await expect(page.getByText("1 order sent.")).toBeVisible();
  await page.getByRole("link", { name: /Canvas loafers/ }).click();
  await expect(page).toHaveURL(/\/orders\/\d+/);

  await page.goto("/cart");
  await expect(page.getByText("Your cart is empty")).toBeVisible();
});

test("remove an item, with a second tap to confirm", async ({ page }) => {
  await startShoeOrder(page, "Spare sandals");
  await page.getByRole("button", { name: "Add to cart" }).click();
  const item = page.getByRole("listitem").filter({ hasText: "Spare sandals" });
  await item.getByRole("button", { name: "Remove Spare sandals" }).click();
  await item.getByRole("button", { name: /Tap again to remove/ }).click();
  await expect(page.getByText("Your cart is empty")).toBeVisible();
});

test("someone else's cart item can't be opened", async ({ page }) => {
  await page.goto("/order/new?path=url&draft=00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("From your cart.")).toHaveCount(0);
});
