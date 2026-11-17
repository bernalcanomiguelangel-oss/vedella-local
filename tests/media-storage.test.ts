import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  selectMediaStorage,
  mediaStorageKind,
  isServerlessReadOnlyFs,
  isMediaStorageUnconfigured,
  LocalFilesystemStorage,
  VercelBlobStorage,
  MediaStorageUnavailableError,
} from "@/lib/media-storage";
import { validateImageUpload, uploadsDir } from "@/lib/media";

/**
 * Guards the FEAT-002 MediaStorage seam:
 *  - selectMediaStorage/mediaStorageKind pick local vs blob from the env token.
 *  - LocalFilesystemStorage round-trips a validated buffer OFFLINE and returns a
 *    "/uploads/..." ref (behavior unchanged when no token is set).
 *  - VercelBlobStorage LAZILY uses a MOCKED @vercel/blob so NO network is used;
 *    a put() failure propagates so the action can catch it (asserted in the
 *    manage-actions test).
 *
 * @vercel/blob is mocked here so importing the module never touches the network
 * and never needs a token.
 */

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
  del: vi.fn(),
}));

const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);

const written: string[] = [];
afterEach(async () => {
  const local = new LocalFilesystemStorage();
  for (const name of written.splice(0)) {
    await local.remove(name);
  }
  vi.clearAllMocks();
});

describe("selectMediaStorage / mediaStorageKind", () => {
  it("returns local storage when BLOB_READ_WRITE_TOKEN is absent/empty", () => {
    expect(mediaStorageKind({})).toBe("local");
    expect(mediaStorageKind({ BLOB_READ_WRITE_TOKEN: "" })).toBe("local");
    expect(selectMediaStorage({}).kind).toBe("local");
    expect(selectMediaStorage({}) instanceof LocalFilesystemStorage).toBe(true);
  });

  it("returns blob storage when BLOB_READ_WRITE_TOKEN is a non-empty string", () => {
    const env = { BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_fake_token" };
    expect(mediaStorageKind(env)).toBe("blob");
    expect(selectMediaStorage(env).kind).toBe("blob");
    expect(selectMediaStorage(env) instanceof VercelBlobStorage).toBe(true);
  });
});

describe("isServerlessReadOnlyFs / isMediaStorageUnconfigured", () => {
  it("is false in a plain (local/offline) env", () => {
    expect(isServerlessReadOnlyFs({})).toBe(false);
    expect(isMediaStorageUnconfigured({})).toBe(false);
  });

  it("detects a Vercel runtime from VERCEL or VERCEL_ENV", () => {
    expect(isServerlessReadOnlyFs({ VERCEL: "1" })).toBe(true);
    expect(isServerlessReadOnlyFs({ VERCEL_ENV: "production" })).toBe(true);
    expect(isServerlessReadOnlyFs({ VERCEL: "", VERCEL_ENV: "" })).toBe(false);
  });

  it("reports storage UNCONFIGURED only when serverless AND no Blob token", () => {
    // Serverless + no token -> unconfigured (the production crash scenario).
    expect(isMediaStorageUnconfigured({ VERCEL: "1" })).toBe(true);
    // Serverless + token -> configured (Blob is used).
    expect(
      isMediaStorageUnconfigured({ VERCEL: "1", BLOB_READ_WRITE_TOKEN: "t" }),
    ).toBe(false);
    // Not serverless -> local filesystem is fine, never "unconfigured".
    expect(isMediaStorageUnconfigured({})).toBe(false);
  });
});

describe("LocalFilesystemStorage on a serverless read-only FS", () => {
  afterEach(() => {
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
  });

  it("refuses the write with a typed, catchable error and NEVER mkdirs", async () => {
    const v = validateImageUpload(PNG_HEADER, "photo.png");
    expect(v.ok).toBe(true);
    if (!v.ok) return;

    // Simulate the Vercel runtime. The local write must not even attempt a
    // mkdir: it throws a typed MediaStorageUnavailableError the action catches.
    process.env.VERCEL = "1";
    const mkdirSpy = vi.spyOn(fs, "mkdir");

    const storage = new LocalFilesystemStorage();
    await expect(
      storage.put(v.storedFilename, PNG_HEADER, v.kind),
    ).rejects.toBeInstanceOf(MediaStorageUnavailableError);

    expect(mkdirSpy).not.toHaveBeenCalled();
    mkdirSpy.mockRestore();
  });
});

describe("LocalFilesystemStorage", () => {
  it("round-trips a validated buffer offline and returns a /uploads/ ref", async () => {
    const v = validateImageUpload(PNG_HEADER, "photo.png");
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    written.push(v.storedFilename);

    const storage = new LocalFilesystemStorage();
    const ref = await storage.put(v.storedFilename, PNG_HEADER, v.kind);
    expect(ref).toBe(v.storedPath);
    expect(ref.startsWith("/uploads/")).toBe(true);

    const abs = path.join(uploadsDir(), v.storedFilename);
    expect((await fs.readFile(abs)).equals(PNG_HEADER)).toBe(true);

    // remove accepts the returned "/uploads/<file>" ref and deletes the file.
    await storage.remove(ref);
    await expect(fs.access(abs)).rejects.toBeTruthy();
  });
});

describe("VercelBlobStorage (mocked @vercel/blob, no network)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("put returns the blob URL and never logs the token", async () => {
    const { put } = await import("@vercel/blob");
    (put as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      url: "https://abc123.public.blob.vercel-storage.com/photo.png",
    });

    const storage = new VercelBlobStorage("vercel_blob_rw_fake_token");
    const ref = await storage.put("photo.png", PNG_HEADER, "png");
    expect(ref).toBe("https://abc123.public.blob.vercel-storage.com/photo.png");
    expect(put).toHaveBeenCalledOnce();
    const call = (put as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toMatchObject({ access: "public", token: "vercel_blob_rw_fake_token" });
  });

  it("propagates a put() failure so the caller can handle it", async () => {
    const { put } = await import("@vercel/blob");
    (put as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("read-only filesystem / network error"),
    );
    const storage = new VercelBlobStorage("vercel_blob_rw_fake_token");
    await expect(storage.put("photo.png", PNG_HEADER, "png")).rejects.toThrow();
  });

  it("remove swallows del() failures (best-effort)", async () => {
    const { del } = await import("@vercel/blob");
    (del as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    const storage = new VercelBlobStorage("vercel_blob_rw_fake_token");
    await expect(
      storage.remove("https://abc123.public.blob.vercel-storage.com/photo.png"),
    ).resolves.toBeUndefined();
  });
});
