/**
 * Integration tests for the catalog's public-offering rules exercised through
 * the REAL catalog functions (listOfferedFarms, getFarmCatalog, search). These
 * bind the app's prisma singleton to a temp SQLite db by setting DATABASE_URL
 * before importing, then seed records directly.
 *
 * Covers acceptance criteria:
 *  - homepage lists only approved+active farms
 *  - farm page shows only that farm's products; a withdrawn lot's product is not offered
 *  - search returns matches and excludes non-public records
 */
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
let dir: string;

// Set DATABASE_URL + push schema BEFORE importing anything that pulls in the
// prisma singleton.
dir = mkdtempSync(join(tmpdir(), "vedella-catalog-"));
const dbPath = join(dir, "test.db");
process.env.DATABASE_URL = `file:${dbPath}`;
execSync("npx prisma db push --skip-generate --accept-data-loss", {
  cwd: projectRoot,
  env: { ...process.env },
  stdio: "ignore",
});

// Now import the app modules (bound to the temp db).
const { prisma } = await import("../../src/lib/db");
const { listOfferedFarms, getFarmCatalog, search } = await import(
  "../../src/lib/catalog"
);
const { makeFarm, makeProduct, makeLot } = await import("../helpers/fixtures");

beforeAll(async () => {
  // Approved + active farm with an offered cut and a withdrawn-only product.
  const open = await makeFarm(prisma, {
    slug: "open-farm",
    name: "Open Farm",
  });
  const entrecot = await makeProduct(prisma, open.id, {
    name: "Entrecot",
    basePriceCents: 1438,
  });
  await makeLot(prisma, open.id, entrecot.id, {
    reference: "OPEN-ENT",
    units: 20,
  });
  const ossobuc = await makeProduct(prisma, open.id, {
    name: "Ossobuc",
    basePriceCents: 1120,
  });
  await makeLot(prisma, open.id, ossobuc.id, {
    reference: "OPEN-OSS-WD",
    units: 10,
    isWithdrawn: true,
  });

  // A pack whose cuts are all offered.
  const pack = await makeProduct(prisma, open.id, {
    kind: "pack",
    name: "Pack A · Descoberta",
    basePriceCents: 4200,
  });
  await prisma.packItem.create({
    data: { packProductId: pack.id, cutProductId: entrecot.id, quantity: 1 },
  });

  // A NOT-approved farm (should never appear).
  const hidden = await makeFarm(prisma, {
    slug: "hidden-farm",
    name: "Hidden Farm",
    isApproved: false,
  });
  const hiddenCut = await makeProduct(prisma, hidden.id, {
    name: "Hidden Entrecot",
  });
  await makeLot(prisma, hidden.id, hiddenCut.id, { reference: "HID-1" });

  // An inactive farm (should never appear).
  await makeFarm(prisma, {
    slug: "inactive-farm",
    name: "Inactive Farm",
    isActive: false,
  });
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("listOfferedFarms", () => {
  it("returns only approved + active farms", async () => {
    const farms = await listOfferedFarms();
    const slugs = farms.map((f) => f.slug);
    expect(slugs).toContain("open-farm");
    expect(slugs).not.toContain("hidden-farm");
    expect(slugs).not.toContain("inactive-farm");
  });
});

describe("getFarmCatalog", () => {
  it("returns null for a non-approved farm (404 trigger)", async () => {
    expect(await getFarmCatalog("hidden-farm")).toBeNull();
    expect(await getFarmCatalog("inactive-farm")).toBeNull();
    expect(await getFarmCatalog("no-such-slug")).toBeNull();
  });

  it("shows only this farm's offered products and excludes withdrawn-only ones", async () => {
    const cat = await getFarmCatalog("open-farm");
    expect(cat).not.toBeNull();
    const cutNames = cat!.cuts.map((c) => c.name);
    expect(cutNames).toContain("Entrecot");
    // Ossobuc's only lot is withdrawn -> not offered.
    expect(cutNames).not.toContain("Ossobuc");
    // Pack offered because its only cut (Entrecot) is offered.
    expect(cat!.packs.map((p) => p.name)).toContain("Pack A · Descoberta");
    // Lot code present on the offered cut.
    expect(cat!.cuts.find((c) => c.name === "Entrecot")?.lotReference).toBe(
      "OPEN-ENT",
    );
  });
});

describe("search", () => {
  it("finds offered farms and products by name/cut", async () => {
    const r = await search("entrecot");
    expect(r.products.some((p) => p.name === "Entrecot")).toBe(true);
    // Hidden farm's entrecot must not surface.
    expect(r.products.every((p) => p.farmSlug !== "hidden-farm")).toBe(true);
  });

  it("excludes withdrawn-only products", async () => {
    const r = await search("ossobuc");
    expect(r.products.some((p) => p.name === "Ossobuc")).toBe(false);
  });

  it("matches farms by name", async () => {
    const r = await search("open");
    expect(r.farms.some((f) => f.slug === "open-farm")).toBe(true);
  });

  it("returns empty for a blank query", async () => {
    const r = await search("   ");
    expect(r.farms).toHaveLength(0);
    expect(r.products).toHaveLength(0);
  });
});

describe("locale-aware content resolution", () => {
  it("surfaces an approved translation and falls back to ca otherwise", async () => {
    const open = await prisma.farm.findFirstOrThrow({
      where: { slug: "open-farm" },
    });
    // Approved EN name for the farm; a machine (unapproved) ES name that must NOT surface.
    await prisma.translation.create({
      data: {
        entityType: "farm",
        entityId: open.id,
        field: "name",
        locale: "en",
        text: "Open Farm (EN approved)",
        status: "approved",
      },
    });
    await prisma.translation.create({
      data: {
        entityType: "farm",
        entityId: open.id,
        field: "name",
        locale: "es",
        text: "Granja Abierta (machine)",
        status: "machine",
      },
    });

    const en = await listOfferedFarms("en");
    const es = await listOfferedFarms("es");
    const ca = await listOfferedFarms("ca");

    expect(en.find((f) => f.slug === "open-farm")?.name).toBe(
      "Open Farm (EN approved)",
    );
    // ES is only machine -> falls back to the base ca value.
    expect(es.find((f) => f.slug === "open-farm")?.name).toBe("Open Farm");
    expect(ca.find((f) => f.slug === "open-farm")?.name).toBe("Open Farm");
  });
});
