/**
 * Farm media (image) upload: authorization, approval gating, validation and the
 * public read path. Exercised through the REAL management layer
 * (src/lib/admin/manage), the REAL validation helper (src/lib/media) and the
 * REAL public catalog (src/lib/catalog), all bound to a temp SQLite db via
 * DATABASE_URL (the catalog uses the app prisma singleton), mirroring
 * tests/integration/public-dynamic.test.ts + offer-isolation.test.ts.
 *
 * Covered (FEAT-002 acceptance criteria):
 *  1. Farm A manager CANNOT attach media to Farm B's offer OR profile (FORBIDDEN).
 *  2. A farm_manager upload lands in the pending* field and is NOT public yet.
 *  3. platform_admin approval moves pending* -> public.
 *  4. The validation helper rejects disallowed types (gif, svg, a fake .png
 *     whose magic bytes are not an image) and oversize files, and sanitizes a
 *     filename containing path traversal ('../').
 *  5. The public catalog exposes ONLY approved images, never pending ones.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

const dir = mkdtempSync(join(tmpdir(), "vedella-media-"));
const dbPath = join(dir, "test.db");
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.PUBLIC_OFFER_MODEL_ENABLED = "true"; // offer read path ON

execSync("npx prisma db push --schema prisma/schema.test.prisma --skip-generate --accept-data-loss", {
  cwd: projectRoot,
  env: { ...process.env },
  stdio: "ignore",
});

const { prisma } = await import("../../src/lib/db");
const { makeFarm, makeDefinition, makeOffer, makeOfferLot } = await import(
  "../helpers/fixtures"
);
const {
  applyMediaUpload,
  applyMediaApprove,
  applyMediaReject,
} = await import("../../src/lib/admin/manage");
type Actor = import("../../src/lib/admin/manage").Actor;
const {
  validateImageUpload,
  sniffImageKind,
  MAX_IMAGE_BYTES,
  MEDIA_REQUIRES_APPROVAL,
  UPLOADS_PUBLIC_PREFIX,
} = await import("../../src/lib/media");
const { getFarmCatalog } = await import("../../src/lib/catalog");

// Valid magic-byte headers for each allowed format (minimal, enough to sniff).
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
function webpHeader(): Buffer {
  const b = Buffer.alloc(16);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  return b;
}

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("media upload: file validation helper (untrusted input)", () => {
  it("sniffs the three allowed formats and rejects others", () => {
    expect(sniffImageKind(PNG_HEADER)).toBe("png");
    expect(sniffImageKind(JPEG_HEADER)).toBe("jpeg");
    expect(sniffImageKind(webpHeader())).toBe("webp");
    // GIF header "GIF89a" is not allowed.
    expect(sniffImageKind(Buffer.from("GIF89a"))).toBe(null);
    // SVG is text, not a binary image format.
    expect(sniffImageKind(Buffer.from("<svg xmlns=..."))).toBe(null);
  });

  it("rejects a disallowed extension (.gif, .svg)", () => {
    expect(validateImageUpload(PNG_HEADER, "x.gif").ok).toBe(false);
    const svg = validateImageUpload(Buffer.from("<svg></svg>"), "x.svg");
    expect(svg.ok).toBe(false);
  });

  it("rejects a fake .png whose magic bytes are NOT an image", () => {
    const fake = validateImageUpload(Buffer.from("this is not an image"), "evil.png");
    expect(fake.ok).toBe(false);
    if (!fake.ok) expect(fake.code).toBe("BAD_MAGIC");
  });

  it("rejects an extension/content mismatch (jpeg bytes named .png)", () => {
    const res = validateImageUpload(JPEG_HEADER, "mislabelled.png");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("EXTENSION_MAGIC_MISMATCH");
  });

  it("rejects oversize files", () => {
    const big = Buffer.concat([PNG_HEADER, Buffer.alloc(MAX_IMAGE_BYTES)]);
    const res = validateImageUpload(big, "big.png");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("TOO_LARGE");
  });

  it("accepts a valid png/jpeg/webp and produces a sanitized, randomized name", () => {
    const png = validateImageUpload(PNG_HEADER, "photo.png");
    expect(png.ok).toBe(true);
    if (png.ok) {
      expect(png.kind).toBe("png");
      expect(png.storedFilename).toMatch(/^[0-9a-f]{32}\.png$/);
      expect(png.storedPath.startsWith(`${UPLOADS_PUBLIC_PREFIX}/`)).toBe(true);
    }
    expect(validateImageUpload(JPEG_HEADER, "a.jpg").ok).toBe(true);
    expect(validateImageUpload(webpHeader(), "a.webp").ok).toBe(true);
  });

  it("sanitizes a filename containing path traversal ('../')", () => {
    const res = validateImageUpload(PNG_HEADER, "../../../etc/passwd.png");
    expect(res.ok).toBe(true);
    if (res.ok) {
      // Only a random id + safe extension; no traversal, no separators.
      expect(res.storedFilename).toMatch(/^[0-9a-f]{32}\.png$/);
      expect(res.storedFilename.includes("/")).toBe(false);
      expect(res.storedFilename.includes("..")).toBe(false);
      expect(res.storedPath).toBe(`${UPLOADS_PUBLIC_PREFIX}/${res.storedFilename}`);
    }
  });
});

describe("media upload: farm-to-farm isolation (FORBIDDEN)", () => {
  it("Farm A manager cannot attach media to Farm B's offer", async () => {
    const farmA = await makeFarm(prisma, { slug: "media-iso-a-offer" });
    const farmB = await makeFarm(prisma, { slug: "media-iso-b-offer" });
    const def = await makeDefinition(prisma);
    const offerB = await makeOffer(prisma, farmB.id, def.id);

    const managerA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };
    const res = await applyMediaUpload(prisma, managerA, {
      target: "offer_image",
      targetId: offerB.id,
      storedPath: `${UPLOADS_PUBLIC_PREFIX}/evil.png`,
      requiresApproval: true,
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("FORBIDDEN");

    const reloaded = await prisma.farmProductOffer.findUnique({ where: { id: offerB.id } });
    expect(reloaded?.pendingImageRef).toBeNull();
    expect(reloaded?.imageRef).toBeNull();
  });

  it("Farm A manager cannot attach media to Farm B's profile (hero/gallery)", async () => {
    const farmA = await makeFarm(prisma, { slug: "media-iso-a-prof" });
    const farmB = await makeFarm(prisma, { slug: "media-iso-b-prof" });

    const managerA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };
    const hero = await applyMediaUpload(prisma, managerA, {
      target: "farm_hero",
      targetId: farmB.id,
      storedPath: `${UPLOADS_PUBLIC_PREFIX}/hero.png`,
      requiresApproval: true,
    });
    expect(hero.ok).toBe(false);
    expect(hero.code).toBe("FORBIDDEN");

    const gallery = await applyMediaUpload(prisma, managerA, {
      target: "farm_gallery",
      targetId: farmB.id,
      storedPath: `${UPLOADS_PUBLIC_PREFIX}/g.png`,
      requiresApproval: true,
    });
    expect(gallery.ok).toBe(false);
    expect(gallery.code).toBe("FORBIDDEN");

    const reloaded = await prisma.farm.findUnique({ where: { id: farmB.id } });
    expect(reloaded?.pendingHeroImageRef).toBeNull();
    expect(reloaded?.pendingGalleryRefs).toBeNull();
  });
});

describe("media upload: approval gating (submitted then approved)", () => {
  it("the default switch requires approval", () => {
    expect(MEDIA_REQUIRES_APPROVAL).toBe(true);
  });

  it("a farm_manager offer upload lands in pending* and is not yet public", async () => {
    const farmA = await makeFarm(prisma, { slug: "media-gate-offer" });
    const def = await makeDefinition(prisma);
    const offer = await makeOffer(prisma, farmA.id, def.id);
    const managerA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };

    const path = `${UPLOADS_PUBLIC_PREFIX}/abc.png`;
    const res = await applyMediaUpload(prisma, managerA, {
      target: "offer_image",
      targetId: offer.id,
      storedPath: path,
      requiresApproval: MEDIA_REQUIRES_APPROVAL,
    });
    expect(res.ok).toBe(true);
    expect(res.pending).toBe(true);

    const reloaded = await prisma.farmProductOffer.findUnique({ where: { id: offer.id } });
    expect(reloaded?.pendingImageRef).toBe(path);
    expect(reloaded?.imageRef).toBeNull(); // not public yet
  });

  it("platform_admin approval moves offer pending* -> public (manager cannot approve)", async () => {
    const farmA = await makeFarm(prisma, { slug: "media-approve-offer" });
    const def = await makeDefinition(prisma);
    const offer = await makeOffer(prisma, farmA.id, def.id);
    const managerA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };
    const platform: Actor = { id: "plat", role: "platform_admin", farmId: null };

    const path = `${UPLOADS_PUBLIC_PREFIX}/def.png`;
    await applyMediaUpload(prisma, managerA, {
      target: "offer_image",
      targetId: offer.id,
      storedPath: path,
      requiresApproval: true,
    });

    // A farm_manager can NOT approve.
    const denied = await applyMediaApprove(prisma, managerA, {
      target: "offer_image",
      targetId: offer.id,
    });
    expect(denied.ok).toBe(false);
    expect(denied.code).toBe("FORBIDDEN");

    const ok = await applyMediaApprove(prisma, platform, {
      target: "offer_image",
      targetId: offer.id,
    });
    expect(ok.ok).toBe(true);

    const reloaded = await prisma.farmProductOffer.findUnique({ where: { id: offer.id } });
    expect(reloaded?.imageRef).toBe(path);
    expect(reloaded?.pendingImageRef).toBeNull();
  });

  it("farm hero: upload is pending, approval publishes, reject clears pending", async () => {
    const farmA = await makeFarm(prisma, { slug: "media-hero-flow" });
    const managerA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };
    const platform: Actor = { id: "plat", role: "platform_admin", farmId: null };
    const heroPath = `${UPLOADS_PUBLIC_PREFIX}/hero1.webp`;

    await applyMediaUpload(prisma, managerA, {
      target: "farm_hero",
      targetId: farmA.id,
      storedPath: heroPath,
      requiresApproval: true,
    });
    let farm = await prisma.farm.findUnique({ where: { id: farmA.id } });
    expect(farm?.pendingHeroImageRef).toBe(heroPath);
    expect(farm?.heroImageRef).toBeNull();

    await applyMediaApprove(prisma, platform, { target: "farm_hero", targetId: farmA.id });
    farm = await prisma.farm.findUnique({ where: { id: farmA.id } });
    expect(farm?.heroImageRef).toBe(heroPath);
    expect(farm?.pendingHeroImageRef).toBeNull();

    // A new pending upload then rejected: public hero is untouched.
    await applyMediaUpload(prisma, managerA, {
      target: "farm_hero",
      targetId: farmA.id,
      storedPath: `${UPLOADS_PUBLIC_PREFIX}/hero2.webp`,
      requiresApproval: true,
    });
    await applyMediaReject(prisma, platform, { target: "farm_hero", targetId: farmA.id });
    farm = await prisma.farm.findUnique({ where: { id: farmA.id } });
    expect(farm?.pendingHeroImageRef).toBeNull();
    expect(farm?.heroImageRef).toBe(heroPath); // original approved value kept
  });

  it("farm gallery: pending appends, approval merges into public array", async () => {
    const farmA = await makeFarm(prisma, { slug: "media-gallery-flow" });
    const managerA: Actor = { id: "mgrA", role: "farm_manager", farmId: farmA.id };
    const platform: Actor = { id: "plat", role: "platform_admin", farmId: null };
    const g1 = `${UPLOADS_PUBLIC_PREFIX}/g1.jpg`;
    const g2 = `${UPLOADS_PUBLIC_PREFIX}/g2.jpg`;

    await applyMediaUpload(prisma, managerA, {
      target: "farm_gallery",
      targetId: farmA.id,
      storedPath: g1,
      requiresApproval: true,
    });
    await applyMediaUpload(prisma, managerA, {
      target: "farm_gallery",
      targetId: farmA.id,
      storedPath: g2,
      requiresApproval: true,
    });
    let farm = await prisma.farm.findUnique({ where: { id: farmA.id } });
    expect(JSON.parse(farm?.pendingGalleryRefs ?? "[]")).toEqual([g1, g2]);
    expect(farm?.galleryRefs).toBeNull();

    await applyMediaApprove(prisma, platform, { target: "farm_gallery", targetId: farmA.id });
    farm = await prisma.farm.findUnique({ where: { id: farmA.id } });
    expect(JSON.parse(farm?.galleryRefs ?? "[]")).toEqual([g1, g2]);
    expect(farm?.pendingGalleryRefs).toBeNull();
  });
});

describe("media upload: public catalog exposes only approved images", () => {
  it("pending offer/farm media is NOT public; approved media IS", async () => {
    const farm = await makeFarm(prisma, { slug: "media-public-read" });
    const def = await makeDefinition(prisma);
    const offer = await makeOffer(prisma, farm.id, def.id, {
      publicName: "Entrecot foto",
      isApproved: true,
      isActive: true,
      lifecycle: "active",
    });
    await makeOfferLot(prisma, farm.id, offer.id, { units: 10 });

    const managerA: Actor = { id: "mgrA", role: "farm_manager", farmId: farm.id };
    const platform: Actor = { id: "plat", role: "platform_admin", farmId: null };
    const offerImg = `${UPLOADS_PUBLIC_PREFIX}/offer-public.png`;
    const heroImg = `${UPLOADS_PUBLIC_PREFIX}/hero-public.png`;

    // Upload pending media (offer image + farm hero).
    await applyMediaUpload(prisma, managerA, {
      target: "offer_image",
      targetId: offer.id,
      storedPath: offerImg,
      requiresApproval: true,
    });
    await applyMediaUpload(prisma, managerA, {
      target: "farm_hero",
      targetId: farm.id,
      storedPath: heroImg,
      requiresApproval: true,
    });

    // Before approval: catalog shows NO image for offer or farm hero.
    let catalog = await getFarmCatalog("media-public-read");
    expect(catalog).not.toBeNull();
    expect(catalog?.heroImageRef).toBeNull();
    const cutBefore = catalog?.cuts.find((c) => c.name === "Entrecot foto");
    expect(cutBefore?.imageRef ?? null).toBeNull();

    // After approval: catalog exposes the approved image.
    await applyMediaApprove(prisma, platform, { target: "offer_image", targetId: offer.id });
    await applyMediaApprove(prisma, platform, { target: "farm_hero", targetId: farm.id });

    catalog = await getFarmCatalog("media-public-read");
    expect(catalog?.heroImageRef).toBe(heroImg);
    const cutAfter = catalog?.cuts.find((c) => c.name === "Entrecot foto");
    expect(cutAfter?.imageRef).toBe(offerImg);
  });
});
