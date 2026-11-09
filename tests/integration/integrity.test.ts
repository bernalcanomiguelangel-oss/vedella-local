/**
 * Integration tests for the traceability/integrity invariants (R8–R15) against a
 * real SQLite database. These assert DB-level enforcement (FKs, CHECKs, unique)
 * plus the shared validateLot() guard and the catalog's public-offering rules.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb, type TestDb } from "../helpers/testDb";
import { makeCycle, makeFarm, makeLot, makeProduct } from "../helpers/fixtures";
import { validateLot, LotValidationError } from "../../src/lib/validateLot";

let tdb: TestDb;
let db: PrismaClient;

beforeAll(async () => {
  tdb = await createTestDb();
  db = tdb.prisma;
}, 60_000);

afterAll(async () => {
  await tdb.cleanup();
});

describe("R8: every product belongs to a farm", () => {
  it("rejects a product with a non-existent farm (FK)", async () => {
    await expect(
      db.product.create({
        data: {
          farmId: "does-not-exist",
          kind: "cut",
          name: "Orphan",
          basePriceCents: 1000,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("R9: lot.farmId == product.farmId", () => {
  it("guard rejects a farm mismatch", async () => {
    const farmA = await makeFarm(db, { slug: "farm-a-r9" });
    const farmB = await makeFarm(db, { slug: "farm-b-r9" });
    const product = await makeProduct(db, farmA.id);
    expect(() =>
      validateLot(
        {
          farmId: farmB.id, // wrong farm
          productId: product.id,
          reference: "R9-1",
          units: 5,
          slaughterDate: new Date("2026-01-01"),
          cuttingDate: new Date("2026-01-02"),
          packingDate: new Date("2026-01-03"),
          expiryDate: new Date("2026-02-01"),
        },
        { product: { id: product.id, farmId: farmA.id } },
      ),
    ).toThrow(LotValidationError);
  });

  it("DB composite FK rejects a raw mismatched lot insert (bypassing the guard)", async () => {
    // This proves the invariant is enforced by the DATABASE, not only by
    // validateLot(): a write path that forgot the guard still cannot create a
    // lot whose farmId differs from its product's farmId.
    const farmA = await makeFarm(db, { slug: "farm-a-r9-db" });
    const farmB = await makeFarm(db, { slug: "farm-b-r9-db" });
    const product = await makeProduct(db, farmA.id); // belongs to farm A

    await expect(
      db.lot.create({
        data: {
          farmId: farmB.id, // wrong farm: no Product (id, farmId) pair matches
          productId: product.id,
          reference: "R9-DB-BAD",
          units: 5,
          slaughterDate: new Date("2026-01-01"),
          cuttingDate: new Date("2026-01-02"),
          packingDate: new Date("2026-01-03"),
          expiryDate: new Date("2026-02-01"),
        },
      }),
    ).rejects.toThrow();

    // The matching pair (farm A) is accepted, confirming the FK is not simply
    // rejecting every insert.
    await expect(
      db.lot.create({
        data: {
          farmId: farmA.id,
          productId: product.id,
          reference: "R9-DB-OK",
          units: 5,
          slaughterDate: new Date("2026-01-01"),
          cuttingDate: new Date("2026-01-02"),
          packingDate: new Date("2026-01-03"),
          expiryDate: new Date("2026-02-01"),
        },
      }),
    ).resolves.toBeTruthy();
  });
});

describe("R10: date ordering slaughter <= cutting <= packing < expiry", () => {
  it("DB CHECK rejects out-of-order dates", async () => {
    const farm = await makeFarm(db, { slug: "farm-r10" });
    const product = await makeProduct(db, farm.id);
    await expect(
      db.lot.create({
        data: {
          farmId: farm.id,
          productId: product.id,
          reference: "R10-bad",
          units: 5,
          slaughterDate: new Date("2026-02-01"),
          cuttingDate: new Date("2026-01-01"), // before slaughter
          packingDate: new Date("2026-01-02"),
          expiryDate: new Date("2026-03-01"),
        },
      }),
    ).rejects.toThrow();
  });
});

describe("R11: lot reference is unique", () => {
  it("DB unique index rejects a duplicate reference", async () => {
    const farm = await makeFarm(db, { slug: "farm-r11" });
    const product = await makeProduct(db, farm.id);
    await makeLot(db, farm.id, product.id, { reference: "DUP-1" });
    await expect(
      makeLot(db, farm.id, product.id, { reference: "DUP-1" }),
    ).rejects.toThrow();
  });
});

describe("R12: units are non-negative", () => {
  it("DB CHECK rejects negative units", async () => {
    const farm = await makeFarm(db, { slug: "farm-r12" });
    const product = await makeProduct(db, farm.id);
    await expect(
      db.lot.create({
        data: {
          farmId: farm.id,
          productId: product.id,
          reference: "R12-neg",
          units: -1,
          slaughterDate: new Date("2026-01-01"),
          cuttingDate: new Date("2026-01-02"),
          packingDate: new Date("2026-01-03"),
          expiryDate: new Date("2026-02-01"),
        },
      }),
    ).rejects.toThrow();
  });
});

describe("R13: withdrawn lots are not publicly offered", () => {
  it("excludes a product whose only lot is withdrawn (direct DB rule)", async () => {
    // NOTE: the public-offering rule is exercised through the real getFarmCatalog
    // in tests/integration/catalog.test.ts. Here we assert the underlying DB
    // predicate directly against this file's isolated test db for clarity.
    const farm = await makeFarm(db, { slug: "farm-r13" });
    const offered = await makeProduct(db, farm.id, { name: "Offered" });
    await makeLot(db, farm.id, offered.id, { reference: "R13-OK", units: 10 });
    const withdrawn = await makeProduct(db, farm.id, { name: "Withdrawn" });
    await makeLot(db, farm.id, withdrawn.id, {
      reference: "R13-WD",
      units: 10,
      isWithdrawn: true,
    });

    // Public offering rule: a product is offered only with a non-withdrawn,
    // in-stock lot.
    const usableForOffered = await db.lot.findFirst({
      where: { productId: offered.id, isWithdrawn: false, units: { gt: 0 } },
    });
    const usableForWithdrawn = await db.lot.findFirst({
      where: { productId: withdrawn.id, isWithdrawn: false, units: { gt: 0 } },
    });
    expect(usableForOffered).not.toBeNull();
    expect(usableForWithdrawn).toBeNull();
  });
});

describe("R14: historical orders remain intact after products/lots go inactive", () => {
  it("order item snapshots survive product + lot deactivation", async () => {
    const farm = await makeFarm(db, { slug: "farm-r14" });
    const product = await makeProduct(db, farm.id, {
      name: "Snapshot cut",
      basePriceCents: 1438,
    });
    await makeLot(db, farm.id, product.id, {
      reference: "R14-LOT",
      units: 10,
    });
    const cycle = await makeCycle(db, { freePlaces: 5 });

    const order = await db.order.create({
      data: {
        cycleId: cycle.id,
        lotReferenceSnapshot: "R14-LOT",
        subtotalCents: 1438,
        totalCents: 2038,
        items: {
          create: [
            {
              productId: product.id,
              nameSnapshot: "Snapshot cut",
              priceCentsSnapshot: 1438,
              lotReferenceSnapshot: "R14-LOT",
              quantity: 1,
            },
          ],
        },
      },
      include: { items: true },
    });

    // Product goes inactive and its name/price change; lot is withdrawn.
    await db.product.update({
      where: { id: product.id },
      data: { isActive: false, name: "RENAMED", basePriceCents: 9999 },
    });
    await db.lot.update({
      where: { reference: "R14-LOT" },
      data: { isWithdrawn: true },
    });

    const reloaded = await db.order.findUnique({
      where: { id: order.id },
      include: { items: true },
    });
    expect(reloaded?.items[0].nameSnapshot).toBe("Snapshot cut");
    expect(reloaded?.items[0].priceCentsSnapshot).toBe(1438);
    expect(reloaded?.items[0].lotReferenceSnapshot).toBe("R14-LOT");
    expect(reloaded?.lotReferenceSnapshot).toBe("R14-LOT");
  });
});

describe("R15: test flag excludes records from default metrics", () => {
  it("a test lot is filterable out of production queries", async () => {
    const farm = await makeFarm(db, { slug: "farm-r15" });
    const product = await makeProduct(db, farm.id);
    await makeLot(db, farm.id, product.id, {
      reference: "R15-PROD",
      isTest: false,
    });
    await makeLot(db, farm.id, product.id, {
      reference: "R15-TEST",
      isTest: true,
    });
    const productionLots = await db.lot.findMany({
      where: { productId: product.id, isTest: false },
    });
    const allLots = await db.lot.findMany({ where: { productId: product.id } });
    expect(allLots.length).toBe(2);
    expect(productionLots.length).toBe(1);
    expect(productionLots[0].reference).toBe("R15-PROD");
  });
});

describe("M8: a lot must be backed by a product or an offer", () => {
  it("DB CHECK rejects a lot with neither productId nor farmProductOfferId", async () => {
    // The M8 migration (20261115000000_m8_lot_backing_guard) adds a guarded
    // CHECK instead of a blanket NOT NULL: a lot with BOTH backing columns null
    // is rejected by the database. This proves the invariant is enforced by the
    // DB, not only by application code — it would fail if the migration/CHECK
    // were reverted.
    const farm = await makeFarm(db, { slug: "farm-m8-neither" });
    await expect(
      db.lot.create({
        data: {
          farmId: farm.id,
          // productId and farmProductOfferId intentionally omitted (both null).
          reference: "M8-NEITHER",
          units: 5,
          slaughterDate: new Date("2026-01-01"),
          cuttingDate: new Date("2026-01-02"),
          packingDate: new Date("2026-01-03"),
          expiryDate: new Date("2026-02-01"),
        },
      }),
    ).rejects.toThrow();
  });

  it("accepts a lot backed by a legacy product only (receipt-prefill path stays valid)", async () => {
    // Receipt ingestion pre-fills a legacy Product + Lot with a null offer; that
    // row is legitimate and must NOT be rejected (the guard is not a blanket
    // NOT NULL on farmProductOfferId).
    const farm = await makeFarm(db, { slug: "farm-m8-product" });
    const product = await makeProduct(db, farm.id);
    const lot = await makeLot(db, farm.id, product.id, { reference: "M8-PRODUCT" });
    expect(lot.farmProductOfferId).toBeNull();
    expect(lot.productId).toBe(product.id);
  });
});
