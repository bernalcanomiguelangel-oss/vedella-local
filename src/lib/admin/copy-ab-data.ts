/**
 * Read model for the admin Copy A/B surface (FEAT-005).
 *
 * Gathers, FOR THE OFFERS A USER MAY SEE (farm scope), everything the UI needs:
 *   - each offer's proposed CopyVariants (with their latest judge verdict),
 *   - any running/decided experiment + its raw per-variant metrics,
 *   - the judge-vs-human agreement split,
 *   - the recent human-decision history (the auditable example store).
 *
 * Farm isolation: a farm_manager only ever sees their own farm's offers and
 * variants (enforced by `visibleFarmScope`); a platform_admin sees all.
 * Everything here is a READ — mutations go through copy-ab-actions.ts.
 */
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { visibleFarmScope } from "@/lib/auth";
import {
  computeExperimentMetrics,
  computeJudgeAgreement,
  type ExperimentMetrics,
  type JudgeAgreementSummary,
} from "./copy-ab-metrics";

export interface CopyVariantView {
  id: string;
  locale: string;
  text: string;
  source: string;
  status: string;
  evidence: string[];
  judge: { verdict: string; reason: string } | null;
}

export interface DecisionHistoryRow {
  id: string;
  locale: string | null;
  verdict: string;
  reason: string;
  editedText: string | null;
  variantText: string;
  createdAt: string;
}

export interface CopyAbOfferView {
  offerId: string;
  farmId: string;
  farmName: string;
  publicName: string;
  variants: CopyVariantView[];
  experiment: {
    id: string;
    locale: string;
    status: string;
    metrics: ExperimentMetrics | null;
  } | null;
}

export interface CopyAbData {
  offers: CopyAbOfferView[];
  agreement: JudgeAgreementSummary;
  history: DecisionHistoryRow[];
  scope: "platform" | "farm";
}

/** Prisma `where` restricting CopyVariant/offer queries to the user's farms. */
function copyScopeWhere(user: SessionUser): { farmId?: { in: string[] } } {
  const scope = visibleFarmScope(user);
  if (scope === null) return {}; // platform_admin: all farms
  if (scope.length === 0) return { farmId: { in: ["__none__"] } };
  return { farmId: { in: scope } };
}

export async function loadCopyAbData(user: SessionUser): Promise<CopyAbData> {
  const where = copyScopeWhere(user);

  // Offers that have at least one variant, within scope.
  const variants = await prisma.copyVariant.findMany({
    where,
    include: {
      offer: { include: { farm: { select: { name: true } } } },
      evaluations: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });

  const byOffer = new Map<string, CopyAbOfferView>();
  for (const v of variants) {
    let evidence: string[] = [];
    try {
      const parsed = JSON.parse(v.evidenceJson);
      if (Array.isArray(parsed)) evidence = parsed.filter((x) => typeof x === "string");
    } catch {
      evidence = [];
    }
    const view: CopyVariantView = {
      id: v.id,
      locale: v.locale,
      text: v.text,
      source: v.source,
      status: v.status,
      evidence,
      judge: v.evaluations[0]
        ? { verdict: v.evaluations[0].verdict, reason: v.evaluations[0].reason }
        : null,
    };
    const existing = byOffer.get(v.farmProductOfferId);
    if (existing) {
      existing.variants.push(view);
    } else {
      byOffer.set(v.farmProductOfferId, {
        offerId: v.farmProductOfferId,
        farmId: v.farmId,
        farmName: v.offer.farm.name,
        publicName: v.offer.publicName,
        variants: [view],
        experiment: null,
      });
    }
  }

  // Attach the most-recent experiment + its raw metrics per offer.
  const offerIds = [...byOffer.keys()];
  if (offerIds.length > 0) {
    const experiments = await prisma.copyExperiment.findMany({
      where: { farmProductOfferId: { in: offerIds }, ...where },
      orderBy: { startedAt: "desc" },
    });
    const seenOffer = new Set<string>();
    for (const exp of experiments) {
      if (seenOffer.has(exp.farmProductOfferId)) continue;
      seenOffer.add(exp.farmProductOfferId);
      const view = byOffer.get(exp.farmProductOfferId);
      if (!view) continue;
      const metrics = await computeExperimentMetrics(prisma, exp.id, exp.farmId);
      view.experiment = {
        id: exp.id,
        locale: exp.locale,
        status: exp.status,
        metrics,
      };
    }
  }

  // Judge-vs-human agreement split, aggregated across the user's farms.
  const scopeIds = visibleFarmScope(user);
  let agreement: JudgeAgreementSummary = {
    failuresCaught: 0,
    passesAgreed: 0,
    disagreementsJudgeFailHumanApprove: 0,
    disagreementsJudgePassHumanReject: 0,
    comparedPairs: 0,
    collapsedToSingleAccuracy: false,
  };
  const farmIds =
    scopeIds === null
      ? [...new Set(variants.map((v) => v.farmId))]
      : scopeIds;
  for (const fid of farmIds) {
    const part = await computeJudgeAgreement(prisma, fid);
    agreement = {
      failuresCaught: agreement.failuresCaught + part.failuresCaught,
      passesAgreed: agreement.passesAgreed + part.passesAgreed,
      disagreementsJudgeFailHumanApprove:
        agreement.disagreementsJudgeFailHumanApprove +
        part.disagreementsJudgeFailHumanApprove,
      disagreementsJudgePassHumanReject:
        agreement.disagreementsJudgePassHumanReject +
        part.disagreementsJudgePassHumanReject,
      comparedPairs: agreement.comparedPairs + part.comparedPairs,
      collapsedToSingleAccuracy: false,
    };
  }

  // Recent human-decision history (auditable example store), scoped to farms.
  const historyWhere =
    scopeIds === null
      ? {}
      : { farmId: { in: scopeIds.length > 0 ? scopeIds : ["__none__"] } };
  const historyRows = await prisma.humanDecisionExample.findMany({
    where: historyWhere,
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  const history: DecisionHistoryRow[] = historyRows.map((r) => ({
    id: r.id,
    locale: r.locale,
    verdict: r.verdict,
    reason: r.reason,
    editedText: r.editedText,
    variantText: r.variantText,
    createdAt: r.createdAt.toISOString(),
  }));

  return {
    offers: [...byOffer.values()],
    agreement,
    history,
    scope: scopeIds === null ? "platform" : "farm",
  };
}
