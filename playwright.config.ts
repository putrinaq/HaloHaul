import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against the production build (`npm run build` first).
// scripts/e2e-server.mjs starts a throwaway database and the app on :3200.
// Uses the installed Google Chrome, so no browser download is needed.

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3200",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", testIgnore: /mobile\.spec\.ts/, use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } } },
    { name: "phone", testMatch: /mobile\.spec\.ts/, use: { ...devices["Pixel 7"], channel: "chrome" } },
  ],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://localhost:3200/api/health",
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "pipe",
  },
});
