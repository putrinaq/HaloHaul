// Every public page hydrates without a server/client mismatch, for each kind
// of visitor, and going Home from it doesn't trip one either (streamed parts
// can hydrate after the route has already changed).
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { AUTH_DIR } from "./helpers";

// Production React reports mismatches by number (e.g. "Minified React error #418").
// It doesn't report attribute-only differences at all; those show only in dev.
const MISMATCH = /hydrat|React error #(418|419|421|422|423|425)\b/i;

const PAGES = ["/", "/pricing", "/how-it-works", "/shipping", "/catalogue", "/faq", "/terms", "/privacy", "/orders", "/account", "/cart"];

function collectHydrationErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && MISMATCH.test(m.text())) errors.push(m.text().slice(0, 400));
  });
  page.on("pageerror", (e) => {
    if (MISMATCH.test(e.message)) errors.push(e.message.slice(0, 400));
  });
  return errors;
}

for (const who of ["student", "admin", "signed out"] as const) {
  test.describe(who, () => {
    if (who !== "signed out") test.use({ storageState: path.join(AUTH_DIR, `${who}.json`) });

    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      test(`pages hydrate cleanly at ${viewport.width}px, and going Home too`, async ({ page }) => {
        test.setTimeout(180_000);
        await page.setViewportSize(viewport);
        const errors = collectHydrationErrors(page);
        for (const p of PAGES) {
          await page.goto(p, { waitUntil: "networkidle" });
          await page.waitForTimeout(300);
          if (new URL(page.url()).pathname === "/") continue;
          // The logo is in the header at every width.
          await page.getByRole("link", { name: "HaloHaul" }).first().click();
          await expect(page).toHaveURL(/\/$/);
          await page.waitForTimeout(500);
          expect(errors, `from ${p}`).toEqual([]);
        }
        expect(errors).toEqual([]);
      });
    }
  });
}
