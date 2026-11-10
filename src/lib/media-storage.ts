/**
 * MediaStorage abstraction for farm-uploaded images.
 *
 * WHY THIS EXISTS
 * ---------------
 * The original src/lib/media.ts wrote uploads directly to the local filesystem
 * (public/uploads). That works locally and in tests, but on Vercel the
 * serverless filesystem is read-only / ephemeral, so the write throws and (when
 * it propagated out of the server action) crashed the admin/farm page. This
 * module introduces a storage seam with two implementations:
 *
 *  - LocalFilesystemStorage: the historical behavior (writes under public/uploads,
 *    returns "/uploads/<file>"). Used in local dev, offline and tests.
 *  - VercelBlobStorage: used in production when BLOB_READ_WRITE_TOKEN is set.
 *    It LAZILY imports @vercel/blob only when actually used, so an offline/test
 *    build never requires the package and never needs a token.
 *
 * The returned ref (a "/uploads/..." path OR a blob https URL) is stored
 * verbatim in the DB and later rendered through src/lib/image-display.ts, whose
 * isPublicImageRef guard accepts exactly these two shapes and nothing else.
 *
 * A storage error is surfaced as a handled failure by the caller
 * (mediaUploadAction); this module throws on write/delete failure and the
 * action catches it. The token is read ONLY from process.env and is NEVER
 * logged.
 */
import type { ImageKind } from "@/lib/media";
import { writeImageFile, deleteImageFile, UPLOADS_PUBLIC_PREFIX } from "@/lib/media";

/** Public host suffix for Vercel Blob URLs (e.g. <id>.public.blob.vercel-storage.com). */
export const VERCEL_BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";

/**
 * Storage seam for uploaded media. `put` persists an already-validated buffer
 * under the given stored filename and returns the PUBLIC ref to store in the DB.
 * `remove` is a best-effort cleanup used when a later step fails; it accepts the
 * ref previously returned by `put` (a local path or a blob URL).
 */
export interface MediaStorage {
  readonly kind: "local" | "blob";
  put(storedFilename: string, buf: Buffer, kind: ImageKind): Promise<string>;
  remove(ref: string): Promise<void>;
}

/**
 * Local filesystem storage. Wraps the existing writeImageFile/deleteImageFile
 * semantics (and their traversal guard). Returns the "/uploads/<file>" path.
 */
export class LocalFilesystemStorage implements MediaStorage {
  readonly kind = "local" as const;

  async put(storedFilename: string, buf: Buffer): Promise<string> {
    return writeImageFile(storedFilename, buf);
  }

  /**
   * `ref` is the "/uploads/<file>" path returned by put. We only ever delete by
   * the stored filename inside the uploads dir; deleteImageFile re-applies the
   * traversal guard, so a non-matching ref is a safe no-op.
   */
  async remove(ref: string): Promise<void> {
    const filename = ref.startsWith(`${UPLOADS_PUBLIC_PREFIX}/`)
      ? ref.slice(UPLOADS_PUBLIC_PREFIX.length + 1)
      : ref;
    await deleteImageFile(filename);
  }
}

const KIND_CONTENT_TYPE: Record<ImageKind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Vercel Blob storage. The @vercel/blob module is imported LAZILY (dynamic
 * import) only inside put/remove, so an offline/test build that never uploads
 * to Blob neither requires the package nor needs a token. The token is read
 * from process.env and passed explicitly; it is NEVER logged.
 *
 * `put` throws on failure (network/auth). mediaUploadAction catches it and
 * returns a handled { ok:false, code:'STORAGE_ERROR' } instead of crashing.
 */
export class VercelBlobStorage implements MediaStorage {
  readonly kind = "blob" as const;
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  async put(storedFilename: string, buf: Buffer, kind: ImageKind): Promise<string> {
    const { put } = await import("@vercel/blob");
    const result = await put(storedFilename, buf, {
      access: "public",
      token: this.token,
      contentType: KIND_CONTENT_TYPE[kind],
      // Our storedFilename is already a randomised, sanitised unique name, so we
      // keep it verbatim rather than letting Blob append a random suffix.
      addRandomSuffix: false,
    });
    return result.url;
  }

  async remove(ref: string): Promise<void> {
    try {
      const { del } = await import("@vercel/blob");
      await del(ref, { token: this.token });
    } catch {
      // Best-effort cleanup: a failure to delete an orphaned blob is non-fatal
      // and must never surface to the caller. The token is never logged.
    }
  }
}

/** Env shape we read; kept minimal so it is easy to pass a fake in tests. */
export interface MediaStorageEnv {
  BLOB_READ_WRITE_TOKEN?: string | undefined;
  [key: string]: string | undefined;
}

/** 'blob' when a non-empty BLOB_READ_WRITE_TOKEN is present, else 'local'. */
export function mediaStorageKind(
  env: MediaStorageEnv = process.env,
): "blob" | "local" {
  const token = env.BLOB_READ_WRITE_TOKEN;
  return typeof token === "string" && token.length > 0 ? "blob" : "local";
}

/**
 * Select the storage implementation. VercelBlobStorage when BLOB_READ_WRITE_TOKEN
 * is a non-empty string (production with a Blob store), else LocalFilesystemStorage
 * (local dev / offline / tests). Reads only from the provided env (process.env by
 * default) and never logs the token.
 */
export function selectMediaStorage(
  env: MediaStorageEnv = process.env,
): MediaStorage {
  if (mediaStorageKind(env) === "blob") {
    return new VercelBlobStorage(env.BLOB_READ_WRITE_TOKEN as string);
  }
  return new LocalFilesystemStorage();
}
