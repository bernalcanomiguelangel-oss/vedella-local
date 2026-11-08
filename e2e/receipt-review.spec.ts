import { test, expect } from "@playwright/test";
import path from "node:path";

/**
 * Receipt flow: an admin uploads a receipt, the AI pre-fills a human review form
 * (creating/approving NOTHING), the human enters a price and submits, and the
 * record is created into pending_review (never auto-approved).
 */
test("receipt upload pre-fills a form; submitting creates a pending_review record", async ({
  page,
}) => {
  // Sign in as platform admin.
  await page.goto("/admin/login");
  await page.getByTestId("login-platform_admin").click();
  await page.waitForURL("**/admin");

  await page.goto("/admin/receipts");
  await expect(
    page.getByRole("heading", { name: "Ingesta de rebuts" }),
  ).toBeVisible();

  // Upload the fixture receipt.
  await page
    .getByTestId("receipt-file")
    .setInputFiles(path.join(__dirname, "fixtures", "receipt.png"));
  await page.getByTestId("receipt-upload").click();

  // The pre-filled form appears with extracted (editable) values. No record has
  // been created or approved at this point — it is a form only.
  await expect(page.getByTestId("receipt-form")).toBeVisible();
  const productName = page.getByTestId("receipt-product-name");
  await expect(productName).toHaveValue(/.+/);

  // The human enters a price (AI never sets prices) with a unique lot reference.
  const uniqueRef = `E2E-RCPT-${Date.now()}`;
  await productName.fill("Rebut e2e vedella");
  await page.getByTestId("receipt-price").fill("13,20");
  await page.getByTestId("receipt-lot").fill(uniqueRef);

  // Submit -> created into pending_review.
  await page.getByTestId("receipt-submit").click();
  await expect(page.getByTestId("receipt-result")).toContainText(
    /revisió pendent/i,
  );

  // It now shows up in the human review queue (pending_review), not published.
  await page.goto("/admin/review");
  await expect(
    page
      .getByTestId("pending-product")
      .filter({ hasText: "Rebut e2e vedella" }),
  ).toBeVisible();
});
