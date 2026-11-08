/**
 * Integration tests for the admin core operations against a real SQLite db.
 * These verify the state-changing behaviour behind the server actions:
 *  - lifecycle transitions follow the machine and keep approval separate from active
 *  - approving a machine translation makes it publishable (status 'approved')
 *  - rejecting a translation removes it from the publishable set
 *  - receipt-driven creation goes through validateLot and lands in pending_review
 *    (never approved/active), and a bad lot creates NO orphan product
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb, type TestDb } from "../helpers/testDb";
import { makeFarm, makeProduct } from "../helpers/fixtures";
import {
  applyLifecycleTransition,
  applyApproveTranslation,
  applyRejectTranslation,
  applyCreateFromReceipt,
  type ReceiptCreateInput,
} from "../../src/lib/admin/core";

let testDb: TestDb;
let db: PrismaClient;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.prisma;
});

afterAll(async () => {
  await testDb.cleanup();
});

const DAY = 24 * 60 * 60 * 1000;
function receiptDates() {
  const now = Date.now();
  return {
    slaughterDate: new Date(now - 25 * DAY).toISOString(),
    cuttingDate: new Date(now - 23 * DAY).toISOString(),
    packingDate: new Date(now - 22 * DAY).toISOString(),
    expiryDate: new Date(now + 20 * DAY).toISOString(),
  };
}

describe("lifecycle transitions (core)", () => {
  it("pending_review -> approved sets isApproved but NOT isActive", async () => {
    const farm = await makeFarm(db);
    const product = await makeProduct(db, farm.id, {
      name: "Pending cut",
      isApproved: false,
      isActive: false,
    });
    await db.product.update({
      where: { id: product.id },
      data: { lifecycle: "pending_review" },
    });

    const res = await applyLifecycleTransition(db, "product", product.id, "approved");
    expect(res.ok).toBe(true);

    const after = await db.product.findUnique({ where: { id: product.id } });
    expect(after?.lifecycle).toBe("approved");
    expect(after?.isApproved).toBe(true);
    expect(after?.isActive).toBe(false); // approved is NOT active
  });

  it("approved -> active publishes it (isActive true)", async () => {
    const farm = await makeFarm(db);
    const product = await makeProduct(db, farm.id, {
      isApproved: true,
      isActive: false,
    });
    await db.product.update({
      where: { id: product.id },
      data: { lifecycle: "approved", isApproved: true, isActive: false },
    });

    const res = await applyLifecycleTransition(db, "product", product.id, "active");
    expect(res.ok).toBe(true);
    const after = await db.product.findUnique({ where: { id: product.id } });
    expect(after?.isApproved).toBe(true);
    expect(after?.isActive).toBe(true);
  });

  it("rejects an illegal jump (pending_review -> active)", async () => {
    const farm = await makeFarm(db);
    const product = await makeProduct(db, farm.id, {
      isApproved: false,
      isActive: false,
    });
    await db.product.update({
      where: { id: product.id },
      data: { lifecycle: "pending_review" },
    });
    const res = await applyLifecycleTransition(db, "product", product.id, "active");
    expect(res.ok).toBe(false);
    expect(res.code).toBe("ILLEGAL_TRANSITION");
    // Unchanged.
    const after = await db.product.findUnique({ where: { id: product.id } });
    expect(after?.lifecycle).toBe("pending_review");
    expect(after?.isActive).toBe(false);
  });
});

describe("translation approval (core)", () => {
  it("approving a machine translation makes it publishable (status approved)", async () => {
    const farm = await makeFarm(db);
    const product = await makeProduct(db, farm.id, { name: "Entrecot" });
    const tr = await db.translation.create({
      data: {
        entityType: "product",
        entityId: product.id,
        field: "name",
        locale: "en",
        text: "[EN] Ribeye steak",
        status: "machine",
        source: "mock",
      },
    });

    const res = await applyApproveTranslation(db, tr.id);
    expect(res.ok).toBe(true);
    const after = await db.translation.findUnique({ where: { id: tr.id } });
    expect(after?.status).toBe("approved");
  });

  it("editing then approving stores the human-corrected text", async () => {
    const farm = await makeFarm(db);
    const product = await makeProduct(db, farm.id, { name: "Galta" });
    const tr = await db.translation.create({
      data: {
        entityType: "product",
        entityId: product.id,
        field: "name",
        locale: "es",
        text: "[ES] Carrillera",
        status: "machine",
        source: "mock",
      },
    });
    const res = await applyApproveTranslation(db, tr.id, "Carrillera de ternera");
    expect(res.ok).toBe(true);
    const after = await db.translation.findUnique({ where: { id: tr.id } });
    expect(after?.status).toBe("approved");
    expect(after?.text).toBe("Carrillera de ternera");
  });

  it("rejecting a translation removes it entirely", async () => {
    const farm = await makeFarm(db);
    const product = await makeProduct(db, farm.id, { name: "Llom baix" });
    const tr = await db.translation.create({
      data: {
        entityType: "product",
        entityId: product.id,
        field: "name",
        locale: "en",
        text: "[EN] Striploin",
        status: "machine",
        source: "mock",
      },
    });
    const res = await applyRejectTranslation(db, tr.id);
    expect(res.ok).toBe(true);
    const after = await db.translation.findUnique({ where: { id: tr.id } });
    expect(after).toBeNull();
  });
});

describe("receipt-driven creation (core)", () => {
  it("creates a product + lot in pending_review (never approved/active)", async () => {
    const farm = await makeFarm(db);
    const input: ReceiptCreateInput = {
      farmId: farm.id,
      productName: "Secret de vedella",
      productKind: "cut",
      basePriceCents: 1320, // entered by a human
      lotReference: `RCPT-${Math.random().toString(36).slice(2, 8)}`,
      units: 12,
      ...receiptDates(),
    };
    const res = await applyCreateFromReceipt(db, input);
    expect(res.ok).toBe(true);
    const product = await db.product.findUnique({ where: { id: res.productId! } });
    expect(product?.lifecycle).toBe("pending_review");
    expect(product?.isApproved).toBe(false);
    expect(product?.isActive).toBe(false);
    const lot = await db.lot.findUnique({ where: { id: res.lotId! } });
    expect(lot?.reference).toBe(input.lotReference);
    expect(lot?.farmId).toBe(farm.id);
  });

  it("rejects a bad lot (date order) and leaves NO orphan product", async () => {
    const farm = await makeFarm(db);
    const countBefore = await db.product.count({ where: { farmId: farm.id } });
    const now = Date.now();
    const input: ReceiptCreateInput = {
      farmId: farm.id,
      productName: "Bad lot cut",
      productKind: "cut",
      basePriceCents: 1000,
      lotReference: `BAD-${Math.random().toString(36).slice(2, 8)}`,
      units: 5,
      // packing AFTER expiry -> invalid ordering
      slaughterDate: new Date(now - 5 * DAY).toISOString(),
      cuttingDate: new Date(now - 4 * DAY).toISOString(),
      packingDate: new Date(now + 10 * DAY).toISOString(),
      expiryDate: new Date(now + 5 * DAY).toISOString(),
    };
    const res = await applyCreateFromReceipt(db, input);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("BAD_DATE_ORDER");
    const countAfter = await db.product.count({ where: { farmId: farm.id } });
    expect(countAfter).toBe(countBefore); // product rolled back
  });

  it("rejects a negative price (AI can't set prices; human must enter valid one)", async () => {
    const farm = await makeFarm(db);
    const res = await applyCreateFromReceipt(db, {
      farmId: farm.id,
      productName: "No price",
      productKind: "cut",
      basePriceCents: -1,
      lotReference: `NP-${Math.random().toString(36).slice(2, 8)}`,
      units: 5,
      ...receiptDates(),
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("BAD_PRICE");
  });
});
