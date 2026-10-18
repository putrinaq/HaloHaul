// The whole life of a URL order on desktop: quote → student accepts →
// payment recorded → bought → warehouse → QC → approved → batched.
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { AUTH_DIR } from "./helpers";

test.describe.configure({ mode: "serial" });
test.use({ storageState: path.join(AUTH_DIR, "admin.json") });

let orderUrl = "";

/** The visible primary action on the order page (phone has a pinned copy). */
const primary = (page: Page, name: string | RegExp) => page.getByRole("button", { name }).filter({ visible: true }).first();

/** Advance actions ask for a second tap to confirm. */
async function twoTap(page: Page, name: string) {
  await primary(page, name).click();
  await primary(page, "Tap again to confirm").click();
}

test("the board lists the new order with its next step", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const card = page.getByRole("article").filter({ hasText: "Canvas sneakers" });
  await expect(card.getByRole("button", { name: "Send quote" })).toBeVisible();
  await card.getByRole("link", { name: /^Open order/ }).click();
  await expect(page).toHaveURL(/\/admin\/orders\/\d+$/);
  orderUrl = page.url();
  await expect(primary(page, "Send quote")).toBeVisible();
});

test("admin creates an open air batch", async ({ page }) => {
  await page.goto("/admin/batches");
  await page.getByRole("button", { name: "New batch" }).first().click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await drawer.getByLabel("Code").fill("Air E2E");
  const cutoff = new Date(Date.now() + 14 * 86_400_000);
  const local = new Date(cutoff.getTime() - cutoff.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await drawer.getByLabel("Cutoff").fill(local);
  await drawer.getByLabel("Minimum orders").fill("1");
  await drawer.getByRole("button", { name: /save|create/i }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByText("Air E2E").first()).toBeVisible();
});

test("admin sends a quote from the right-hand drawer", async ({ page }) => {
  await page.goto(orderUrl);
  await primary(page, "Send quote").click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  // It slides in from the right and hugs the right edge.
  await expect.poll(async () => {
    const box = (await drawer.boundingBox())!;
    return Math.round(box.x + box.width);
  }).toBe(page.viewportSize()!.width);

  await drawer.getByLabel(/Item price/).fill("120.00");
  await drawer.getByRole("radio", { name: "Category default" }).click();
  await expect(drawer.getByText("Pays now (top of range)")).toBeVisible();
  await drawer.getByRole("button", { name: "Send quote" }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByText(/quote sent/i).first()).toBeVisible();
});

test("the student accepts the quote", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: path.join(AUTH_DIR, "student.json") });
  const page = await ctx.newPage();
  await page.goto(orderUrl.replace("/admin/orders/", "/orders/"));
  await page.getByRole("button", { name: /^Accept and pay/ }).click();
  await expect(page.getByText(/DuitNow/i).first()).toBeVisible();
  await ctx.close();
});

test("admin records the payment and works the order through QC", async ({ page }) => {
  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Record payment…" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByLabel("Amount received")).not.toHaveValue("");
  await drawer.getByLabel(/Reference/).fill("Cash at pickup desk");
  await drawer.getByRole("button", { name: "Record payment" }).click();
  await expect(drawer).toBeHidden();

  await twoTap(page, "Mark bought");
  await twoTap(page, "Mark at warehouse");

  await primary(page, "Record QC").click();
  const qc = page.getByRole("dialog");
  await qc.getByLabel("Weight (kg)").fill("0.8");
  await qc.getByLabel("Length (cm)").fill("30");
  await qc.getByLabel("Width (cm)").fill("20");
  await qc.getByLabel("Height (cm)").fill("12");
  await qc.getByLabel(/QC notes/).fill("Checked: right colour and size.");
  await qc.getByRole("button", { name: "Save and move to QC review" }).click();
  await expect(qc).toBeHidden();

  await twoTap(page, "Approve QC");
  await primary(page, "Add to batch").click();
  const batch = page.getByRole("dialog");
  await batch.getByRole("radio", { name: /Air E2E/ }).click();
  await batch.getByRole("button", { name: /add to batch/i }).click();
  await expect(batch).toBeHidden();
  await expect(page.getByText("Air E2E").first()).toBeVisible();
});

test("the order shows in its batch", async ({ page }) => {
  await page.goto("/admin/batches");
  await page.getByRole("link", { name: /Air E2E/ }).first().click();
  await expect(page.getByText("Canvas sneakers").first()).toBeVisible();
});
