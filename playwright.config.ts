import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright e2e harness (headless chromium). Specs live in e2e/.
 *
 * A global setup seeds the database deterministically before the run. The app
 * is started with `npm run dev` and reused if already running locally. The three
 * flows covered: browse -> reserve, admin approve, language switch.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/ca",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
