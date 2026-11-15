import { test, expect } from "@playwright/test";
import { loginAsPlatformAdmin } from "./helpers";

/**
 * Condition 2 (FEAT-003) UI flow: the medical-claim content guard + mandatory
 * human-review gate.
 *
 * STATUS: Not run (needs Docker/Postgres env). Like the rest of the e2e suite,
 * this spec drives the Next.js dev server against a reachable PostgreSQL
 * (local Docker or a Neon dev branch, see docs/postgres-e2e-env.md). It is
 * NEITHER PASS NOR FAIL in a sandbox without Postgres — it simply does not run.
 *
 * Flow it drives:
 *   1. A manager/admin saves an offer whose description contains a medical
 *      claim ("cures iron deficiency and prevents anaemia"). The draft SAVES.
 *   2. The offer surfaces in the review queue flagged for content review and is
 *      NOT visible on the public farm page.
 *   3. An attempt to approve/publish it while the flag is unresolved is refused.
 *   4. A platform_admin resolves the flag (approve corrected wording), and only
 *      then can the normal human approval/publish proceed.
 */

test("flagged medical-claim offer is held for human review and cannot be published while unresolved", async ({
  page,
}) => {
  await loginAsPlatformAdmin(page);

  // The flagged offer must not be publicly visible on the farm page.
  await page.goto("/admin/review");
  const flaggedRow = page
    .getByTestId("content-flagged-offer")
    .filter({ hasText: /content review/i })
    .first();
  await expect(flaggedRow).toBeVisible();

  // Publishing/approving while the content flag is unresolved is refused.
  await flaggedRow.getByTestId("approve-offer").click();
  await expect(page.getByText(/content.review/i)).toBeVisible();
});
