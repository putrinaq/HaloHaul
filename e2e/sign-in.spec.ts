// Signing up and in as a student. (The e2e server has no working email key,
// like a site whose email isn't set up yet.)
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
  await page.getByRole("tab", { name: "Password" }).click();
  const signIn = page.getByRole("tabpanel", { name: "Password" });
  await signIn.getByLabel("Email").fill(email);
  await signIn.getByLabel("Password", { exact: true }).fill("a-good-long-password");
  await signIn.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/orders/);
});

test("when the email can't be sent, it says to use a password", async ({ page }) => {
  await page.goto("/sign-in");
  const panel = page.getByRole("tabpanel", { name: "Email link" });
  await panel.getByLabel("Email").fill("student@example.com");
  await panel.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(panel.getByRole("alert")).toContainText("Use the Password tab");
  await expect(page.getByText("Check your inbox")).toHaveCount(0);
});
