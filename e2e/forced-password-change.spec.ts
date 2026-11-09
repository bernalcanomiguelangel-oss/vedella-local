import { test, expect } from "@playwright/test";
import { submitLogin, SEEDED_ADMIN_EMAIL, SEED_TEMP_PASSWORD } from "./helpers";

/**
 * A seeded identity signs in with its TEMPORARY password and is forced through
 * the change-password flow before any admin page is reachable (decision 8 +
 * rule A). After setting a new password the dashboard becomes reachable.
 *
 * This mutates the seeded admin's password, so it runs against the dedicated
 * seeded admin (not the e2e admin the other specs use) to avoid cross-test
 * interference. global-setup re-seeds per run.
 */
test("a temporary password forces the change-password flow before admin access", async ({
  page,
}) => {
  await submitLogin(page, SEEDED_ADMIN_EMAIL, SEED_TEMP_PASSWORD);

  // Forced to the change-password page.
  await page.waitForURL("**/admin/change-password");
  await expect(page.getByTestId("change-password-forced")).toBeVisible();

  // Trying to reach a protected page first still bounces to change-password.
  await page.goto("/admin/review");
  await page.waitForURL("**/admin/change-password");

  // Set a new password; the dashboard is now reachable.
  const fresh = `E2e-Fresh-${Date.now()}`;
  await page.getByTestId("change-password-new").fill(fresh);
  await page.getByTestId("change-password-confirm").fill(fresh);
  await page.getByTestId("change-password-submit").click();

  await page.waitForURL("**/admin");
  await expect(page.getByTestId("dashboard-role")).toHaveText("platform_admin");
});
