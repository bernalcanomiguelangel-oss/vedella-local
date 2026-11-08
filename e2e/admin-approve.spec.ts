import { test, expect } from "@playwright/test";

/**
 * Flow (b): a platform_admin logs in, approves a pending product and a machine
 * translation, publishes the product, and confirms both become visible on the
 * public marketplace.
 *
 * Also asserts the gating: a customer cannot reach the admin area.
 */

async function loginAsPlatformAdmin(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.getByTestId("login-platform_admin").click();
  await page.waitForURL("**/admin");
  await expect(page.getByTestId("dashboard-role")).toHaveText("platform_admin");
}

test("a customer is denied access to the admin area", async ({ page }) => {
  await page.goto("/admin/login");
  // Signing in as a customer and landing on /admin must redirect to denied
  // (gating is enforced server-side in requireAdmin).
  await page.getByTestId("login-customer").click();
  await page.waitForURL("**/admin/denied");
  await expect(page.getByTestId("access-denied")).toBeVisible();

  // Re-navigating to /admin still denies.
  await page.goto("/admin");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});

test("platform_admin approves a pending product and it becomes visible", async ({
  page,
}) => {
  await loginAsPlatformAdmin(page);

  // The seeded pending product is not visible publicly yet.
  await page.goto("/ca/farms/mas-vallgorguina");
  await expect(page.getByText("Secret de vedella")).toHaveCount(0);

  // Approve it in the review queue.
  await page.goto("/admin/review");
  const row = page
    .getByTestId("pending-product")
    .filter({ hasText: "Secret de vedella" });
  await expect(row).toBeVisible();
  await row.getByTestId("approve-product").click();

  // Approved != active, so publish it from the lifecycle controls.
  await page.goto("/admin/records");
  const lifecycleRow = page
    .getByTestId("lifecycle-product")
    .filter({ hasText: "Secret de vedella" });
  await expect(lifecycleRow.getByTestId("current-state")).toHaveText("approved");
  await lifecycleRow.getByTestId("to-active").click();
  await expect(lifecycleRow.getByTestId("current-state")).toHaveText("active");

  // Now it is publicly visible on the farm page.
  await page.goto("/ca/farms/mas-vallgorguina");
  await expect(page.getByText("Secret de vedella")).toBeVisible();
});

test("platform_admin approves a machine translation and it publishes", async ({
  page,
}) => {
  await loginAsPlatformAdmin(page);

  // Before approval, the English name falls back to the ca base ("Entrecot").
  await page.goto("/en/farms/mas-vallgorguina");
  await expect(page.getByText("Ribeye steak (machine)")).toHaveCount(0);

  // Approve the seeded machine translation.
  await page.goto("/admin/review");
  const tr = page
    .getByTestId("pending-translation")
    .filter({ hasText: "Ribeye steak (machine)" });
  await expect(tr).toBeVisible();
  await tr.getByTestId("approve-translation").click();

  // The approved translation now surfaces on the English farm page.
  await page.goto("/en/farms/mas-vallgorguina");
  await expect(page.getByText(/Ribeye steak \(machine\)/)).toBeVisible();
});
