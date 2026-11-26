// Who can reach the admin: nobody signed out, never a student.
import { expect, test } from "@playwright/test";
import path from "node:path";
import { ADMIN, AUTH_DIR, STUDENT, adminSecret, totp } from "./helpers";

test("signed-out visitors are sent to the admin's own sign-in", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
});

test("each account only works on its own sign-in page", async ({ page }) => {
  await page.goto("/admin/sign-in");
  await page.getByLabel("Email").fill(STUDENT.email);
  await page.getByLabel("Password", { exact: true }).fill(STUDENT.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("don't match an admin account")).toBeVisible();

  await page.goto("/sign-in");
  const panel = page.getByRole("tabpanel", { name: "Sign in" });
  await panel.getByLabel("Email").fill(ADMIN.email);
  await panel.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await panel.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(panel.getByText("That email and password don't match.")).toBeVisible();

  await page.goto("/admin/sign-in?next=/admin/payment");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/two-factor/);
  await page.getByLabel("6-digit code").fill(totp(adminSecret()));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/admin\/payment$/);
  // Already signed in: no form, straight through.
  await page.goto("/admin/sign-in");
  await expect(page).toHaveURL(/\/admin$/);
});

test("signed-out CSV export is refused", async ({ request }) => {
  const r = await request.get("/admin/report/export/months");
  expect([401, 403, 404]).toContain(r.status());
});

test.describe("as a student", () => {
  test.use({ storageState: path.join(AUTH_DIR, "student.json") });

  // The admin gate runs inside a streamed boundary, so the status is already
  // 200 when notFound() fires; what matters is that nothing admin renders.
  test("admin pages are not found", async ({ page }) => {
    for (const p of ["/admin", "/admin/payment", "/admin/settings/categories"]) {
      await page.goto(p);
      await expect(page.getByText("This page could not be found."), p).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Admin" }), p).toHaveCount(0);
      expect(await page.locator('meta[name="robots"][content*="noindex"]').count(), p).toBeGreaterThan(0);
    }
  });

  test("admin APIs refuse them", async ({ request }) => {
    expect([401, 403, 404]).toContain((await request.get("/admin/report/export/months")).status());
    const presign = await request.post("/api/admin/uploads/presign", { data: { purpose: "qc", contentType: "image/jpeg", size: 1000 } });
    expect([401, 403, 404]).toContain(presign.status());
  });
});
