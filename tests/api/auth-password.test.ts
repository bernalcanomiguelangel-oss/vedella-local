/**
 * Password-auth tests (FEAT-001, spec rule A + decision 8).
 *
 * Covers:
 *  - bcrypt hash round-trips; wrong password rejected; empty/short rejected by policy
 *  - a passwordless account cannot be logged into with any value
 *  - platform-admin-only user management: new users default to customer,
 *    non-platform-admin cannot create users, farm_manager requires a farm
 *  - passwords are stored ONLY as salted hashes (never plaintext), never returned
 *
 * DB-backed assertions use a real isolated SQLite db (tests/helpers/testDb.ts).
 * The server-action gate (requirePlatformAdmin) is mocked so the data behaviour
 * can be exercised without Next's request context.
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
import { makeFarm } from "../helpers/fixtures";
import {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  MIN_PASSWORD_LENGTH,
} from "../../src/lib/password";

let testDb: TestDb;
let db: PrismaClient;

// The user-management actions call requirePlatformAdmin (Next server-action
// primitive) and prisma via "@/lib/db". Point both at the test db and a
// controllable actor.
let currentActor: {
  id: string;
  email: string;
  name: string | null;
  role: string;
  farmId: string | null;
  mustChangePassword: boolean;
} | null = null;

vi.mock("@/lib/db", () => ({ get prisma() { return db; } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({
  requirePlatformAdmin: async () => {
    if (!currentActor || currentActor.role !== "platform_admin") {
      throw new Error("DENIED");
    }
    return currentActor;
  },
}));

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.prisma;
});

afterAll(async () => {
  await testDb.cleanup();
});

afterEach(() => {
  currentActor = null;
});

// --- password library -------------------------------------------------------

describe("password hashing + policy", () => {
  it("hash round-trips and rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).not.toContain("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong password!!", hash)).toBe(false);
  });

  it("produces a salted hash (two hashes of the same input differ)", async () => {
    const a = await hashPassword("same-input-123");
    const b = await hashPassword("same-input-123");
    expect(a).not.toEqual(b);
    expect(await verifyPassword("same-input-123", a)).toBe(true);
    expect(await verifyPassword("same-input-123", b)).toBe(true);
  });

  it("verify returns false for a missing/empty hash (passwordless accounts)", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
  });

  it("policy rejects empty and too-short passwords", () => {
    expect(validatePasswordPolicy("").ok).toBe(false);
    expect(validatePasswordPolicy("a".repeat(MIN_PASSWORD_LENGTH - 1)).ok).toBe(
      false,
    );
    expect(validatePasswordPolicy("a".repeat(MIN_PASSWORD_LENGTH)).ok).toBe(true);
  });
});

// --- platform-admin-only user management ------------------------------------

describe("user management (platform_admin only)", () => {
  it("creates a user defaulting to customer, with a hash (never plaintext) and mustChangePassword", async () => {
    currentActor = {
      id: "admin-1",
      email: "miguel@admin.com",
      name: "Miguel",
      role: "platform_admin",
      farmId: null,
      mustChangePassword: false,
    };
    const { createUser } = await import("../../src/lib/admin/users-actions");

    const res = await createUser({
      email: "New.Person@Example.com",
      name: "New Person",
      temporaryPassword: "temp-pass-123",
    });
    expect(res.ok).toBe(true);
    expect(res.userId).toBeTruthy();

    const row = await db.user.findUnique({ where: { id: res.userId! } });
    expect(row).not.toBeNull();
    // defaults to customer, never auto-admin
    expect(row!.role).toBe("customer");
    // email normalised to lower-case
    expect(row!.email).toBe("new.person@example.com");
    // stored only as a salted hash, never plaintext
    expect(row!.passwordHash).toBeTruthy();
    expect(row!.passwordHash).not.toContain("temp-pass-123");
    expect(await verifyPassword("temp-pass-123", row!.passwordHash)).toBe(true);
    // forced to change on first login
    expect(row!.mustChangePassword).toBe(true);
  });

  it("a non-platform-admin cannot create users", async () => {
    currentActor = {
      id: "mgr-1",
      email: "m@x",
      name: null,
      role: "farm_manager",
      farmId: "f1",
      mustChangePassword: false,
    };
    const { createUser } = await import("../../src/lib/admin/users-actions");
    await expect(
      createUser({ email: "x@y.com", temporaryPassword: "temp-pass-123" }),
    ).rejects.toThrow("DENIED");

    currentActor = null;
    await expect(
      createUser({ email: "z@y.com", temporaryPassword: "temp-pass-123" }),
    ).rejects.toThrow("DENIED");
  });

  it("assigning platform_admin is an explicit, audited action", async () => {
    currentActor = {
      id: "admin-1",
      email: "miguel@admin.com",
      name: "Miguel",
      role: "platform_admin",
      farmId: null,
      mustChangePassword: false,
    };
    const { createUser, assignRole } = await import(
      "../../src/lib/admin/users-actions"
    );
    const created = await createUser({
      email: "promote-me@example.com",
      temporaryPassword: "temp-pass-123",
    });
    expect(created.ok).toBe(true);

    const res = await assignRole(created.userId!, "platform_admin");
    expect(res.ok).toBe(true);

    const row = await db.user.findUnique({ where: { id: created.userId! } });
    expect(row!.role).toBe("platform_admin");

    const audit = await db.adminAudit.findFirst({
      where: { action: "assign_role", entityId: created.userId! },
    });
    expect(audit).not.toBeNull();
    expect(audit!.toState).toBe("platform_admin");
    expect(audit!.actorEmail).toBe("miguel@admin.com");
  });

  it("creating a farm_manager requires a valid, unclaimed farm", async () => {
    currentActor = {
      id: "admin-1",
      email: "miguel@admin.com",
      name: "Miguel",
      role: "platform_admin",
      farmId: null,
      mustChangePassword: false,
    };
    const { createUser } = await import("../../src/lib/admin/users-actions");

    // no farm -> rejected
    const noFarm = await createUser({
      email: "mgr-nofarm@example.com",
      role: "farm_manager",
      temporaryPassword: "temp-pass-123",
    });
    expect(noFarm.ok).toBe(false);
    expect(noFarm.code).toBe("FARM_REQUIRED");

    const farm = await makeFarm(db, { slug: "farm-for-mgr" });
    const ok = await createUser({
      email: "mgr-withfarm@example.com",
      role: "farm_manager",
      farmId: farm.id,
      temporaryPassword: "temp-pass-123",
    });
    expect(ok.ok).toBe(true);
    const row = await db.user.findUnique({ where: { id: ok.userId! } });
    expect(row!.role).toBe("farm_manager");
    expect(row!.farmId).toBe(farm.id);

    // a second manager for the same farm is rejected
    const dup = await createUser({
      email: "mgr-dup@example.com",
      role: "farm_manager",
      farmId: farm.id,
      temporaryPassword: "temp-pass-123",
    });
    expect(dup.ok).toBe(false);
    expect(dup.code).toBe("FARM_TAKEN");
  });
});
