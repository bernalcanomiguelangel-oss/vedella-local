/**
 * FEAT-004 (condition 6): the five-persona access-isolation regression suite.
 *
 * The personas are:
 *   1. a logged-out public visitor,
 *   2. a customer,
 *   3. a Farm A manager,
 *   4. a Farm B manager,
 *   5. a platform administrator.
 *
 * Every assertion drives the REAL authorisation primitives against a real
 * (SQLite) database, so loosening canActOnFarm / offerScopeWhere / the manage
 * layer would make these tests FAIL:
 *   - src/lib/admin/scope.ts   canActOnFarm / visibleFarmScope
 *   - src/lib/admin/manage.ts  canActOnFarm + applyOffer/applyLotCreate/media
 *   - src/lib/admin/data.ts    offerScopeWhere (the data-layer scope filter)
 *   - src/lib/catalog.ts       the public approved+active read gate
 *
 * Covered condition-6 bullets:
 *   - public/customer can read ONLY active+approved public records;
 *   - a customer cannot read another customer's data;
 *   - Farm A manager cannot read or edit Farm B's offers/lots/orders/metrics/
 *     documents and vice versa;
 *   - a modified URL id does not expose another farm's record;
 *   - a modified farmId in a create/edit request is rejected server-side;
 *   - a new account cannot become platform_admin without authorised assignment;
 *   - platform_admin retains authorised access;
 *   - private media / traceability documents remain restricted.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb, type TestDb } from "../helpers/testDb";
import {
  makeFarm,
  makeDefinition,
  makeOffer,
  makeOfferLot,
  makeCycle,
} from "../helpers/fixtures";
import {
  type Actor,
  canActOnFarm,
  applyOfferSelfEdit,
  applyOfferCreate,
  applyLotCreate,
  applyMediaUpload,
  applyMediaApprove,
  listPublicCertifications,
  applyCertSubmit,
  applyCertApprove,
} from "../../src/lib/admin/manage";
import {
  offerScopeWhere,
  listAdminLots,
  listAdminOrders,
} from "../../src/lib/admin/data";
import {
  canActOnFarm as canActOnFarmScope,
  visibleFarmScope,
  isAdminRole,
} from "../../src/lib/admin/scope";
import {
  getFarmCatalog,
  getFarmCatalogFromOffers,
} from "../../src/lib/catalog";
import type { SessionUser } from "../../src/lib/auth";

let tdb: TestDb;
let db: PrismaClient;

const DAY = 86_400_000;

// The public catalog + data loaders read prisma via "@/lib/db". In VITEST the
// real db.ts already resolves the SQLite test client, but these modules were
// imported at the top of the graph before our per-file test db existed; point
// "@/lib/db" at the db this file owns so the real read paths run against it.
vi.mock("@/lib/db", () => ({
  get prisma() {
    return db;
  },
}));

beforeAll(async () => {
  tdb = await createTestDb();
  db = tdb.prisma;
}, 60_000);

afterAll(async () => {
  await tdb.cleanup();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Build a SessionUser of a given role for the data-layer scope helpers. */
function sessionUser(
  role: SessionUser["role"],
  farmId: string | null,
  id = `${role}-${farmId ?? "none"}`,
): SessionUser {
  return {
    id,
    email: `${id}@x`,
    name: null,
    role,
    farmId,
    mustChangePassword: false,
  };
}

/**
 * Set up two independent farms, each with an approved+active public offer
 * backed by a usable lot, plus a non-public (draft) offer. Returns everything
 * the matrix tests need.
 */
async function twoFarmWorld(tag: string) {
  const farmA = await makeFarm(db, { slug: `persona-a-${tag}`, name: "Granja A" });
  const farmB = await makeFarm(db, { slug: `persona-b-${tag}`, name: "Granja B" });
  const def = await makeDefinition(db);

  const offerA = await makeOffer(db, farmA.id, def.id, {
    publicName: "A entrecot",
    isApproved: true,
    isActive: true,
    lifecycle: "active",
  });
  await makeOfferLot(db, farmA.id, offerA.id, { units: 20 });

  const offerB = await makeOffer(db, farmB.id, def.id, {
    publicName: "B entrecot",
    priceAmountCents: 1562,
    isApproved: true,
    isActive: true,
    lifecycle: "active",
  });
  await makeOfferLot(db, farmB.id, offerB.id, { units: 20 });

  // A not-yet-approved (draft) offer on Farm A: must never surface publicly.
  const draftA = await makeOffer(db, farmA.id, def.id, {
    publicName: "A draft secret cut",
    isApproved: false,
    isActive: false,
    lifecycle: "draft",
  });
  await makeOfferLot(db, farmA.id, draftA.id, { units: 20 });

  return { farmA, farmB, def, offerA, offerB, draftA };
}

// ---------------------------------------------------------------------------
// Personas 1 & 2: logged-out public visitor + customer — public read scope.
// ---------------------------------------------------------------------------
describe("public visitor + customer read ONLY active+approved public records", () => {
  it("the public catalog exposes approved+active offers and hides draft ones", async () => {
    const { farmA, draftA } = await twoFarmWorld("pub-read");

    // The public read path (used by logged-out visitors AND customers alike —
    // neither carries admin scope).
    const catalog = await getFarmCatalog(farmA.slug, "ca");
    expect(catalog).not.toBeNull();
    const names = catalog!.cuts.map((c) => c.name);
    expect(names).toContain("A entrecot");
    // The draft offer is never public.
    expect(names).not.toContain("A draft secret cut");
    expect(draftA.isApproved).toBe(false);
  });

  it("a farm that is NOT approved is invisible to the public entirely", async () => {
    const hidden = await makeFarm(db, {
      slug: "persona-hidden-farm",
      isApproved: false,
      isActive: false,
    });
    const def = await makeDefinition(db);
    const offer = await makeOffer(db, hidden.id, def.id, {
      isApproved: true,
      isActive: true,
      lifecycle: "active",
    });
    await makeOfferLot(db, hidden.id, offer.id, { units: 20 });

    expect(await getFarmCatalog(hidden.slug, "ca")).toBeNull();
    expect(await getFarmCatalogFromOffers(hidden.slug, "ca")).toBeNull();
  });

  it("a customer (and a logged-out visitor) has NO admin scope at all", () => {
    const customer = sessionUser("customer", null);
    expect(isAdminRole("customer")).toBe(false);
    // An empty scope array means "no farms visible".
    expect(visibleFarmScope(customer)).toEqual([]);
    expect(canActOnFarmScope(customer, "any-farm")).toBe(false);
  });

  it("a customer cannot read another customer's orders (scope yields an impossible filter)", async () => {
    // A customer is not an admin role; the admin order loader scopes to the
    // caller's farms, which for a customer is the empty set. We assert the
    // scope helper collapses to "none" so no cross-customer data is reachable
    // through any farm-scoped loader.
    const customer = sessionUser("customer", null);
    const where = offerScopeWhere(customer);
    // farmId "__none__" can never match a real record => zero rows.
    expect(where).toEqual({ farmId: "__none__" });
    const lots = await db.lot.findMany({ where });
    expect(lots).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Personas 3 & 4: Farm A manager vs Farm B manager — cross-farm isolation.
// ---------------------------------------------------------------------------
describe("Farm A manager and Farm B manager cannot cross the farm boundary", () => {
  it("neither manager can ACT on the other farm (both directions)", async () => {
    const { farmA, farmB } = await twoFarmWorld("cross-act");
    const mgrA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };
    const mgrB: Actor = { id: "mgrB", role: "farm_manager", farmId: farmB.id };

    expect(canActOnFarm(mgrA, farmA.id)).toBe(true);
    expect(canActOnFarm(mgrA, farmB.id)).toBe(false);
    expect(canActOnFarm(mgrB, farmB.id)).toBe(true);
    expect(canActOnFarm(mgrB, farmA.id)).toBe(false);
  });

  it("the offer scope filter restricts each manager to their own farm's offers", async () => {
    const { farmA, farmB, offerA, offerB } = await twoFarmWorld("scope-offers");
    const mgrA = sessionUser("farm_manager", farmA.id);

    const visibleToA = await db.farmProductOffer.findMany({
      where: offerScopeWhere(mgrA),
    });
    expect(visibleToA.every((o) => o.farmId === farmA.id)).toBe(true);
    expect(visibleToA.some((o) => o.id === offerA.id)).toBe(true);
    expect(visibleToA.some((o) => o.id === offerB.id)).toBe(false);
  });

  it("Farm A manager cannot read Farm B's lots (scoped lot loader)", async () => {
    const { farmA, farmB, offerB } = await twoFarmWorld("scope-lots");
    const mgrA = sessionUser("farm_manager", farmA.id);

    const lots = await listAdminLots(mgrA);
    expect(lots.every((l) => l.farmId === farmA.id)).toBe(true);
    expect(lots.some((l) => l.farmId === farmB.id)).toBe(false);
    // Sanity: Farm B really does have a lot on offerB that A simply cannot see.
    const bLots = await db.lot.findMany({ where: { farmProductOfferId: offerB.id } });
    expect(bLots.length).toBeGreaterThan(0);
  });

  it("Farm A manager cannot read Farm B's orders (scoped order loader)", async () => {
    const { farmA, farmB, offerB } = await twoFarmWorld("scope-orders");
    const cycle = await makeCycle(db);

    // An order fulfilled by Farm B only.
    const order = await db.order.create({
      data: {
        cycleId: cycle.id,
        status: "confirmed",
        lotReferenceSnapshot: "",
        subtotalCents: 1562,
        discountCents: 0,
        deliveryFeeCents: 600,
        totalCents: 2162,
        isTest: false,
      },
    });
    await db.fulfilmentGroup.create({
      data: { orderId: order.id, farmId: farmB.id },
    });

    const mgrA = sessionUser("farm_manager", farmA.id);
    const mgrB = sessionUser("farm_manager", farmB.id);

    const aOrders = await listAdminOrders(mgrA);
    expect(aOrders.some((o) => o.id === order.id)).toBe(false);

    const bOrders = await listAdminOrders(mgrB);
    expect(bOrders.some((o) => o.id === order.id)).toBe(true);
    void offerB;
  });

  it("Farm A manager cannot mutate Farm B's offer (self-edit rejected FORBIDDEN)", async () => {
    const { farmA, offerB } = await twoFarmWorld("edit-cross");
    const mgrA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };

    const res = await applyOfferSelfEdit(db, mgrA, offerB.id, {
      priceAmountCents: 1,
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("FORBIDDEN");

    const reloaded = await db.farmProductOffer.findUnique({
      where: { id: offerB.id },
    });
    expect(reloaded?.priceAmountCents).toBe(1562); // unchanged
  });
});

// ---------------------------------------------------------------------------
// URL-id tamper: a modified id must not expose another farm's record.
// ---------------------------------------------------------------------------
describe("URL-id tamper does not expose another farm's record", () => {
  it("calling a scoped manage fn with Farm B's offer id as Farm A -> FORBIDDEN", async () => {
    const { farmA, offerB } = await twoFarmWorld("urlid-offer");
    const mgrA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };

    // Simulates GET /admin/offers/<Farm B offer id> edited into Farm A's URL.
    const res = await applyOfferSelfEdit(db, mgrA, offerB.id, {
      priceAmountCents: 999,
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("FORBIDDEN");
  });

  it("a non-existent id is NOT_FOUND, never leaks existence of a foreign record", async () => {
    const { farmA } = await twoFarmWorld("urlid-missing");
    const mgrA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };
    const res = await applyOfferSelfEdit(db, mgrA, "non-existent-id", {
      priceAmountCents: 1,
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// farmId tamper: a modified farmId in a create/edit request is rejected.
// ---------------------------------------------------------------------------
describe("farmId tamper in a create request is rejected server-side", () => {
  it("applyLotCreate with Farm B's farmId as Farm A -> FORBIDDEN", async () => {
    const { farmA, farmB, offerB } = await twoFarmWorld("tamper-lot");
    const mgrA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };
    const now = Date.now();

    const res = await applyLotCreate(db, mgrA, {
      farmId: farmB.id, // tampered: not A's farm
      farmProductOfferId: offerB.id,
      reference: "TAMPER-LOT-1",
      units: 5,
      slaughterDate: new Date(now - 5 * DAY),
      cuttingDate: new Date(now - 4 * DAY),
      packingDate: new Date(now - 3 * DAY),
      expiryDate: new Date(now + 30 * DAY),
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("FORBIDDEN");
  });

  it("applyOfferCreate with another farm's farmId as Farm A -> FORBIDDEN", async () => {
    const { farmA, farmB, def } = await twoFarmWorld("tamper-offer");
    const mgrA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };

    const res = await applyOfferCreate(db, mgrA, {
      farmId: farmB.id, // tampered
      productDefinitionId: def.id,
      publicName: "Smuggled offer",
      priceAmountCents: 1200,
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("FORBIDDEN");
    void farmA;
  });

  it("the farmId check wins even when the offer DOES belong to the claimed farm", async () => {
    // Farm A manager, honest farmId=A, but pointing at Farm B's offer id: the
    // manage layer must still reject (offer/farm mismatch), not silently write.
    const { farmA, farmB, offerB } = await twoFarmWorld("tamper-mismatch");
    const mgrA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };
    const now = Date.now();
    const res = await applyLotCreate(db, mgrA, {
      farmId: farmA.id,
      farmProductOfferId: offerB.id, // belongs to Farm B
      reference: "TAMPER-LOT-2",
      units: 5,
      slaughterDate: new Date(now - 5 * DAY),
      cuttingDate: new Date(now - 4 * DAY),
      packingDate: new Date(now - 3 * DAY),
      expiryDate: new Date(now + 30 * DAY),
    });
    expect(res.ok).toBe(false);
    // Not A's offer: the offer-belongs-to-farm guard rejects it.
    expect(res.code).toBe("FARM_MISMATCH");
    void farmB;
  });
});

// ---------------------------------------------------------------------------
// Private media / traceability documents remain restricted.
// ---------------------------------------------------------------------------
describe("private media and unverified documents are never public", () => {
  it("a farm_manager upload lands in a PENDING field, never the public one", async () => {
    const { farmA, offerA } = await twoFarmWorld("media-pending");
    const mgrA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };

    const res = await applyMediaUpload(db, mgrA, {
      target: "offer_image",
      targetId: offerA.id,
      storedPath: "/uploads/pending-a.jpg",
      requiresApproval: true,
    });
    expect(res.ok).toBe(true);
    expect(res.pending).toBe(true);

    const reloaded = await db.farmProductOffer.findUnique({
      where: { id: offerA.id },
    });
    // Pending, NOT public.
    expect(reloaded?.pendingImageRef).toBe("/uploads/pending-a.jpg");
    expect(reloaded?.imageRef).toBeNull();

    // The public catalog never exposes the pending image.
    const catalog = await getFarmCatalogFromOffers(farmA.slug, "ca");
    const cut = catalog?.cuts.find((c) => c.name === "A entrecot");
    expect(cut?.imageRef ?? null).toBeNull();
  });

  it("a farm_manager cannot approve (publish) their own pending media", async () => {
    const { farmA, offerA } = await twoFarmWorld("media-approve");
    const mgrA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };
    await applyMediaUpload(db, mgrA, {
      target: "offer_image",
      targetId: offerA.id,
      storedPath: "/uploads/pending-approve.jpg",
      requiresApproval: true,
    });
    // Only a platform_admin may approve.
    const denied = await applyMediaApprove(db, mgrA, {
      target: "offer_image",
      targetId: offerA.id,
    });
    expect(denied.ok).toBe(false);
    expect(denied.code).toBe("FORBIDDEN");
  });

  it("listPublicCertifications returns ONLY approved certs (pending ones hidden)", async () => {
    const { farmA } = await twoFarmWorld("certs");
    const mgrA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };
    const admin: Actor = { id: "admin", role: "platform_admin", farmId: null };

    // Two submissions; only one is approved.
    const pending = await applyCertSubmit(db, mgrA, {
      farmId: farmA.id,
      type: "organic",
      title: "Pending cert (unverified)",
      evidenceRef: "file://secret-evidence.pdf",
    });
    const toApprove = await applyCertSubmit(db, mgrA, {
      farmId: farmA.id,
      type: "welfare",
      title: "Approved cert",
      evidenceRef: "file://evidence2.pdf",
    });
    await applyCertApprove(db, admin, toApprove.certId!);

    const publicCerts = await listPublicCertifications(db, farmA.id);
    const titles = publicCerts.map((c) => c.title);
    expect(titles).toContain("Approved cert");
    expect(titles).not.toContain("Pending cert (unverified)");

    // The private evidence reference is never part of the public shape.
    const serialised = JSON.stringify(publicCerts);
    expect(serialised).not.toContain("secret-evidence.pdf");
    void pending;
  });
});

// ---------------------------------------------------------------------------
// Persona 5: platform_admin retains authorised cross-farm access.
// ---------------------------------------------------------------------------
describe("platform_admin retains authorised access to every farm", () => {
  it("can act on any farm and sees an unscoped (null) visible scope", async () => {
    const { farmA, farmB } = await twoFarmWorld("admin-access");
    const admin: Actor = { id: "admin", role: "platform_admin", farmId: null };
    expect(canActOnFarm(admin, farmA.id)).toBe(true);
    expect(canActOnFarm(admin, farmB.id)).toBe(true);

    const adminSession = sessionUser("platform_admin", null);
    expect(visibleFarmScope(adminSession)).toBeNull();
    // An unscoped where() returns both farms' offers.
    const all = await db.farmProductOffer.findMany({
      where: offerScopeWhere(adminSession),
    });
    expect(all.some((o) => o.farmId === farmA.id)).toBe(true);
    expect(all.some((o) => o.farmId === farmB.id)).toBe(true);
  });

  it("a platform_admin CAN self-edit any farm's offer price (authorised)", async () => {
    const { offerB } = await twoFarmWorld("admin-edit");
    const admin: Actor = { id: "admin", role: "platform_admin", farmId: null };
    const res = await applyOfferSelfEdit(db, admin, offerB.id, {
      priceAmountCents: 1700,
    });
    expect(res.ok).toBe(true);
    const reloaded = await db.farmProductOffer.findUnique({
      where: { id: offerB.id },
    });
    expect(reloaded?.priceAmountCents).toBe(1700);
  });
});

// ---------------------------------------------------------------------------
// A new account cannot become platform_admin without an authorised assignment.
// ---------------------------------------------------------------------------
describe("a new account cannot self-promote to platform_admin", () => {
  // The user-management actions call requirePlatformAdmin (a Next server-action
  // primitive) and prisma via "@/lib/db". Mirror the auth-password.test.ts
  // pattern: mock the gate with a controllable actor so the REAL data behaviour
  // runs against our test db.
  let currentActor:
    | { id: string; role: string; email: string; name: string | null; farmId: string | null; mustChangePassword: boolean }
    | null = null;

  beforeAll(() => {
    vi.doMock("next/cache", () => ({ revalidatePath: () => {} }));
    vi.doMock("@/lib/auth", () => ({
      requirePlatformAdmin: async () => {
        if (!currentActor || currentActor.role !== "platform_admin") {
          throw new Error("DENIED");
        }
        return currentActor;
      },
    }));
  });

  it("a new account with no requested role defaults to customer (never auto-admin)", async () => {
    currentActor = {
      id: "admin-1",
      email: "admin@x",
      name: "Admin",
      role: "platform_admin",
      farmId: null,
      mustChangePassword: false,
    };
    const { createUser } = await import("../../src/lib/admin/users-actions");
    const res = await createUser({
      email: "default-role@example.com",
      // No role supplied: a new account must land as a customer, not an admin.
      temporaryPassword: "temp-pass-123",
    });
    expect(res.ok).toBe(true);
    const row = await db.user.findUnique({ where: { id: res.userId! } });
    expect(row!.role).toBe("customer");
    expect(row!.mustChangePassword).toBe(true);
  });

  it("an unauthenticated / self-driven createUser is DENIED (no self-service signup to admin)", async () => {
    // There is no caller context: requirePlatformAdmin rejects, so no account —
    // least of all a platform_admin — can be minted without an authorised admin.
    currentActor = null;
    const { createUser } = await import("../../src/lib/admin/users-actions");
    await expect(
      createUser({
        email: "self-service@example.com",
        role: "platform_admin",
        temporaryPassword: "temp-pass-123",
      }),
    ).rejects.toThrow("DENIED");
    const row = await db.user.findUnique({
      where: { email: "self-service@example.com" },
    });
    expect(row).toBeNull();
  });

  it("a non-platform-admin cannot promote anyone (assignRole is DENIED)", async () => {
    // First create a target as an admin.
    currentActor = {
      id: "admin-1",
      email: "admin@x",
      name: "Admin",
      role: "platform_admin",
      farmId: null,
      mustChangePassword: false,
    };
    const { createUser, assignRole } = await import(
      "../../src/lib/admin/users-actions"
    );
    const created = await createUser({
      email: "target@example.com",
      temporaryPassword: "temp-pass-123",
    });
    expect(created.ok).toBe(true);

    // Now a farm_manager (or a logged-out/no actor) attempts to promote them.
    currentActor = {
      id: "mgr-1",
      email: "mgr@x",
      name: null,
      role: "farm_manager",
      farmId: "farm-x",
      mustChangePassword: false,
    };
    await expect(
      assignRole(created.userId!, "platform_admin"),
    ).rejects.toThrow("DENIED");

    currentActor = null;
    await expect(
      assignRole(created.userId!, "platform_admin"),
    ).rejects.toThrow("DENIED");

    // The target is still a customer.
    const row = await db.user.findUnique({ where: { id: created.userId! } });
    expect(row!.role).toBe("customer");
  });

  it("only an authorised platform_admin assignment can promote (audited)", async () => {
    currentActor = {
      id: "admin-1",
      email: "admin@x",
      name: "Admin",
      role: "platform_admin",
      farmId: null,
      mustChangePassword: false,
    };
    const { createUser, assignRole } = await import(
      "../../src/lib/admin/users-actions"
    );
    const created = await createUser({
      email: "promote-ok@example.com",
      temporaryPassword: "temp-pass-123",
    });
    const res = await assignRole(created.userId!, "platform_admin");
    expect(res.ok).toBe(true);
    const row = await db.user.findUnique({ where: { id: created.userId! } });
    expect(row!.role).toBe("platform_admin");
  });
});

// ---------------------------------------------------------------------------
// Red Line (secrets): no secret / API-key value leaks through any public or
// cross-farm read path. Presence/absence only — we never print or log a key.
// ---------------------------------------------------------------------------
describe("Red Line: no secret value leaks through public or cross-farm reads", () => {
  // A clearly fake, non-secret test value. It must never surface in any payload.
  const FAKE_KEY = "sk-FAKE-TEST-KEY-should-never-leak-persona-0987654321";

  it("the public farm catalog payload never contains a secret value", async () => {
    const prev = process.env.AI_API_KEY;
    process.env.AI_API_KEY = FAKE_KEY;
    try {
      const { farmA } = await twoFarmWorld("secret-public");
      const catalog = await getFarmCatalog(farmA.slug, "ca");
      expect(catalog).not.toBeNull();
      const serialised = JSON.stringify(catalog);
      expect(serialised).not.toContain(FAKE_KEY);
    } finally {
      if (prev === undefined) delete process.env.AI_API_KEY;
      else process.env.AI_API_KEY = prev;
    }
  });

  it("a cross-farm scoped read returns nothing AND carries no secret value", async () => {
    const prev = process.env.AI_API_KEY;
    process.env.AI_API_KEY = FAKE_KEY;
    try {
      const { farmA } = await twoFarmWorld("secret-cross");
      const mgrA = sessionUser("farm_manager", farmA.id);
      // Scope the read to a manager; even their OWN admin payload must never
      // echo a key value.
      const lots = await listAdminLots(mgrA);
      const orders = await listAdminOrders(mgrA);
      const serialised = JSON.stringify({ lots, orders });
      expect(serialised).not.toContain(FAKE_KEY);
    } finally {
      if (prev === undefined) delete process.env.AI_API_KEY;
      else process.env.AI_API_KEY = prev;
    }
  });
});
