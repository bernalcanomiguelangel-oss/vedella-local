import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  writeImageFile,
  deleteImageFile,
  uploadsDir,
  validateImageUpload,
} from "@/lib/media";

/**
 * Guards the local-upload filesystem seam (src/lib/media writeImageFile /
 * deleteImageFile). The cleanup helper is the orphaned-file remedy wired into
 * mediaUploadAction: when a DB apply fails AFTER the bytes were written, the
 * action calls deleteImageFile so the git-ignored uploads dir never accumulates
 * files that nothing references. These tests exercise the real fs round-trip.
 */

const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);

const written: string[] = [];

afterEach(async () => {
  // Defensive: remove anything a test wrote that it did not already delete.
  for (const name of written.splice(0)) {
    await deleteImageFile(name);
  }
});

describe("writeImageFile / deleteImageFile", () => {
  it("writes a validated buffer and then deletes it (round-trip)", async () => {
    const v = validateImageUpload(PNG_HEADER, "photo.png");
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    written.push(v.storedFilename);

    const publicPath = await writeImageFile(v.storedFilename, PNG_HEADER);
    expect(publicPath).toBe(v.storedPath);

    const abs = path.join(uploadsDir(), v.storedFilename);
    expect((await fs.readFile(abs)).equals(PNG_HEADER)).toBe(true);

    // Cleanup path (mirrors the action's failure branch): file is gone after.
    await deleteImageFile(v.storedFilename);
    await expect(fs.access(abs)).rejects.toBeTruthy();
  });

  it("deleteImageFile is a no-throw no-op for a missing file", async () => {
    const name = `${crypto.randomBytes(16).toString("hex")}.png`;
    // Never written; deleting it must not throw (best-effort cleanup).
    await expect(deleteImageFile(name)).resolves.toBeUndefined();
  });

  it("deleteImageFile refuses to touch paths outside the uploads dir", async () => {
    // A traversal-y name must be ignored, never unlinking anything outside.
    await expect(
      deleteImageFile("../../../etc/passwd"),
    ).resolves.toBeUndefined();
  });
});
