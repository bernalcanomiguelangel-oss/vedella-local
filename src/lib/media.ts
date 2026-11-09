/**
 * Local media (image) handling for farm-uploaded photos.
 *
 * SCOPE & TRUST MODEL
 * -------------------
 * Farm managers upload images for their own product OFFERS and their FARM
 * PROFILE (hero + gallery). Every uploaded file is treated as UNTRUSTED:
 *  - We NEVER trust the client-supplied Content-Type alone.
 *  - We validate by BOTH file extension AND magic-byte sniffing of the buffer
 *    header (implemented by hand below; no external dependency).
 *  - We enforce a maximum size and allow ONLY jpg/jpeg/png/webp.
 *  - The stored filename is randomised and sanitised (no path separators, no
 *    "..", safe extension only) so a malicious filename can never escape the
 *    uploads directory.
 *  - Files are written to a git-ignored directory under /public, served as
 *    static assets. The DB stores ONLY the relative path string, never bytes.
 *  - File CONTENTS are never logged.
 *
 * APPROVAL MODEL
 * --------------
 * Farm media follows the SAME approval rule as certifications and profile
 * edits: an upload is SUBMITTED (written to a pending* field) and is only made
 * public after a platform_admin approves it (moved to the public field). This
 * is governed by the SINGLE switch MEDIA_REQUIRES_APPROVAL below; flipping it
 * to `false` is the one-line change that makes uploads publish immediately.
 *
 * AI never touches any of this.
 */
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

/**
 * THE SINGLE MEDIA-APPROVAL SWITCH.
 *
 * When `true` (the default), farm-uploaded media is written to the pending*
 * fields and only copied to the public fields when a platform_admin approves
 * it. When `false`, farm uploads write straight to the public field (no review).
 *
 * This is the ONLY place the policy lives: all upload/approval logic reads this
 * constant, so flipping to auto-publish is a one-line change here.
 */
export const MEDIA_REQUIRES_APPROVAL = true;

/** Maximum accepted upload size in bytes (5 MB). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Allowed image kinds. These are the ONLY types ever accepted. */
export type ImageKind = "jpeg" | "png" | "webp";

/** Allowed lowercase file extensions mapped to their canonical kind. */
const EXTENSION_KIND: Record<string, ImageKind> = {
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".png": "png",
  ".webp": "webp",
};

/** Canonical stored extension per kind (we always normalise jpg -> .jpg). */
const KIND_EXTENSION: Record<ImageKind, string> = {
  jpeg: ".jpg",
  png: ".png",
  webp: ".webp",
};

/**
 * Relative (public) base path where uploaded images are stored and served.
 * This directory is git-ignored (see .gitignore) and created on demand.
 */
export const UPLOADS_PUBLIC_PREFIX = "/uploads";

/** Absolute filesystem directory backing UPLOADS_PUBLIC_PREFIX. */
export function uploadsDir(): string {
  return path.join(process.cwd(), "public", "uploads");
}

export interface ValidatedImage {
  kind: ImageKind;
  /** Randomised, sanitised filename (e.g. "a1b2c3d4e5f6.jpg"). */
  storedFilename: string;
  /** Public relative path to persist in the DB (e.g. "/uploads/<file>.jpg"). */
  storedPath: string;
  bytes: number;
}

export interface MediaValidationError {
  ok: false;
  code:
    | "EMPTY"
    | "TOO_LARGE"
    | "BAD_EXTENSION"
    | "BAD_MAGIC"
    | "EXTENSION_MAGIC_MISMATCH";
  message: string;
}

export type MediaValidationResult =
  | ({ ok: true } & ValidatedImage)
  | MediaValidationError;

/**
 * Sniff the image kind from the buffer's magic bytes. Returns null when the
 * header matches none of the allowed formats. NEVER trusts any external label.
 *
 *  - JPEG: FF D8 FF
 *  - PNG:  89 50 4E 47 0D 0A 1A 0A
 *  - WEBP: "RIFF" .... "WEBP" (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
 */
export function sniffImageKind(buf: Buffer): ImageKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "png";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/**
 * Derive the lowercase extension from an (untrusted) original filename. Strips
 * any directory components first so "../../etc/passwd.png" yields only ".png".
 */
function safeExtensionOf(originalName: string): string {
  // Strip every path separator variant and any leading dots so a traversal
  // attempt ("../..") can never influence the extension or path.
  const base = originalName.replace(/\\/g, "/").split("/").pop() ?? "";
  return path.extname(base).toLowerCase();
}

/**
 * Validate an uploaded image buffer against extension + magic bytes + size, and
 * produce a randomised, sanitised stored filename. Pure and fully testable: it
 * does NOT write anything to disk.
 *
 * `originalName` is the UNTRUSTED client filename (used only to read a declared
 * extension that must agree with the sniffed bytes). We never reuse it on disk.
 */
export function validateImageUpload(
  buf: Buffer,
  originalName: string,
): MediaValidationResult {
  if (!buf || buf.length === 0) {
    return { ok: false, code: "EMPTY", message: "Empty file." };
  }
  if (buf.length > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      code: "TOO_LARGE",
      message: `File exceeds ${MAX_IMAGE_BYTES} bytes.`,
    };
  }

  const ext = safeExtensionOf(originalName);
  const extKind = EXTENSION_KIND[ext];
  if (!extKind) {
    return {
      ok: false,
      code: "BAD_EXTENSION",
      message: "Only .jpg, .jpeg, .png and .webp are allowed.",
    };
  }

  const sniffed = sniffImageKind(buf);
  if (!sniffed) {
    return {
      ok: false,
      code: "BAD_MAGIC",
      message: "File content is not a supported image (jpg/png/webp).",
    };
  }
  if (sniffed !== extKind) {
    return {
      ok: false,
      code: "EXTENSION_MAGIC_MISMATCH",
      message: "File extension does not match its actual content.",
    };
  }

  const storedFilename = `${crypto.randomBytes(16).toString("hex")}${KIND_EXTENSION[sniffed]}`;
  const storedPath = `${UPLOADS_PUBLIC_PREFIX}/${storedFilename}`;
  return {
    ok: true,
    kind: sniffed,
    storedFilename,
    storedPath,
    bytes: buf.length,
  };
}

/**
 * Persist a validated image buffer to the git-ignored uploads directory and
 * return its public relative path. Creates the directory on demand so the app
 * works offline with zero configuration. The caller MUST have validated the
 * buffer first (pass the validation result's storedFilename).
 *
 * Defence in depth: we re-resolve the final path and assert it stays inside the
 * uploads directory, so a crafted filename can never escape it.
 */
export async function writeImageFile(
  storedFilename: string,
  buf: Buffer,
): Promise<string> {
  const dir = uploadsDir();
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, storedFilename);
  const resolved = path.resolve(target);
  if (resolved !== target || path.dirname(resolved) !== path.resolve(dir)) {
    throw new Error("Refusing to write outside the uploads directory.");
  }
  await fs.writeFile(resolved, buf);
  return `${UPLOADS_PUBLIC_PREFIX}/${storedFilename}`;
}

/**
 * Best-effort delete of a just-written upload. Used to clean up an orphaned file
 * when the DB apply fails AFTER the bytes were written, so the uploads directory
 * never accumulates files that nothing references.
 *
 * Only ever operates on our own randomised filenames inside the uploads dir: the
 * same traversal guard as writeImageFile applies, and a missing file (ENOENT) is
 * silently ignored. Never throws, so it is safe to call in a failure path.
 */
export async function deleteImageFile(storedFilename: string): Promise<void> {
  try {
    const dir = uploadsDir();
    const target = path.join(dir, storedFilename);
    const resolved = path.resolve(target);
    if (resolved !== target || path.dirname(resolved) !== path.resolve(dir)) {
      // Refuse to touch anything outside the uploads directory.
      return;
    }
    await fs.unlink(resolved);
  } catch {
    // Best-effort: a missing file or any fs error here is non-fatal. We never
    // log file paths/contents and never surface this to the caller.
  }
}
