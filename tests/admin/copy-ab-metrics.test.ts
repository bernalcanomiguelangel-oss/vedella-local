/**
 * A/B conversion metric honesty + judge-vs-human agreement split (FEAT-005).
 * DB-backed, offline. Proves:
 *  - the conversion metric NAMES its numerator (convertedSessions) and
 *    denominator (impressedSessions), excludes isTest data, flags sampleTooSmall
 *    below the 20-row threshold, and never claims significance;
 *  - a conversion is only credited when the session was actually impressed;
 *  - judge-vs-human agreement reports 'failures caught' and 'passes agreed' as
 *    two SEPARATE counts, never summed into one accuracy figure;
 *  - farm isolation: the metrics data layer scopes to the owning farm.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "vedella-abmetrics-"));
const dbPath = join(dir, "test.db");
process.env.DATABASE_URL = `file:${dbPath}`;
delete process.env.AI_API_KEY;
process.env.AI_PROVIDER = "mock";

execSync(
  "npx prisma db push --schema prisma/schema.test.prisma --skip-generate --accept-data-loss",
  { cwd: projectRoot, env: { ...process.env }, stdio: "ignore" },
);

const { prisma } = await import("../../src/lib/db");
const { recordEvent } = await import("../../src/lib/analytics");
const { computeExperimentMetrics, computeJudgeAgreement, SMALL_SAMPLE_THRESHOLD } =
  await import("../../src/lib/admin/copy-ab-metrics");

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

let farmA = "";
let farmB = "";
let offerA = "";
let variantA1 = "";
let variantA2 = "";
let experimentA = "";

async function makeFarmOffer(slug: string): Promise<{ farmId: string; offerId: string }> {
  const farm = await prisma.farm.create({
    data: {
      slug,
      name: `Farm ${slug}`,
      town: "Vic",
      comarca: "Osona",
      breed: "Bruna",
      foundedYear: 1990,
      animalCount: 50,
      story: "story",
    },
  });
  const def = await prisma.productDefinition.create({
    data: { canonicalName: "Entrecot", category: "cut", translationKey: `ec-${slug}` },
  });
  const offer = await prisma.farmProductOffer.create({
    data: {
      farmId: farm.id,
      productDefinitionId: def.id,
      publicName: "Entrecot",
      priceAmountCents: 1438,
      priceUnit: "per_unit",
    },
  });
  return { farmId: farm.id, offerId: offer.id };
}

beforeAll(async () => {
  const a = await makeFarmOffer("metrics-a");
  const b = await makeFarmOffer("metrics-b");
  farmA = a.farmId;
  offerA = a.offerId;
  farmB = b.farmId;

  variantA1 = (
    await prisma.copyVariant.create({
      data: { farmProductOfferId: offerA, farmId: farmA, locale: "ca", text: "A1", source: "ai", status: "approved" },
    })
  ).id;
  variantA2 = (
    await prisma.copyVariant.create({
      data: { farmProductOfferId: offerA, farmId: farmA, locale: "ca", text: "A2", source: "ai", status: "approved" },
    })
  ).id;
  experimentA = (
    await prisma.copyExperiment.create({
      data: {
        farmProductOfferId: offerA,
        farmId: farmA,
        locale: "ca",
        status: "running",
        variantAId: variantA1,
        variantBId: variantA2,
      },
    })
  ).id;

  // Impress 3 sessions on A1, 1 of which converts; also one TEST impression that
  // must be excluded. A2 gets 1 impression and 1 conversion.
  await recordEvent(prisma, { type: "copy_variant_impression", anonSessionId: "s1", offerId: offerA, copyVariantId: variantA1 });
  await recordEvent(prisma, { type: "copy_variant_impression", anonSessionId: "s2", offerId: offerA, copyVariantId: variantA1 });
  await recordEvent(prisma, { type: "copy_variant_impression", anonSessionId: "s3", offerId: offerA, copyVariantId: variantA1 });
  await recordEvent(prisma, { type: "copy_variant_impression", anonSessionId: "s_test", offerId: offerA, copyVariantId: variantA1, isTest: true });
  await recordEvent(prisma, { type: "copy_variant_converted", anonSessionId: "s1", offerId: offerA, copyVariantId: variantA1 });
  // A conversion from a session that was NEVER impressed must NOT count.
  await recordEvent(prisma, { type: "copy_variant_converted", anonSessionId: "ghost", offerId: offerA, copyVariantId: variantA1 });
  await recordEvent(prisma, { type: "copy_variant_impression", anonSessionId: "s4", offerId: offerA, copyVariantId: variantA2 });
  await recordEvent(prisma, { type: "copy_variant_converted", anonSessionId: "s4", offerId: offerA, copyVariantId: variantA2 });
});

describe("conversion metric honesty", () => {
  it("names numerator/denominator, excludes test data, flags small sample, no significance", async () => {
    const m = await computeExperimentMetrics(prisma, experimentA, farmA);
    expect(m).not.toBeNull();
    if (!m) return;

    // Numerator / denominator are explicitly NAMED.
    expect(m.numeratorLabel).toBe("convertedSessions");
    expect(m.denominatorLabel).toBe("impressedSessions");

    // A1: 3 impressed sessions (test excluded), 1 converted (ghost excluded).
    expect(m.variantA.impressedSessions).toBe(3);
    expect(m.variantA.convertedSessions).toBe(1);
    expect(m.variantA.conversionRate).toBeCloseTo(1 / 3);

    // A2: 1 impression, 1 conversion.
    expect(m.variantB.impressedSessions).toBe(1);
    expect(m.variantB.convertedSessions).toBe(1);

    // Small-sample flag (far below the 20 threshold) and NO significance claim.
    expect(m.sampleTooSmall).toBe(true);
    expect(m.smallSampleThreshold).toBe(SMALL_SAMPLE_THRESHOLD);
    expect(m.significanceClaimed).toBe(false);
    // The only significance-related field is the explicit `significanceClaimed:
    // false` honesty marker — there is NO pValue/confidence/"significant" field
    // that would imply a significance result.
    const keys = Object.keys(m);
    expect(keys).not.toContain("pValue");
    expect(keys).not.toContain("confidence");
    expect(keys).not.toContain("significant");
    expect(keys).not.toContain("isSignificant");
  });

  it("scopes to the owning farm (isolation): farm B cannot read farm A's experiment", async () => {
    const m = await computeExperimentMetrics(prisma, experimentA, farmB);
    expect(m).toBeNull();
  });
});

describe("judge-vs-human agreement split", () => {
  it("reports failures caught and passes agreed as two separate counts, never summed", async () => {
    // Variant with judge FAIL + human reject -> a failure caught.
    const vFail = await prisma.copyVariant.create({
      data: { farmProductOfferId: offerA, farmId: farmA, locale: "ca", text: "bad copy", source: "ai", status: "rejected" },
    });
    await prisma.judgeEvaluation.create({ data: { copyVariantId: vFail.id, verdict: "FAIL", reason: "fabricated" } });
    await prisma.humanDecisionExample.create({
      data: { farmId: farmA, locale: "ca", variantText: "bad copy", verdict: "reject", reason: "agree, drop it" },
    });

    // Variant with judge PASS + human approve -> a pass agreed.
    const vPass = await prisma.copyVariant.create({
      data: { farmProductOfferId: offerA, farmId: farmA, locale: "ca", text: "good copy", source: "ai", status: "approved" },
    });
    await prisma.judgeEvaluation.create({ data: { copyVariantId: vPass.id, verdict: "PASS", reason: "grounded" } });
    await prisma.humanDecisionExample.create({
      data: { farmId: farmA, locale: "ca", variantText: "good copy", verdict: "approve", reason: "ship it" },
    });

    const agreement = await computeJudgeAgreement(prisma, farmA);

    // Two SEPARATE fields, each computed independently.
    expect(agreement.failuresCaught).toBe(1);
    expect(agreement.passesAgreed).toBe(1);
    expect(agreement.collapsedToSingleAccuracy).toBe(false);

    // There is NO single collapsed accuracy field.
    expect(Object.keys(agreement)).not.toContain("accuracy");
    expect(Object.keys(agreement)).not.toContain("agreementRate");
  });

  it("isolation: farm B sees none of farm A's agreement data", async () => {
    const agreement = await computeJudgeAgreement(prisma, farmB);
    expect(agreement.failuresCaught).toBe(0);
    expect(agreement.passesAgreed).toBe(0);
    expect(agreement.comparedPairs).toBe(0);
  });
});
