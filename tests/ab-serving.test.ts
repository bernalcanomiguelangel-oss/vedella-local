/**
 * Public-side A/B copy serving (FEAT-005, blob/gemini task). DB-backed, offline.
 * Proves:
 *  - with a running experiment the chosen variant is DETERMINISTIC per anon
 *    session and only APPROVED variants are served;
 *  - with no running experiment nothing is assigned (base description renders);
 *  - a non-approved arm is never served;
 *  - recordEvent stores copy_variant_impression with copyVariantId and honours
 *    the isTest exclusion flag.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "vedella-abserve-"));
const dbPath = join(dir, "test.db");
process.env.DATABASE_URL = `file:${dbPath}`;
delete process.env.AI_API_KEY;
process.env.AI_PROVIDER = "mock";

execSync(
  "npx prisma db push --schema prisma/schema.test.prisma --skip-generate --accept-data-loss",
  { cwd: projectRoot, env: { ...process.env }, stdio: "ignore" },
);

const { prisma } = await import("../src/lib/db");
const { resolveActiveCopyForOffers, assignArm } = await import(
  "../src/lib/ab-serving"
);
const { recordEvent } = await import("../src/lib/analytics");

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

let farmId = "";
let offerId = "";

async function makeOffer(): Promise<string> {
  const farm = await prisma.farm.create({
    data: {
      slug: "serve-farm",
      name: "Serve Farm",
      town: "Vic",
      comarca: "Osona",
      breed: "Bruna",
      foundedYear: 1990,
      animalCount: 50,
      story: "story",
    },
  });
  farmId = farm.id;
  const def = await prisma.productDefinition.create({
    data: { canonicalName: "Entrecot", category: "cut", translationKey: "ec-serve" },
  });
  const offer = await prisma.farmProductOffer.create({
    data: {
      farmId: farm.id,
      productDefinitionId: def.id,
      publicName: "Entrecot madurat",
      priceAmountCents: 1438,
      priceUnit: "per_unit",
    },
  });
  return offer.id;
}

async function makeVariant(status: string, text: string): Promise<string> {
  const v = await prisma.copyVariant.create({
    data: { farmProductOfferId: offerId, farmId, locale: "ca", text, source: "ai", status },
  });
  return v.id;
}

beforeAll(async () => {
  offerId = await makeOffer();
});

describe("assignArm determinism", () => {
  it("is stable for the same (session, experiment) pair", () => {
    const a = assignArm("anon_x", "exp_1");
    const b = assignArm("anon_x", "exp_1");
    expect(a).toBe(b);
  });
});

describe("resolveActiveCopyForOffers", () => {
  it("returns no assignment when there is no running experiment", async () => {
    const map = await resolveActiveCopyForOffers(prisma, {
      offerIds: [offerId],
      locale: "ca",
      anonSessionId: "anon_none",
    });
    expect(map.size).toBe(0);
  });

  it("serves an APPROVED variant deterministically per session, and never a non-approved arm", async () => {
    const vA = await makeVariant("approved", "Variant A text — Entrecot");
    const vB = await makeVariant("approved", "Variant B text — Entrecot");
    const exp = await prisma.copyExperiment.create({
      data: {
        farmProductOfferId: offerId,
        farmId,
        locale: "ca",
        status: "running",
        variantAId: vA,
        variantBId: vB,
      },
    });

    // Deterministic across repeated calls for the same session.
    const first = await resolveActiveCopyForOffers(prisma, {
      offerIds: [offerId],
      locale: "ca",
      anonSessionId: "anon_stable",
    });
    const second = await resolveActiveCopyForOffers(prisma, {
      offerIds: [offerId],
      locale: "ca",
      anonSessionId: "anon_stable",
    });
    expect(first.get(offerId)?.copyVariantId).toBe(
      second.get(offerId)?.copyVariantId,
    );
    const chosen = first.get(offerId)!.copyVariantId;
    expect([vA, vB]).toContain(chosen);
    // The served variant is always one of the two APPROVED ones.
    const servedVariant = await prisma.copyVariant.findUnique({ where: { id: chosen } });
    expect(["approved", "active"]).toContain(servedVariant!.status);

    // Now flip arm B to rejected: the experiment can no longer serve (one arm
    // not approved), so nothing is assigned.
    await prisma.copyVariant.update({ where: { id: vB }, data: { status: "rejected" } });
    const afterReject = await resolveActiveCopyForOffers(prisma, {
      offerIds: [offerId],
      locale: "ca",
      anonSessionId: "anon_stable",
    });
    expect(afterReject.size).toBe(0);

    // Restore + decide the experiment: a decided (non-running) experiment serves
    // nothing.
    await prisma.copyVariant.update({ where: { id: vB }, data: { status: "approved" } });
    await prisma.copyExperiment.update({ where: { id: exp.id }, data: { status: "decided" } });
    const afterDecide = await resolveActiveCopyForOffers(prisma, {
      offerIds: [offerId],
      locale: "ca",
      anonSessionId: "anon_stable",
    });
    expect(afterDecide.size).toBe(0);
  });
});

describe("impression recording", () => {
  it("stores copy_variant_impression with copyVariantId and honours isTest exclusion", async () => {
    const v = await makeVariant("approved", "impression variant");
    await recordEvent(prisma, {
      type: "copy_variant_impression",
      anonSessionId: "anon_imp",
      offerId,
      copyVariantId: v,
    });
    await recordEvent(prisma, {
      type: "copy_variant_impression",
      anonSessionId: "anon_imp_test",
      offerId,
      copyVariantId: v,
      isTest: true,
    });
    const real = await prisma.analyticsEvent.count({
      where: { type: "copy_variant_impression", copyVariantId: v, isTest: false },
    });
    const test = await prisma.analyticsEvent.count({
      where: { type: "copy_variant_impression", copyVariantId: v, isTest: true },
    });
    expect(real).toBe(1);
    expect(test).toBe(1);
  });
});
