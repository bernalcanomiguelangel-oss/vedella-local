/**
 * Pure helpers for rendering farm/offer imagery on the PUBLIC marketplace.
 *
 * The public catalog exposes only APPROVED image paths (OfferedFarm.heroImageRef
 * / galleryRefs, OfferedCut.imageRef, OfferedPack.imageRef). Those paths are the
 * local, git-ignored `/uploads/...` static assets written by src/lib/media.ts.
 * Seeded farms ship with NO uploaded images, so every image surface MUST fall
 * back to the existing CSS gradient. These helpers centralise two decisions:
 *
 *  1. Is there a usable, safe public image to show? (`isPublicImageRef`)
 *  2. What alt text should an informative image carry? (`imageAltText`)
 *
 * They are intentionally pure (no React, no DB) so the fallback contract is unit
 * testable. The UI uses the boolean to choose <img> vs the gradient placeholder.
 */

/** Host suffix of Vercel Blob public URLs (e.g. <id>.public.blob.vercel-storage.com). */
const VERCEL_BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";

/**
 * True when `ref` is a non-empty public image ref we are willing to render as an
 * <img src>. Exactly TWO shapes are accepted and nothing else:
 *
 *   1. The app's own local `/uploads/...` static prefix (a relative, slash-rooted
 *      path with no scheme), written by LocalFilesystemStorage in local/offline.
 *   2. An `https://` URL whose host ends with `.blob.vercel-storage.com`, i.e. a
 *      Vercel Blob public URL returned by VercelBlobStorage in production.
 *
 * Everything else is rejected: null/empty values (seeded farms), arbitrary
 * remote hosts, non-https schemes (http/data/javascript/...), and
 * protocol-relative `//host` URLs. This keeps the "no arbitrary remote" guarantee
 * so the caller falls back to the gradient placeholder in every other case.
 */
export function isPublicImageRef(ref: string | null | undefined): ref is string {
  if (typeof ref !== "string") return false;
  const trimmed = ref.trim();
  if (trimmed.length === 0) return false;
  // Protocol-relative URLs (//host/...) are never allowed.
  if (trimmed.startsWith("//")) return false;

  // The app's own uploads prefix: a local static asset with no scheme.
  if (trimmed.startsWith("/uploads/")) return true;

  // Vercel Blob public URL: must be https AND on the blob host. We parse the URL
  // (rather than string-matching) so a crafted value like
  // "https://evil.com/.blob.vercel-storage.com" or
  // "https://x.blob.vercel-storage.com.evil.com" cannot sneak through.
  if (/^https:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "https:") return false;
      const host = url.hostname.toLowerCase();
      return host === VERCEL_BLOB_HOST_SUFFIX.slice(1) || host.endsWith(VERCEL_BLOB_HOST_SUFFIX);
    } catch {
      return false;
    }
  }

  // Any other scheme (http:, data:, javascript:, etc.) or path is rejected.
  return false;
}

/**
 * Keep only the public image refs from a gallery array (drops null/empty/remote
 * entries). Returns a new array; safe to call on the approved galleryRefs.
 */
export function publicImageRefs(refs: readonly (string | null | undefined)[]): string[] {
  return refs.filter(isPublicImageRef);
}

/**
 * Meaningful alt text for an INFORMATIVE image (farm hero, product photo).
 * Decorative gradient/pattern layers never call this; they are marked
 * aria-hidden / empty-alt at the call site. `context` disambiguates otherwise
 * identical names (e.g. the same farm name used for hero and a gallery frame).
 */
export function imageAltText(name: string, context?: string): string {
  const base = name.trim();
  if (!context) return base;
  return `${base}, ${context}`.trim();
}
