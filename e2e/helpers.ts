import { expect, type Page } from "@playwright/test";

/**
 * Shared e2e auth helpers for the real email+password login.
 *
 * The seed creates every production-like identity with a TEMPORARY password and
 * mustChangePassword=true. To keep the admin flows deterministic on a shared DB
 * (so no test mutates another test's credentials), global-setup provisions a
 * dedicated e2e admin whose password is already set. The forced
 * change-password flow is covered by its own spec against a seeded identity.
 */
export const SEED_TEMP_PASSWORD =
  process.env.SEED_ADMIN_TEMP_PASSWORD?.trim() || "ChangeMe123!";

/** Dedicated e2e admin (provisioned in global-setup, no forced change). */
export const E2E_ADMIN_EMAIL = "e2e-admin@vedellalocal.example";
export const E2E_ADMIN_PASSWORD = "E2eAdmin!2026";

/** Seeded identities (temporary password, mustChangePassword=true). */
export const SEEDED_ADMIN_EMAIL = "admin@vedellalocal.example";
export const CUSTOMER_EMAIL = "client@vedellalocal.example";

export async function submitLogin(page: Page, email: string, password: string) {
  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
}

/**
 * Log in as the dedicated e2e platform admin and land on the dashboard. Uses a
 * stable, already-set password so it does not depend on (or mutate) the forced
 * change-password flow.
 */
export async function loginAsPlatformAdmin(page: Page): Promise<void> {
  await submitLogin(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
  await page.waitForURL("**/admin");
  await expect(page.getByTestId("dashboard-role")).toHaveText("platform_admin");
}

/**
 * Attempt to sign in as a customer. A customer has no admin access: after the
 * temporary-password redirect, the change-password route (requireSession) denies
 * them, so they end up on /admin/denied. Returns once denied is shown.
 */
export async function loginAsCustomerExpectDenied(page: Page): Promise<void> {
  await submitLogin(page, CUSTOMER_EMAIL, SEED_TEMP_PASSWORD);
  await page.waitForURL("**/admin/denied");
}
