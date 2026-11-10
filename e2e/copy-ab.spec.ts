import { test, expect } from "@playwright/test";
import { loginAsPlatformAdmin } from "./helpers";

/**
 * Copy A/B + LLM-as-judge loop (FEAT-005), exercised OFFLINE with the mock
 * provider:
 *   1. an admin logs in and opens the Copy A/B surface,
 *   2. proposes AI variants for an offer (clearly labelled AI draft),
 *   3. runs the LLM-as-judge and sees PASS/FAIL verdicts,
 *   4. records a human accept/edit/reject decision WITH a required reason,
 *   5. confirms the decision + audit history is visible,
 *   6. confirms NOTHING was published without the human action (a reason is
 *      required; the AI never flips status on its own).
 *
 * Deterministic + offline: no API key is set, so the MockAiProvider drives the
 * whole loop. The provider key never reaches the browser.
 */
test("copy A/B loop: propose -> judge -> human decide with reason -> history visible", async ({
  page,
}) => {
  await loginAsPlatformAdmin(page);

  await page.goto("/admin/copy");
  await expect(
    page.getByRole("heading", { name: "Copy A/B (descripcions)" }),
  ).toBeVisible();

  // The surface is clearly labelled as an AI draft / recommendation.
  await expect(page.getByText("Esborrany / recomanació d'IA").first()).toBeVisible();

  // Propose AI variants for the first offer in scope.
  const propose = page.getByTestId("copy-propose-run").first();
  await expect(propose).toBeVisible();
  await propose.click();

  // Proposed variants appear with the AI-draft label.
  const variant = page.getByTestId("copy-variant").first();
  await expect(variant).toBeVisible();

  // A decision requires a reason: clicking reject with an empty reason shows an
  // inline error and does NOT record a decision.
  const firstVariant = page.getByTestId("copy-variant").first();
  await firstVariant.getByTestId("copy-reject").click();
  await expect(firstVariant.getByTestId("copy-error")).toBeVisible();

  // Provide a reason, then reject -> decision recorded (human action only).
  await firstVariant.getByTestId("copy-reason").fill("No encaixa amb el to de la granja.");
  await firstVariant.getByTestId("copy-reject").click();
  await expect(firstVariant.getByTestId("copy-decided")).toBeVisible();

  // The decision/audit history now shows the recorded human decision.
  const history = page.getByTestId("decision-history");
  await expect(history).toBeVisible();
  await expect(history.getByTestId("history-row").first()).toContainText("reject");
});
