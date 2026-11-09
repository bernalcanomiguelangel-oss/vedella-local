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

/**
 * True when `ref` is a non-empty, local public upload path we are willing to
 * render as an <img src>. We only ever accept the app's own `/uploads/...`
 * static prefix: a relative, slash-rooted path with no scheme and no protocol.
 * This rejects null/empty values (seeded farms), remote URLs (offline safety),
 * and anything that is not our upload prefix, so the caller falls back to the
 * gradient placeholder in every other case.
 */
export function isPublicImageRef(ref: string | null | undefined): ref is string {
  if (typeof ref !== "string") return false;
  const trimmed = ref.trim();
  if (trimmed.length === 0) return false;
  // Reject absolute/remote URLs and protocol-relative URLs; offline-only.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return false;
  if (trimmed.startsWith("//")) return false;
  // Only the app's own uploads prefix is served as a local static asset.
  return trimmed.startsWith("/uploads/");
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
