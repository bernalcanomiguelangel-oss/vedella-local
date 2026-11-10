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
import { createTestDb, type TestDb } from "./helpers/testDb";
import { makeFarm, makeDefinition, makeOffer } from "./helpers/fixtures";

/**
 * FEAT-002 fail-graceful guarantee for mediaUploadAction.
 *
 * The user-reported bug: on Vercel the serverless FS rejects the upload write
 * and (when it propagated out of the action) crashed the admin/farm page. This
 * test proves the action CATCHES a storage failure and returns a handled
 * { ok:false, code:'STORAGE_ERROR' } WITHOUT throwing.
 *
 * @vercel/blob is mocked so NO network is used; we force BLOB_READ_WRITE_TOKEN so
 * the action selects VercelBlobStorage, whose mocked put() rejects.
 */

// A valid PNG header so validateImageUpload passes (extension + magic bytes).
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const PNG_BASE64 = PNG_HEADER.toString("base64");

let testDb: TestDb;
let db: PrismaClient;

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
  requireAdmin: async () => {
    if (!currentActor) throw new Error("DENIED");
    return currentActor;
  },
  requirePlatformAdmin: async () => {
    if (!currentActor || currentActor.role !== "platform_admin") throw new Error("DENIED");
    return currentActor;
  },
}));
// Keep the audit writer out of the picture (it would hit a different db path).
vi.mock("@/lib/admin/audit", () => ({ recordAdminAudit: async () => {} }));

// Mock @vercel/blob so the lazy import inside VercelBlobStorage resolves without
// a network call. put rejects to simulate a storage failure on Vercel.
const blobPut = vi.fn();
const blobDel = vi.fn();
vi.mock("@vercel/blob", () => ({
  put: (...args: unknown[]) => blobPut(...args),
  del: (...args: unknown[]) => blobDel(...args),
}));

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.prisma;
});

afterAll(async () => {
  await testDb.cleanup();
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

afterEach(() => {
  currentActor = null;
  vi.clearAllMocks();
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

describe("mediaUploadAction fails gracefully on storage error", () => {
  it("returns { ok:false, code:'STORAGE_ERROR' } and does NOT throw when Blob put rejects", async () => {
    const farm = await makeFarm(db);
    const def = await makeDefinition(db);
    const offer = await makeOffer(db, farm.id, def.id);

    currentActor = {
      id: "admin-1",
      email: "admin@example.com",
      name: "Admin",
      role: "platform_admin",
      farmId: null,
      mustChangePassword: false,
    };

    // Force the Blob backend, then make its put reject (read-only FS / network).
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_fake_token";
    blobPut.mockRejectedValue(new Error("read-only filesystem"));
    blobDel.mockResolvedValue(undefined);

    const { mediaUploadAction } = await import("@/lib/admin/manage-actions");

    // The key assertion: the promise RESOLVES (no throw) with a handled error.
    let res: Awaited<ReturnType<typeof mediaUploadAction>> | undefined;
    await expect(
      (async () => {
        res = await mediaUploadAction({
          target: "offer_image",
          targetId: offer.id,
          fileBase64: PNG_BASE64,
          originalName: "photo.png",
        });
      })(),
    ).resolves.toBeUndefined();

    expect(res).toBeDefined();
    expect(res!.ok).toBe(false);
    expect(res!.code).toBe("STORAGE_ERROR");
    expect(typeof res!.message).toBe("string");

    // The DB offer must NOT have been assigned any image ref.
    const fresh = await db.farmProductOffer.findUnique({ where: { id: offer.id } });
    expect(fresh?.imageRef ?? null).toBeNull();
    expect(fresh?.pendingImageRef ?? null).toBeNull();
  });
});
