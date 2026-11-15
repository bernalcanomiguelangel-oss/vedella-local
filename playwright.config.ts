import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright e2e harness (headless chromium). Specs live in e2e/.
 *
 * A global setup seeds the database deterministically before the run. The app
 * is started with `npm run dev` and reused if already running locally. The three
 * flows covered: browse -> reserve, admin approve, language switch.
 *
 * POSTGRES (FEAT-002): when TEST_DATABASE_URL (local Docker) or E2E_DATABASE_URL
 * (Neon dev branch, Vercel-realistic) is set, the dev server boots against that
 * Postgres URL instead of the local .env SQLite path, resolving the Phase-1
 * blocker (the dev server booted a Postgres client while local .env was SQLite).
 * When NEITHER is set, the webServer env is left untouched and the current local
 * behaviour is preserved.
 */
const e2eDbUrl =
  process.env.TEST_DATABASE_URL?.trim() || process.env.E2E_DATABASE_URL?.trim();

/**
 * Env injected into the `npm run dev` webServer. Only overrides the DB URL when
 * an e2e Postgres URL is provided; otherwise falls back to the ambient env.
 */
const webServerEnv: Record<string, string> = e2eDbUrl
  ? { ...process.env as Record<string, string>, DATABASE_URL: e2eDbUrl, DIRECT_URL: e2eDbUrl }
  : (process.env as Record<string, string>);

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
    env: webServerEnv,
  },
});
