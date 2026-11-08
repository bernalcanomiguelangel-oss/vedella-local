import { test, expect } from "@playwright/test";

/**
 * Flow (a): browse the homepage -> open a farm -> search -> add a pack and a cut
 * to the basket -> reserve -> see the order confirmation with a lot code.
 */
test("customer can browse, search, add a pack + a cut, and reserve", async ({
  page,
}) => {
  // Homepage lists the two seeded farms.
  await page.goto("/ca");
  await expect(
    page.getByRole("heading", { name: "Les nostres granges" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Mas Vallgorguina" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Cal Serrat del Bosc" }),
  ).toBeVisible();

  // Open a farm page.
  await page.goto("/ca/farms/mas-vallgorguina");
  await expect(page.getByRole("heading", { name: "Mas Vallgorguina" })).toBeVisible();

  // Search returns matching products.
  await page.goto("/ca");
  const searchInput = page.getByPlaceholder("Cerca granges, packs o talls…");
  await searchInput.fill("entrecot");
  await expect(page.getByText("Entrecot").first()).toBeVisible();

  // Add a pack and a cut from the farm page.
  await page.goto("/ca/farms/mas-vallgorguina");

  // Wait for client hydration (the add buttons are in a client component).
  const packCard = page.getByTestId("pack-card").filter({
    has: page.getByRole("heading", { name: "Pack A · Descoberta" }),
  });
  const cutCard = page.getByTestId("cut-card").filter({
    has: page.getByRole("heading", { name: "Entrecot", exact: true }),
  });
  await expect(packCard.getByTestId("add-to-basket")).toBeVisible();

  // Add the pack; the button flips to "✓ Afegit", proving the handler ran and
  // the basket state updated (and was persisted to localStorage).
  await packCard.getByTestId("add-to-basket").click();
  await expect(packCard.getByText(/Afegit/)).toBeVisible();

  // Add the Entrecot cut.
  await cutCard.getByTestId("add-to-basket").click();
  await expect(cutCard.getByText(/Afegit/)).toBeVisible();

  // Go to the basket; both items present.
  await page.goto("/ca/basket");
  await expect(page.getByRole("heading", { name: "La teva cistella" })).toBeVisible();
  await expect(page.getByText("Pack A · Descoberta").first()).toBeVisible();
  await expect(page.getByText("Entrecot").first()).toBeVisible();

  // Reserve.
  await page.getByRole("button", { name: "Reserva ara" }).click();

  // Confirmation with a lot code.
  await expect(
    page.getByRole("heading", { name: "Reserva confirmada" }),
  ).toBeVisible();
  await expect(page.getByText("Codi de lot")).toBeVisible();
  // The lot code should be a non-empty monospace reference (seeded MAS-*).
  await expect(page.getByText(/MAS-/).first()).toBeVisible();
});
