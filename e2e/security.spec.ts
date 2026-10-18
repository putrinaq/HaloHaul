// Who can reach the admin: nobody signed out, never a student.
import { expect, test } from "@playwright/test";
import path from "node:path";
import { AUTH_DIR } from "./helpers";

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fadmin|\/sign-in\?next=\/admin/);
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
