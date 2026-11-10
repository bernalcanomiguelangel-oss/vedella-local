import { describe, it, expect } from "vitest";
import {
  isPublicImageRef,
  publicImageRefs,
  imageAltText,
} from "@/lib/image-display";

/**
 * Guards the public-image fallback contract used by the marketplace UI
 * (FarmCard, ProductCard, farm page). Seeded farms ship with NO uploads, so the
 * UI MUST only render an <img> for a safe, local /uploads/... path and fall back
 * to the CSS gradient in every other case (null/empty/remote).
 */
describe("isPublicImageRef", () => {
  it("accepts a local approved upload path", () => {
    expect(isPublicImageRef("/uploads/a1b2c3d4.jpg")).toBe(true);
    expect(isPublicImageRef("/uploads/hero.webp")).toBe(true);
  });

  it("rejects absent values so seeded farms fall back to the gradient", () => {
    expect(isPublicImageRef(null)).toBe(false);
    expect(isPublicImageRef(undefined)).toBe(false);
    expect(isPublicImageRef("")).toBe(false);
    expect(isPublicImageRef("   ")).toBe(false);
  });

  it("accepts an https Vercel Blob URL (production media path)", () => {
    expect(
      isPublicImageRef("https://abc123.public.blob.vercel-storage.com/photo.png"),
    ).toBe(true);
    expect(
      isPublicImageRef("https://store.blob.vercel-storage.com/a/b/hero.webp"),
    ).toBe(true);
  });

  it("rejects remote/protocol URLs (offline-only safety)", () => {
    expect(isPublicImageRef("https://evil.example/x.jpg")).toBe(false);
    expect(isPublicImageRef("http://host/x.png")).toBe(false);
    expect(isPublicImageRef("//cdn.example/x.jpg")).toBe(false);
    expect(isPublicImageRef("data:image/png;base64,AAAA")).toBe(false);
  });

  it("rejects http:// Blob host and lookalike/suffix-spoof hosts", () => {
    // Non-https Blob host must be rejected (only https is allowed).
    expect(
      isPublicImageRef("http://abc.public.blob.vercel-storage.com/x.png"),
    ).toBe(false);
    // Blob host as a path/subdomain of an attacker domain must not match.
    expect(
      isPublicImageRef("https://evil.com/.blob.vercel-storage.com/x.png"),
    ).toBe(false);
    expect(
      isPublicImageRef("https://x.blob.vercel-storage.com.evil.com/x.png"),
    ).toBe(false);
  });

  it("rejects paths outside the uploads prefix", () => {
    expect(isPublicImageRef("/etc/passwd")).toBe(false);
    expect(isPublicImageRef("uploads/x.jpg")).toBe(false);
    expect(isPublicImageRef("/public/uploads/x.jpg")).toBe(false);
  });
});

describe("publicImageRefs", () => {
  it("keeps only safe local refs and drops the rest", () => {
    expect(
      publicImageRefs([
        "/uploads/a.jpg",
        null,
        "",
        "https://remote/x.png",
        "/uploads/b.webp",
      ]),
    ).toEqual(["/uploads/a.jpg", "/uploads/b.webp"]);
  });

  it("returns an empty array for a farm with no approved gallery", () => {
    expect(publicImageRefs([])).toEqual([]);
    expect(publicImageRefs([null, undefined, ""])).toEqual([]);
  });
});

describe("imageAltText", () => {
  it("uses the entity name as meaningful alt text", () => {
    expect(imageAltText("Mas Vallgorguina")).toBe("Mas Vallgorguina");
    expect(imageAltText("  Entrecot  ")).toBe("Entrecot");
  });

  it("appends a context when provided (no em dash)", () => {
    const alt = imageAltText("Mas Vallgorguina", "2");
    expect(alt).toBe("Mas Vallgorguina, 2");
    expect(alt).not.toContain("—");
  });
});
