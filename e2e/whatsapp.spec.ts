// The WhatsApp inbox: a webhook arrives, shows up live beside the customer's
// orders, and is answered. Meta's API is a stand-in (scripts/e2e-server.mjs).
import { expect, test, type APIRequestContext } from "@playwright/test";
import { createHmac } from "node:crypto";
import path from "node:path";
import { AUTH_DIR } from "./helpers";

test.use({ storageState: path.join(AUTH_DIR, "admin.json") });
test.describe.configure({ mode: "serial" });

const PHONE = "60123456789"; // the seeded demo student's

function webhook(request: APIRequestContext, value: Record<string, unknown>, signed = true) {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "1", changes: [{ field: "messages", value: { metadata: { phone_number_id: "e2e-number" }, ...value } }] }] });
  const signature = `sha256=${createHmac("sha256", signed ? "e2e-app-secret" : "wrong").update(body).digest("hex")}`;
  return request.post("/api/whatsapp/webhook", { data: Buffer.from(body), headers: { "content-type": "application/json", "x-hub-signature-256": signature } });
}

const message = (id: string, text: string) => ({
  contacts: [{ profile: { name: "Nazri WA" }, wa_id: PHONE }],
  messages: [{ from: PHONE, id, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
});

test("Meta's check passes, and unsigned webhooks are refused", async ({ request }) => {
  const check = await request.get("/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=e2e-verify&hub.challenge=12345");
  expect(await check.text()).toBe("12345");
  expect((await request.get("/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1")).status()).toBe(403);
  expect((await webhook(request, message("wamid.bad", "forged"), false)).status()).toBe(403);
});

test("before they write, only an approved template can be sent", async ({ page }) => {
  await page.goto("/admin/messages");
  await page.getByRole("link", { name: /Ahmad Nazri/ }).click();
  await expect(page.getByText("They haven't written to you yet")).toBeVisible();
  await page.getByLabel("Template", { exact: true }).selectOption("order_update/en");
  await expect(page.getByLabel("name", { exact: true })).toHaveValue("Ahmad");
  await page.getByRole("button", { name: "Send template" }).click();
  await expect(page).toHaveURL(/chat=/);
  await expect(page.getByRole("log").getByText(/Hi Ahmad, there is news about order #\d+\./)).toBeVisible();
});

test("a message arrives live, is answered, and its ticks update", async ({ page, request }) => {
  await page.goto("/admin/messages");
  expect((await webhook(request, message("wamid.q1", "Can I change the size to M?"))).status()).toBe(200);
  const row = page.getByRole("region", { name: "Chats" }).getByRole("link", { name: /Ahmad Nazri/ });
  await expect(row).toContainText("Can I change the size to M?", { timeout: 15_000 });
  await expect(row).toContainText("1 unread");

  await row.click();
  await expect(page.getByRole("log").getByText("Can I change the size to M?")).toBeVisible();
  await expect(row).not.toContainText("unread");
  await expect(page.getByRole("complementary", { name: "Orders" }).getByRole("link", { name: /#\d+/ }).first()).toBeVisible();

  await page.getByLabel("Message", { exact: true }).fill("Sure, done!");
  await page.getByLabel("Message", { exact: true }).press("Enter");
  const bubble = page.getByRole("log").getByRole("listitem").filter({ hasText: "Sure, done!" });
  await expect(bubble).toContainText("Sent");
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");

  // Everything up to here has gone out as wamid.e2e1, 2, …; the newest is ours.
  for (let i = 1; i <= 6; i++) await webhook(request, { statuses: [{ id: `wamid.e2e${i}`, status: "read" }] });
  await expect(bubble).toContainText("Read", { timeout: 15_000 });
});

test("quick replies fill in from the chosen order", async ({ page }) => {
  await page.goto("/admin/messages");
  await page.getByRole("link", { name: /Ahmad Nazri/ }).click();
  await page.getByLabel("Quick reply").selectOption("Needs info");
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(/Hi Ahmad, we need a little more info about order #\d+/);
});

test("on a phone it's one pane at a time, with orders folded above the chat", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/messages");
  await page.getByRole("link", { name: /Ahmad Nazri/ }).click();
  await expect(page.getByRole("log")).toBeVisible();
  await expect(page.getByRole("region", { name: "Chats" })).toBeHidden();
  await page.getByText(/^Orders · \d+/).click();
  await expect(page.locator("details").getByRole("link", { name: /#\d+/ }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Back to chats" }).click();
  await expect(page.getByRole("region", { name: "Chats" })).toBeVisible();
});

test("students can't read the inbox", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: path.join(AUTH_DIR, "student.json") });
  expect((await ctx.request.get("/api/admin/whatsapp/version")).status()).toBe(404);
  expect((await ctx.request.get("/api/admin/whatsapp/media/123e4567-e89b-12d3-a456-426614174000")).status()).toBe(404);
  await ctx.close();
});
