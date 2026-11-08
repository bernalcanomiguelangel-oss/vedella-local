/**
 * FEAT-006 incidents: farm-scope isolation + the high-severity lot remediation
 * (withdraw lot + list affected unfulfilled orders).
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb, type TestDb } from "../helpers/testDb";
import {
  makeFarm,
  makeCycle,
  makeDefinition,
  makeOffer,
  makeOfferLot,
} from "../helpers/fixtures";
import {
  createIncident,
  listIncidents,
  withdrawLotForIncident,
  listAffectedUnfulfilledOrders,
} from "../../src/lib/admin/incidents";
import type { ScopedUser } from "../../src/lib/admin/scope";

let tdb: TestDb;
let db: PrismaClient;

beforeAll(async () => {
  tdb = await createTestDb();
  db = tdb.prisma;
}, 60_000);

afterAll(async () => {
  await tdb.cleanup();
});

const platform: ScopedUser = { role: "platform_admin", farmId: null };

// A lot must be backed by a product or an offer (M8 Lot_backed_by_product_or_offer
// CHECK). Incident lots belong to a farm's offer, so back each test lot with a
// real FarmProductOffer for that farm.
async function makeIncidentLot(
  farmId: string,
  overrides: { reference: string; units: number; isWithdrawn?: boolean },
) {
  const def = await makeDefinition(db);
  const offer = await makeOffer(db, farmId, def.id);
  return makeOfferLot(db, farmId, offer.id, overrides);
}

describe("incident farm scope", () => {
  it("a farm_manager sees only their own farm's incidents", async () => {
    const farmA = await makeFarm(db, { slug: "scope-a", name: "Farm A" });
    const farmB = await makeFarm(db, { slug: "scope-b", name: "Farm B" });
    const mgrA: ScopedUser = { role: "farm_manager", farmId: farmA.id };

    await createIncident(db, platform, {
      reference: "INC-A1",
      category: "quality",
      severity: "low",
      description: "A1",
      farmId: farmA.id,
    });
    await createIncident(db, platform, {
      reference: "INC-B1",
      category: "quality",
      severity: "low",
      description: "B1",
      farmId: farmB.id,
    });

    const seenByA = await listIncidents(db, mgrA);
    expect(seenByA.map((i) => i.reference)).toEqual(["INC-A1"]);

    const seenByPlatform = await listIncidents(db, platform);
    expect(seenByPlatform.map((i) => i.reference).sort()).toContain("INC-B1");
  });

  it("a farm_manager cannot file an incident against another farm", async () => {
    const farmA = await makeFarm(db, { slug: "scope-c", name: "Farm C" });
    const farmB = await makeFarm(db, { slug: "scope-d", name: "Farm D" });
    const mgrA: ScopedUser = { role: "farm_manager", farmId: farmA.id };

    const res = await createIncident(db, mgrA, {
      reference: "INC-CROSS",
      category: "quality",
      severity: "low",
      description: "cross",
      farmId: farmB.id,
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("FORBIDDEN");
  });

  it("a farm_manager cannot withdraw a lot for another farm's incident", async () => {
    const farmA = await makeFarm(db, { slug: "scope-e", name: "Farm E" });
    const farmB = await makeFarm(db, { slug: "scope-f", name: "Farm F" });
    const mgrA: ScopedUser = { role: "farm_manager", farmId: farmA.id };

    const lotB = await makeIncidentLot(farmB.id, { reference: "LOT-SCOPE-B", units: 5 });
    const inc = await createIncident(db, platform, {
      reference: "INC-SCOPE-B",
      category: "lot",
      severity: "critical",
      description: "bad lot",
      farmId: farmB.id,
      lotId: lotB.id,
    });
    const res = await withdrawLotForIncident(db, mgrA, inc.id!);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("FORBIDDEN");
  });
});

describe("high-severity lot incident remediation", () => {
  it("withdraws the lot and lists affected unfulfilled orders", async () => {
    const farm = await makeFarm(db, { slug: "remed", name: "Remediation Farm" });
    const cycle = await makeCycle(db);

    const lot = await makeIncidentLot(farm.id, { reference: "LOT-REMED-1", units: 10 });

    // Two orders carry an item from this lot: one unfulfilled, one fulfilled.
    const unfulfilled = await db.order.create({
      data: {
        cycleId: cycle.id,
        status: "confirmed",
        lotReferenceSnapshot: lot.reference,
      },
    });
    await db.orderItem.create({
      data: {
        orderId: unfulfilled.id,
        nameSnapshot: "Entrecot",
        priceCentsSnapshot: 1438,
        lotReferenceSnapshot: lot.reference,
        quantity: 2,
      },
    });

    const fulfilled = await db.order.create({
      data: {
        cycleId: cycle.id,
        status: "fulfilled",
        lotReferenceSnapshot: lot.reference,
      },
    });
    await db.orderItem.create({
      data: {
        orderId: fulfilled.id,
        nameSnapshot: "Entrecot",
        priceCentsSnapshot: 1438,
        lotReferenceSnapshot: lot.reference,
        quantity: 1,
      },
    });

    const inc = await createIncident(db, platform, {
      reference: "INC-REMED-1",
      category: "lot",
      severity: "high",
      description: "contamination",
      farmId: farm.id,
      lotId: lot.id,
    });
    expect(inc.ok).toBe(true);

    // The list flags the incident as withdrawable.
    const list = await listIncidents(db, platform);
    const row = list.find((i) => i.reference === "INC-REMED-1");
    expect(row?.canWithdrawLot).toBe(true);

    const res = await withdrawLotForIncident(db, platform, inc.id!);
    expect(res.ok).toBe(true);

    // Lot is withdrawn.
    const after = await db.lot.findUnique({ where: { id: lot.id } });
    expect(after?.isWithdrawn).toBe(true);

    // Only the UNFULFILLED order is reported as affected.
    expect(res.affectedOrders).toHaveLength(1);
    expect(res.affectedOrders?.[0].orderId).toBe(unfulfilled.id);
    expect(res.affectedOrders?.[0].quantity).toBe(2);
  });

  it("refuses withdrawal for a low-severity or non-lot incident", async () => {
    const farm = await makeFarm(db, { slug: "remed2", name: "Remediation Farm 2" });
    const lot = await makeIncidentLot(farm.id, { reference: "LOT-REMED-2", units: 3 });

    const lowSev = await createIncident(db, platform, {
      reference: "INC-LOW",
      category: "lot",
      severity: "low",
      description: "minor",
      farmId: farm.id,
      lotId: lot.id,
    });
    const r1 = await withdrawLotForIncident(db, platform, lowSev.id!);
    expect(r1.ok).toBe(false);
    expect(r1.code).toBe("NOT_HIGH_SEVERITY");

    const noLot = await createIncident(db, platform, {
      reference: "INC-NOLOT",
      category: "complaint",
      severity: "high",
      description: "no lot",
      farmId: farm.id,
    });
    const r2 = await withdrawLotForIncident(db, platform, noLot.id!);
    expect(r2.ok).toBe(false);
    expect(r2.code).toBe("NO_LOT");
  });

  it("listAffectedUnfulfilledOrders returns empty for an unknown lot", async () => {
    const res = await listAffectedUnfulfilledOrders(db, "no-such-lot");
    expect(res).toEqual([]);
  });
});
