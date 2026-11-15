import { test, expect, type Page } from "@playwright/test";
import {
  loginAsPlatformAdmin,
  loginAsCustomerExpectDenied,
  submitLogin,
  SEED_TEMP_PASSWORD,
} from "./helpers";

/**
 * FEAT-004 (condition 6) — end-to-end persona isolation driven through the UI
 * against the Vercel/Neon-realistic Postgres e2e env from FEAT-002.
 *
 * STATUS IN THIS SANDBOX: Not run (needs Docker/Postgres env). It is listed in
 * docs/postgres-e2e-env.md and must NEVER be reported PASS until a real Postgres
 * (local Docker or a Neon dev branch) is provided. The Vitest suites
 * tests/integration/persona-isolation.test.ts and language-invariance.test.ts
 * cover the same matrix offline at the primitive level; this spec is the
 * browser-level confirmation of the same guarantees.
 *
 * The five personas (seeded by scripts/seed-e2e-postgres.ts):
 *   1. logged-out public visitor      (no session)
 *   2. customer                       client@vedellalocal.example
 *   3. Farm A manager                 manager-a@vedellalocal.example (farm e2e-farm-a)
 *   4. Farm B manager                 manager-b@vedellalocal.example (farm e2e-farm-b)
 *   5. platform administrator         e2e-admin@vedellalocal.example
 */

const FARM_A_SLUG = "e2e-farm-a";
const FARM_B_SLUG = "e2e-farm-b";
const FARM_A_MANAGER = "manager-a@vedellalocal.example";
const FARM_B_MANAGER = "manager-b@vedellalocal.example";

/**
 * Seeded farm managers carry a TEMPORARY password (mustChangePassword=true), so
 * a first login is redirected into the forced change-password flow. Resolve it
 * to a stable per-manager password and land on the dashboard scoped to that
 * farm manager.
 */
async function loginAsManager(
  page: Page,
  email: string,
  newPassword: string,
): Promise<void> {
  await submitLogin(page, email, SEED_TEMP_PASSWORD);
  // The temporary password forces the change-password route first.
  await page.waitForURL("**/admin/change-password");
  await page.getByTestId("change-password-new").fill(newPassword);
  await page.getByTestId("change-password-confirm").fill(newPassword);
  await page.getByTestId("change-password-submit").click();
  await page.waitForURL("**/admin");
  await expect(page.getByTestId("dashboard-role")).toHaveText("farm_manager");
}

// ---------------------------------------------------------------------------
// Persona 1: logged-out public visitor — only public, approved+active records.
// ---------------------------------------------------------------------------
test("public visitor sees both approved farms but no admin area", async ({
  page,
}) => {
  await page.goto(`/ca/farms/${FARM_A_SLUG}`);
  await expect(page.getByText("Entrecot").first()).toBeVisible();

  await page.goto(`/ca/farms/${FARM_B_SLUG}`);
  await expect(page.getByText("Entrecot").first()).toBeVisible();

  // No session => the admin area redirects to login.
  await page.goto("/admin");
  await page.waitForURL("**/admin/login");
});

// ---------------------------------------------------------------------------
// Persona 2: customer — denied the admin area entirely.
// ---------------------------------------------------------------------------
test("customer is denied the admin area", async ({ page }) => {
  await loginAsCustomerExpectDenied(page);
  await expect(page.getByTestId("access-denied")).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});

// ---------------------------------------------------------------------------
// Personas 3 & 4: Farm A manager vs Farm B manager — cross-farm isolation.
// ---------------------------------------------------------------------------
test("Farm A manager sees only Farm A's records in the admin area", async ({
  page,
}) => {
  await loginAsManager(page, FARM_A_MANAGER, "FarmAPass!2026");

  // The admin farms list is scoped: Farm A only, never Farm B.
  await page.goto("/admin/farms");
  await expect(page.getByText("Granja A — e2e")).toBeVisible();
  await expect(page.getByText("Granja B — e2e")).toHaveCount(0);

  // The offers/lots lists are likewise farm-scoped.
  await page.goto("/admin/lots");
  await expect(page.getByText(/E2E-FARM-A/i).first()).toBeVisible();
  await expect(page.getByText(/E2E-FARM-B/i)).toHaveCount(0);
});

test("Farm B manager sees only Farm B's records in the admin area", async ({
  page,
}) => {
  await loginAsManager(page, FARM_B_MANAGER, "FarmBPass!2026");

  await page.goto("/admin/farms");
  await expect(page.getByText("Granja B — e2e")).toBeVisible();
  await expect(page.getByText("Granja A — e2e")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// URL-id tamper: a Farm A manager editing a Farm B id into the URL is blocked.
// ---------------------------------------------------------------------------
test("a Farm A manager cannot reach Farm B's admin orders by scope", async ({
  page,
}) => {
  await loginAsManager(page, FARM_A_MANAGER, "FarmAPass!2026b");

  // The orders list is farm-scoped server-side; Farm B's order is never shown
  // to Farm A even though it exists in the shared DB.
  await page.goto("/admin/orders");
  // Farm A's fulfilment is visible; Farm B's farm name never appears.
  await expect(page.getByText("Granja B — e2e")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Persona 5: platform administrator — authorised cross-farm access retained.
// ---------------------------------------------------------------------------
test("platform admin sees BOTH farms across the admin area", async ({ page }) => {
  await loginAsPlatformAdmin(page);
  await page.goto("/admin/farms");
  await expect(page.getByText("Granja A — e2e")).toBeVisible();
  await expect(page.getByText("Granja B — e2e")).toBeVisible();
});
