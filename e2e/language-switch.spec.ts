import { test, expect } from "@playwright/test";

/**
 * Flow (c): the language switcher toggles ca -> es -> en and the UI updates.
 */
test("language switcher updates the UI ca -> es -> en", async ({ page }) => {
  await page.goto("/ca");

  // Catalan (default) nav + hero.
  await expect(page.getByRole("link", { name: "Cistella" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Vedella local i traçable de Catalunya" }),
  ).toBeVisible();

  // Switch to Spanish.
  await page.getByRole("button", { name: "es", exact: true }).click();
  await page.waitForURL("**/es");
  await expect(page.getByRole("link", { name: "Cesta" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ternera local y trazable de Cataluña" }),
  ).toBeVisible();

  // Switch to English.
  await page.getByRole("button", { name: "en", exact: true }).click();
  await page.waitForURL("**/en");
  await expect(page.getByRole("link", { name: "Basket" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Local, traceable Catalan beef" }),
  ).toBeVisible();
});
