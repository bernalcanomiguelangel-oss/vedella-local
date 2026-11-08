/**
 * Multi-farm pack dual-accept workflow (FEAT-004, decision 6).
 *
 * Covered:
 *  - A multi-farm pack cannot go live until BOTH participating farms accept.
 *  - A platform_admin cannot FORCE a farm's acceptance.
 *  - A single-farm pack publishes with all offers approved+active (no dual-accept).
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb, type TestDb } from "../helpers/testDb";
import { makeFarm, makeDefinition, makeOffer } from "../helpers/fixtures";
import {
  type Actor,
  applyPackCreate,
  applyPackAccept,
  applyPackPublish,
  evaluatePackPublishGate,
} from "../../src/lib/admin/manage";

let tdb: TestDb;
let db: PrismaClient;

const platform: Actor = { id: "plat", role: "platform_admin", farmId: null };

beforeAll(async () => {
  tdb = await createTestDb();
  db = tdb.prisma;
}, 60_000);

afterAll(async () => {
  await tdb.cleanup();
});

describe("multi-farm pack requires dual acceptance", () => {
  it("cannot go live until BOTH farms accept, then publishes", async () => {
    const farmA = await makeFarm(db, { slug: "mf-a" });
    const farmB = await makeFarm(db, { slug: "mf-b" });
    const def = await makeDefinition(db);
    const offerA = await makeOffer(db, farmA.id, def.id, {
      publicName: "A entrecot",
      isApproved: true,
      isActive: true,
    });
    const offerB = await makeOffer(db, farmB.id, def.id, {
      publicName: "B llom",
      isApproved: true,
      isActive: true,
    });

    const created = await applyPackCreate(db, platform, {
      publicName: "Pack dues granges",
      isMultiFarm: true,
      items: [
        { farmProductOfferId: offerA.id, quantity: 1 },
        { farmProductOfferId: offerB.id, quantity: 1 },
      ],
    });
    expect(created.ok).toBe(true);
    const packId = created.packId!;

    // Initially: both acceptances false -> cannot publish.
    let gate = await evaluatePackPublishGate(db, packId);
    expect(gate.participatingFarms).toBe(2);
    expect(gate.acceptedFarms).toBe(0);
    expect(gate.canPublish).toBe(false);
    expect(gate.reasons).toContain("awaiting_farm_acceptance");

    let publish = await applyPackPublish(db, platform, packId);
    expect(publish.ok).toBe(false);
    expect(publish.code).toBe("PUBLISH_BLOCKED");

    // Farm A accepts; still blocked (Farm B pending).
    const mgrA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };
    expect((await applyPackAccept(db, mgrA, packId, farmA.id)).ok).toBe(true);
    gate = await evaluatePackPublishGate(db, packId);
    expect(gate.acceptedFarms).toBe(1);
    expect(gate.canPublish).toBe(false);
    expect((await applyPackPublish(db, platform, packId)).ok).toBe(false);

    // Farm B accepts; now publishable.
    const mgrB: Actor = { id: "mgrB", role: "farm_manager", farmId: farmB.id };
    expect((await applyPackAccept(db, mgrB, packId, farmB.id)).ok).toBe(true);
    gate = await evaluatePackPublishGate(db, packId);
    expect(gate.acceptedFarms).toBe(2);
    expect(gate.canPublish).toBe(true);

    publish = await applyPackPublish(db, platform, packId);
    expect(publish.ok).toBe(true);
    const pack = await db.pack.findUnique({ where: { id: packId } });
    expect(pack?.isActive).toBe(true);
    expect(pack?.lifecycle).toBe("active");
  });

  it("platform_admin CANNOT force a farm's acceptance", async () => {
    const farmA = await makeFarm(db, { slug: "force-a" });
    const farmB = await makeFarm(db, { slug: "force-b" });
    const def = await makeDefinition(db);
    const offerA = await makeOffer(db, farmA.id, def.id, { publicName: "FA" });
    const offerB = await makeOffer(db, farmB.id, def.id, { publicName: "FB" });

    const created = await applyPackCreate(db, platform, {
      publicName: "Pack forçat",
      isMultiFarm: true,
      items: [
        { farmProductOfferId: offerA.id, quantity: 1 },
        { farmProductOfferId: offerB.id, quantity: 1 },
      ],
    });
    const packId = created.packId!;

    // Platform admin tries to accept on Farm B's behalf -> rejected.
    const res = await applyPackAccept(db, platform, packId, farmB.id);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("CANNOT_FORCE_ACCEPT");

    const acc = await db.packFarmAcceptance.findUnique({
      where: { packId_farmId: { packId, farmId: farmB.id } },
    });
    expect(acc?.accepted).toBe(false);
  });
});

describe("single-farm pack publishes without dual-accept", () => {
  it("publishes when offers are approved+active", async () => {
    const farmA = await makeFarm(db, { slug: "sf-a" });
    const def = await makeDefinition(db);
    const offer1 = await makeOffer(db, farmA.id, def.id, {
      publicName: "SF1",
      isApproved: true,
      isActive: true,
    });
    const offer2 = await makeOffer(db, farmA.id, def.id, {
      publicName: "SF2",
      isApproved: true,
      isActive: true,
    });

    const created = await applyPackCreate(db, platform, {
      publicName: "Pack una granja",
      isMultiFarm: false,
      farmId: farmA.id,
      items: [
        { farmProductOfferId: offer1.id, quantity: 1 },
        { farmProductOfferId: offer2.id, quantity: 2 },
      ],
    });
    const packId = created.packId!;

    const gate = await evaluatePackPublishGate(db, packId);
    expect(gate.canPublish).toBe(true);
    const publish = await applyPackPublish(db, platform, packId);
    expect(publish.ok).toBe(true);
  });

  it("single-farm pack is blocked when an offer is not approved+active", async () => {
    const farmA = await makeFarm(db, { slug: "sf-blocked" });
    const def = await makeDefinition(db);
    const offer1 = await makeOffer(db, farmA.id, def.id, {
      publicName: "SB1",
      isApproved: true,
      isActive: true,
    });
    const offer2 = await makeOffer(db, farmA.id, def.id, {
      publicName: "SB2",
      isApproved: false,
      isActive: false,
      lifecycle: "pending_review",
    });
    const created = await applyPackCreate(db, platform, {
      publicName: "Pack bloquejat",
      isMultiFarm: false,
      farmId: farmA.id,
      items: [
        { farmProductOfferId: offer1.id, quantity: 1 },
        { farmProductOfferId: offer2.id, quantity: 1 },
      ],
    });
    const gate = await evaluatePackPublishGate(db, created.packId!);
    expect(gate.canPublish).toBe(false);
    expect(gate.reasons).toContain("offers_not_approved_active");
  });
});
