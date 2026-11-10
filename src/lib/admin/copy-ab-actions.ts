"use server";

/**
 * Server actions for the FEAT-004 A/B-testing + LLM-as-judge copy loop
 * (blob/gemini task). Every action:
 *   1. Re-authenticates on the server (requireAdmin / requirePlatformAdmin).
 *   2. Enforces farm isolation via canActOnFarm (farm_manager only own farm).
 *   3. Writes an AdminAudit row (human action) where it mutates state.
 *
 * HARD RULES enforced here:
 *   - AI never flips a variant's status or sets a price. ONLY the human
 *     `decideCopyVariant` action changes status, and approve/active is
 *     platform_admin-only (mirroring the existing human-only lifecycle rule).
 *   - Every human decision REQUIRES a non-empty reason and ALWAYS writes a
 *     HumanDecisionExample row — the accumulating few-shot "learning" substrate
 *     (accumulated EXAMPLES, not model training) replayed into later proposer
 *     and judge prompts.
 *   - The proposer/judge services (src/lib/ai/copy-proposer, copy-judge) do the
 *     AI work; they are invoked here so the whole loop is gated behind the admin
 *     auth + farm scope.
 */
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin, requirePlatformAdmin, canActOnFarm } from "@/lib/auth";
import { recordAdminAudit } from "./audit";
import { proposeCopyVariants } from "@/lib/ai/copy-proposer";
import { judgeCopyVariant } from "@/lib/ai/copy-judge";
import { isLocale, type Locale } from "@/lib/i18n";

export interface CopyActionResult {
  ok: boolean;
  code?: string;
  message?: string;
}

function revalidateCopy() {
  revalidatePath("/admin/copy");
  revalidatePath("/admin/products");
}

// --- Proposer (AI drafts; human-gated entry point) -------------------------

/**
 * Draft AI copy variants for an offer+locale. Gated by requireAdmin + farm
 * scope. The AI output is stored as status='draft' CopyVariant rows; the AI
 * never approves/publishes/prices.
 */
export async function proposeCopyAction(
  offerId: string,
  locale: string,
  count = 2,
): Promise<CopyActionResult & { variantIds?: string[] }> {
  const user = await requireAdmin();
  if (!isLocale(locale)) {
    return { ok: false, code: "BAD_LOCALE", message: "Locale must be ca, es or en." };
  }
  const offer = await prisma.farmProductOffer.findUnique({ where: { id: offerId } });
  if (!offer) return { ok: false, code: "NOT_FOUND", message: "Offer not found." };
  if (!canActOnFarm(user, offer.farmId)) {
    return { ok: false, code: "FORBIDDEN", message: "Not permitted for this farm." };
  }

  const res = await proposeCopyVariants({ offerId, locale: locale as Locale, count });
  if (!res.ok) {
    return { ok: false, code: res.code ?? "PROPOSE_FAILED", message: "Could not draft variants." };
  }
  await recordAdminAudit({
    actor: user,
    action: "copy_propose",
    entityType: "offer",
    entityId: offerId,
    detail: `locale=${locale} variants=${res.variantIds.length} stripped=${res.strippedFields.length}`,
  });
  revalidateCopy();
  return { ok: true, variantIds: res.variantIds };
}

/** Run the LLM-as-judge over a variant. Gated by requireAdmin + farm scope. */
export async function judgeCopyVariantAction(
  copyVariantId: string,
): Promise<CopyActionResult & { verdict?: string; reason?: string }> {
  const user = await requireAdmin();
  const variant = await prisma.copyVariant.findUnique({ where: { id: copyVariantId } });
  if (!variant) return { ok: false, code: "NOT_FOUND", message: "Variant not found." };
  if (!canActOnFarm(user, variant.farmId)) {
    return { ok: false, code: "FORBIDDEN", message: "Not permitted for this farm." };
  }
  const res = await judgeCopyVariant({ copyVariantId });
  return { ok: res.ok, verdict: res.verdict, reason: res.reason };
}

// --- Human decision + learning ---------------------------------------------

export type CopyDecision = "approve" | "reject" | "edit";

export interface DecideCopyVariantInput {
  copyVariantId: string;
  decision: CopyDecision;
  reason: string;
  editedText?: string;
}

/**
 * Record a HUMAN decision on a variant. A non-empty reason is REQUIRED; farm
 * isolation is enforced; approve/publish (setting status approved/active) is
 * platform_admin-only. This is the ONLY place a variant's status changes — the
 * AI never flips it. ALWAYS writes a HumanDecisionExample (the few-shot
 * accumulation) + an AdminAudit row. Never sets a price.
 */
export async function decideCopyVariant(
  input: DecideCopyVariantInput,
): Promise<CopyActionResult> {
  const user = await requireAdmin();
  const reason = input.reason?.trim() ?? "";
  if (reason.length === 0) {
    return { ok: false, code: "REASON_REQUIRED", message: "A decision reason is required." };
  }
  if (!["approve", "reject", "edit"].includes(input.decision)) {
    return { ok: false, code: "BAD_DECISION", message: "Unknown decision." };
  }

  const variant = await prisma.copyVariant.findUnique({
    where: { id: input.copyVariantId },
    include: { offer: { include: { productDefinition: true } } },
  });
  if (!variant) return { ok: false, code: "NOT_FOUND", message: "Variant not found." };
  if (!canActOnFarm(user, variant.farmId)) {
    return { ok: false, code: "FORBIDDEN", message: "Not permitted for this farm." };
  }

  // Approve/publish (status -> approved/active) is platform_admin-only, mirroring
  // the lifecycle human-only rule. A farm_manager may reject/edit their own
  // farm's variants but cannot approve them.
  if (input.decision === "approve" && user.role !== "platform_admin") {
    return {
      ok: false,
      code: "APPROVE_REQUIRES_PLATFORM_ADMIN",
      message: "Only a platform admin can approve/publish a variant.",
    };
  }

  // Map the human decision to the new status. Edits keep the text updated but
  // leave the variant in a non-published 'pending' state (a human still approves
  // it before it goes live). The AI never performs any of these transitions.
  const nextStatus =
    input.decision === "approve"
      ? "approved"
      : input.decision === "reject"
        ? "rejected"
        : "pending";

  const editedText =
    input.decision === "edit" ? (input.editedText?.trim() ?? "") : null;
  if (input.decision === "edit" && (!editedText || editedText.length === 0)) {
    return { ok: false, code: "EDIT_TEXT_REQUIRED", message: "Edited text is required for an edit." };
  }

  const fromStatus = variant.status;
  await prisma.copyVariant.update({
    where: { id: variant.id },
    data: {
      status: nextStatus,
      ...(editedText ? { text: editedText, source: "human" } : {}),
    },
  });

  // ALWAYS persist the accumulating few-shot example. offerContext captures the
  // structured facts snapshot the decision was about (never a price the AI set).
  const offerContext = JSON.stringify({
    publicName: variant.offer.publicName,
    canonicalName: variant.offer.productDefinition?.canonicalName ?? null,
    maturationDays: variant.offer.maturationDays,
    packagingMethod: variant.offer.packagingMethod,
    storageState: variant.offer.storageState,
    minimumShelfLifeDays: variant.offer.minimumShelfLifeDays,
  });
  await prisma.humanDecisionExample.create({
    data: {
      farmId: variant.farmId,
      locale: variant.locale,
      // Stable id of the variant this decision was about. The agreement metric
      // joins on THIS (not variantText) so an 'edit' — which replaces the
      // variant's text — still matches its own decision.
      copyVariantId: variant.id,
      offerContext,
      // variantText keeps the PRE-decision snapshot (what the human saw) for
      // the audit trail / few-shot replay; it is intentionally NOT the join key.
      variantText: variant.text,
      verdict: input.decision,
      reason,
      editedText,
      decidedByUserId: user.id,
    },
  });

  await recordAdminAudit({
    actor: user,
    action: "copy_variant_decide",
    entityType: "copyVariant",
    entityId: variant.id,
    fromState: fromStatus,
    toState: nextStatus,
    detail: `decision=${input.decision}`,
  });
  revalidateCopy();
  return { ok: true };
}

// --- Judge rules (human-authored) ------------------------------------------

export interface CreateJudgeRuleInput {
  ruleText: string;
  /** null for platform-wide (platform_admin only). */
  farmId?: string | null;
  /** null for all locales. */
  locale?: string | null;
}

/**
 * Create a human-authored PASS/FAIL judge rule. A platform-wide rule
 * (farmId null) is platform_admin-only; a farm_manager may only create a rule
 * scoped to their own farm. The AI never authors a rule.
 */
export async function createJudgeRule(
  input: CreateJudgeRuleInput,
): Promise<CopyActionResult & { ruleId?: string }> {
  const user = await requireAdmin();
  const ruleText = input.ruleText?.trim() ?? "";
  if (ruleText.length === 0) {
    return { ok: false, code: "RULE_TEXT_REQUIRED", message: "Rule text is required." };
  }
  const locale = input.locale ?? null;
  if (locale !== null && !isLocale(locale)) {
    return { ok: false, code: "BAD_LOCALE", message: "Locale must be ca, es or en." };
  }
  const farmId = input.farmId ?? null;

  // Platform-wide rule -> platform_admin only. Farm-scoped rule -> must be the
  // user's own farm (platform_admin may create for any farm).
  if (farmId === null) {
    const admin = await requirePlatformAdmin();
    void admin;
  } else if (!canActOnFarm(user, farmId)) {
    return { ok: false, code: "FORBIDDEN", message: "Not permitted for this farm." };
  }

  const row = await prisma.judgeRule.create({
    data: {
      farmId,
      locale,
      ruleText,
      isActive: true,
      createdByUserId: user.id,
    },
  });
  await recordAdminAudit({
    actor: user,
    action: "copy_judge_rule_create",
    entityType: "judgeRule",
    entityId: row.id,
    detail: `farmId=${farmId ?? "platform"} locale=${locale ?? "all"}`,
  });
  revalidateCopy();
  return { ok: true, ruleId: row.id };
}

/** List the active judge rules visible to the user (own-farm + platform-wide). */
export async function listJudgeRules(): Promise<
  { id: string; farmId: string | null; locale: string | null; ruleText: string }[]
> {
  const user = await requireAdmin();
  const where =
    user.role === "platform_admin"
      ? { isActive: true }
      : { isActive: true, OR: [{ farmId: user.farmId }, { farmId: null }] };
  const rows = await prisma.judgeRule.findMany({ where, orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    farmId: r.farmId,
    locale: r.locale,
    ruleText: r.ruleText,
  }));
}

// --- Experiments ------------------------------------------------------------

export interface StartCopyExperimentInput {
  offerId: string;
  locale: string;
  variantAId: string;
  variantBId: string;
}

/**
 * Start an A/B experiment pairing two APPROVED variants for the same
 * farm/offer/locale. Gated by requireAdmin + farm scope. The AI never starts or
 * decides an experiment.
 */
export async function startCopyExperiment(
  input: StartCopyExperimentInput,
): Promise<CopyActionResult & { experimentId?: string }> {
  const user = await requireAdmin();
  if (!isLocale(input.locale)) {
    return { ok: false, code: "BAD_LOCALE", message: "Locale must be ca, es or en." };
  }
  if (input.variantAId === input.variantBId) {
    return { ok: false, code: "SAME_VARIANT", message: "A and B must differ." };
  }
  const offer = await prisma.farmProductOffer.findUnique({ where: { id: input.offerId } });
  if (!offer) return { ok: false, code: "NOT_FOUND", message: "Offer not found." };
  if (!canActOnFarm(user, offer.farmId)) {
    return { ok: false, code: "FORBIDDEN", message: "Not permitted for this farm." };
  }

  const [a, b] = await Promise.all([
    prisma.copyVariant.findUnique({ where: { id: input.variantAId } }),
    prisma.copyVariant.findUnique({ where: { id: input.variantBId } }),
  ]);
  for (const v of [a, b]) {
    if (!v) return { ok: false, code: "NOT_FOUND", message: "Variant not found." };
    if (
      v.farmProductOfferId !== offer.id ||
      v.farmId !== offer.farmId ||
      v.locale !== input.locale
    ) {
      return { ok: false, code: "VARIANT_MISMATCH", message: "Variant does not match the offer/locale/farm." };
    }
    if (v.status !== "approved") {
      return { ok: false, code: "VARIANT_NOT_APPROVED", message: "Both variants must be approved first." };
    }
  }

  const row = await prisma.copyExperiment.create({
    data: {
      farmProductOfferId: offer.id,
      farmId: offer.farmId,
      locale: input.locale,
      status: "running",
      variantAId: input.variantAId,
      variantBId: input.variantBId,
    },
  });
  await recordAdminAudit({
    actor: user,
    action: "copy_experiment_start",
    entityType: "copyExperiment",
    entityId: row.id,
    detail: `offer=${offer.id} locale=${input.locale}`,
  });
  revalidateCopy();
  return { ok: true, experimentId: row.id };
}

export interface DecideCopyExperimentInput {
  experimentId: string;
  decidedVariantId: string;
  reason: string;
}

/**
 * Decide the winner of a running experiment. Gated by requireAdmin + farm scope;
 * a non-empty reason is required. The winning variant must belong to the
 * experiment. The AI never decides a winner.
 */
export async function decideCopyExperiment(
  input: DecideCopyExperimentInput,
): Promise<CopyActionResult> {
  const user = await requireAdmin();
  const reason = input.reason?.trim() ?? "";
  if (reason.length === 0) {
    return { ok: false, code: "REASON_REQUIRED", message: "A decision reason is required." };
  }
  const exp = await prisma.copyExperiment.findUnique({ where: { id: input.experimentId } });
  if (!exp) return { ok: false, code: "NOT_FOUND", message: "Experiment not found." };
  if (!canActOnFarm(user, exp.farmId)) {
    return { ok: false, code: "FORBIDDEN", message: "Not permitted for this farm." };
  }
  if (input.decidedVariantId !== exp.variantAId && input.decidedVariantId !== exp.variantBId) {
    return { ok: false, code: "BAD_WINNER", message: "Winner must be variant A or B." };
  }

  await prisma.copyExperiment.update({
    where: { id: exp.id },
    data: { status: "decided", decidedVariantId: input.decidedVariantId, endedAt: new Date() },
  });
  await recordAdminAudit({
    actor: user,
    action: "copy_experiment_decide",
    entityType: "copyExperiment",
    entityId: exp.id,
    toState: "decided",
    detail: `winner=${input.decidedVariantId}`,
  });
  revalidateCopy();
  return { ok: true };
}
