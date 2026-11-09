/**
 * Farm-to-farm isolation + the FEAT-004 permission matrix, exercised against a
 * real SQLite database through the pure management layer (src/lib/admin/manage).
 *
 * Covered:
 *  - Farm A manager cannot read or mutate Farm B's offers/lots/packs.
 *  - Farm A self-edit of OWN offer price + units applies LIVE with no review.
 *  - A Farm A new-offer / profile / certification edit lands in pending_review,
 *    not live.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb, type TestDb } from "../helpers/testDb";
import { makeFarm, makeDefinition, makeOffer, makeOfferLot } from "../helpers/fixtures";
import {
  type Actor,
  canActOnFarm,
  applyOfferSelfEdit,
  applyOfferCreate,
  applyProfileSubmitReview,
  applyProfileDirectEdit,
  applyCertSubmit,
  applyLotCreate,
} from "../../src/lib/admin/manage";
import { offerScopeWhere } from "../../src/lib/admin/data";

let tdb: TestDb;
let db: PrismaClient;

beforeAll(async () => {
  tdb = await createTestDb();
  db = tdb.prisma;
}, 60_000);

afterAll(async () => {
  await tdb.cleanup();
});

describe("farm-to-farm offer isolation", () => {
  it("Farm A manager cannot read Farm B's offers (scope where)", async () => {
    const farmA = await makeFarm(db, { slug: "iso-a-read" });
    const farmB = await makeFarm(db, { slug: "iso-b-read" });
    const def = await makeDefinition(db);
    await makeOffer(db, farmA.id, def.id, { publicName: "A entrecot" });
    const offerB = await makeOffer(db, farmB.id, def.id, { publicName: "B entrecot" });

    const managerA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };

    // The data-layer scope where() restricts a farm_manager to their own farm.
    const where = offerScopeWhere({
      id: managerA.id,
      email: "a@x",
      name: null,
      role: "farm_manager",
      farmId: farmA.id,
      mustChangePassword: false,
    });
    const visible = await db.farmProductOffer.findMany({ where });
    expect(visible.every((o) => o.farmId === farmA.id)).toBe(true);
    expect(visible.some((o) => o.id === offerB.id)).toBe(false);
    expect(canActOnFarm(managerA, farmB.id)).toBe(false);
  });

  it("Farm A manager cannot mutate Farm B's offer (self-edit rejected)", async () => {
    const farmA = await makeFarm(db, { slug: "iso-a-mut" });
    const farmB = await makeFarm(db, { slug: "iso-b-mut" });
    const def = await makeDefinition(db);
    const offerB = await makeOffer(db, farmB.id, def.id, { priceAmountCents: 1000 });

    const managerA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };
    const res = await applyOfferSelfEdit(db, managerA, offerB.id, {
      priceAmountCents: 1,
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("FORBIDDEN");

    const reloaded = await db.farmProductOffer.findUnique({ where: { id: offerB.id } });
    expect(reloaded?.priceAmountCents).toBe(1000); // unchanged
  });

  it("Farm A manager cannot create a lot against Farm B's offer", async () => {
    const farmA = await makeFarm(db, { slug: "iso-a-lot" });
    const farmB = await makeFarm(db, { slug: "iso-b-lot" });
    const def = await makeDefinition(db);
    const offerB = await makeOffer(db, farmB.id, def.id);

    const managerA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };
    const now = Date.now();
    const DAY = 86_400_000;
    const res = await applyLotCreate(db, managerA, {
      farmId: farmB.id, // not A's farm
      farmProductOfferId: offerB.id,
      reference: "ISO-LOT-X",
      units: 5,
      slaughterDate: new Date(now - 5 * DAY),
      cuttingDate: new Date(now - 4 * DAY),
      packingDate: new Date(now - 3 * DAY),
      expiryDate: new Date(now + 30 * DAY),
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("FORBIDDEN");
  });
});

describe("self-edit of own price + units is live and needs no review", () => {
  it("applies price + units immediately without changing lifecycle", async () => {
    const farmA = await makeFarm(db, { slug: "self-edit-a" });
    const def = await makeDefinition(db);
    const offer = await makeOffer(db, farmA.id, def.id, {
      priceAmountCents: 1438,
      isApproved: true,
      isActive: true,
      lifecycle: "active",
    });
    const lot = await makeOfferLot(db, farmA.id, offer.id, { units: 20 });

    const managerA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };
    const res = await applyOfferSelfEdit(db, managerA, offer.id, {
      priceAmountCents: 1599,
      availableUnits: 7,
    });
    expect(res.ok).toBe(true);

    const reloaded = await db.farmProductOffer.findUnique({ where: { id: offer.id } });
    expect(reloaded?.priceAmountCents).toBe(1599);
    // No review: stays approved + active.
    expect(reloaded?.lifecycle).toBe("active");
    expect(reloaded?.isActive).toBe(true);

    const reloadedLot = await db.lot.findUnique({ where: { id: lot.id } });
    expect(reloadedLot?.units).toBe(7);
  });
});

describe("any other change by a farm_manager lands in pending_review", () => {
  it("a new offer starts in pending_review (not live)", async () => {
    const farmA = await makeFarm(db, { slug: "new-offer-a" });
    const def = await makeDefinition(db, { isApproved: true });
    const managerA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };

    const res = await applyOfferCreate(db, managerA, {
      farmId: farmA.id,
      productDefinitionId: def.id,
      publicName: "Nou tall",
      priceAmountCents: 1200,
    });
    expect(res.ok).toBe(true);
    const offer = await db.farmProductOffer.findUnique({
      where: { id: res.offerId! },
    });
    expect(offer?.lifecycle).toBe("pending_review");
    expect(offer?.isApproved).toBe(false);
    expect(offer?.isActive).toBe(false);
  });

  it("farms CANNOT create a definition (no such path); offer needs an approved one", async () => {
    const farmA = await makeFarm(db, { slug: "no-def-a" });
    const def = await makeDefinition(db, { isApproved: false });
    const managerA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };
    const res = await applyOfferCreate(db, managerA, {
      farmId: farmA.id,
      productDefinitionId: def.id,
      publicName: "Tall sense definició",
      priceAmountCents: 1200,
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("DEFINITION_NOT_APPROVED");
  });

  it("a farm profile edit by a manager is SUBMITTED, not applied live", async () => {
    const farmA = await makeFarm(db, { slug: "profile-a", name: "Original Name" });
    const managerA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };
    const res = await applyProfileSubmitReview(db, managerA, farmA.id, {
      story: "Nova història proposada",
      breed: "Bruna",
    });
    expect(res.ok).toBe(true);

    // The farm row is UNCHANGED (edit is pending).
    const reloaded = await db.farm.findUnique({ where: { id: farmA.id } });
    expect(reloaded?.story).toBe("A test farm.");
    const edit = await db.farmProfileEdit.findUnique({ where: { id: res.editId! } });
    expect(edit?.status).toBe("pending_review");
  });

  it("a farm_manager can NEVER edit platform-only 'other information'", async () => {
    const farmA = await makeFarm(db, { slug: "other-info-a" });
    const managerA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };
    // Attempt to smuggle otherInformation via the review submission.
    const res = await applyProfileSubmitReview(db, managerA, farmA.id, {
      otherInformation: "secret",
    });
    // Nothing reviewable remains after the platform-only field is stripped.
    expect(res.ok).toBe(false);
    expect(res.code).toBe("NO_CHANGES");

    // A farm_manager cannot direct-edit either.
    const direct = await applyProfileDirectEdit(db, managerA, farmA.id, {
      otherInformation: "secret",
    });
    expect(direct.ok).toBe(false);
  });

  it("a certification is submitted as pending_review (never live)", async () => {
    const farmA = await makeFarm(db, { slug: "cert-a" });
    const managerA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };
    const res = await applyCertSubmit(db, managerA, {
      farmId: farmA.id,
      type: "organic",
      title: "Certificació ecològica",
      evidenceRef: "file://evidence.pdf",
    });
    expect(res.ok).toBe(true);
    const cert = await db.farmCertification.findUnique({ where: { id: res.certId! } });
    expect(cert?.status).toBe("pending_review");
  });
});
