// Signing up and in as a student, with a password (there are no email links).
import { expect, test } from "@playwright/test";

test("sign up with a password, then sign in with it", async ({ page }) => {
  const email = `new${Date.now()}@example.com`;
  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "New account" }).click();
  const signUp = page.getByRole("tabpanel", { name: "New account" });
  await signUp.getByLabel("Name").fill("Siti Aminah");
  await signUp.getByLabel("Email").fill(email);
  await signUp.getByLabel(/^Password/).fill("a-good-long-password");
  await signUp.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/orders/);

  await page.context().clearCookies();
  await page.goto("/sign-in");
  const signIn = page.getByRole("tabpanel", { name: "Sign in" });
  await signIn.getByLabel("Email").fill(email);
  await signIn.getByLabel("Password", { exact: true }).fill("a-good-long-password");
  await signIn.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/orders/);
});

test("there's no email-link option", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("tab")).toHaveText(["Sign in", "New account"]);
  await expect(page.getByText(/sign-in link/i)).toHaveCount(0);
});
