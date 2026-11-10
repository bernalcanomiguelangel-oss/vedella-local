/**
 * Public-side A/B copy serving (FEAT-005, blob/gemini task).
 *
 * When a CopyExperiment is `running` for an offer+locale, the public marketplace
 * shows one of its two APPROVED variants instead of the base description, and
 * records a `copy_variant_impression` analytics event. The assignment is:
 *
 *   - DETERMINISTIC per anonymous session: the same visitor always sees the same
 *     variant for a given experiment (stable hash of the anon id + experiment
 *     id). This keeps the experience consistent and makes conversion
 *     attribution honest (one session -> one variant).
 *   - PRIVACY-SAFE: the only input is the opaque `vl_anon` session id (no PII)
 *     and the experiment id. Nothing identifying is stored; the impression event
 *     carries an id only.
 *   - SAFE BY CONSTRUCTION: only variants whose status is `approved` (or
 *     `active`) are ever served. If either side of the experiment is not
 *     approved, or no experiment is running, the base description renders
 *     UNCHANGED. The AI never serves copy on its own — a human must have approved
 *     the variant and started the experiment.
 *
 * This module is pure data + a hashing helper; the Next.js page calls
 * `resolveActiveCopyForOffers` with the resolved anon session and then emits the
 * impressions via the existing `recordEvent` helper.
 */
import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

/** Statuses a variant must be in to EVER be served publicly. */
export const SERVEABLE_VARIANT_STATUSES = ["approved", "active"] as const;

export interface ActiveCopyAssignment {
  offerId: string;
  experimentId: string;
  /** The approved variant chosen for this session. */
  copyVariantId: string;
  /** The approved text to render in place of the base description. */
  text: string;
  /** 'A' or 'B' — which arm the session was assigned to (audit/debug only). */
  arm: "A" | "B";
}

/**
 * Deterministically pick arm A or B for an (anonSessionId, experimentId) pair.
 * A stable SHA-256 hash of the two ids keeps a visitor on the same arm for the
 * life of the experiment and splits sessions ~50/50 with no stored state.
 */
export function assignArm(
  anonSessionId: string,
  experimentId: string,
): "A" | "B" {
  const hash = createHash("sha256")
    .update(`${anonSessionId}:${experimentId}`)
    .digest();
  // Use the last byte's low bit for a stable, uniform 50/50 split.
  return (hash[hash.length - 1] & 1) === 0 ? "A" : "B";
}

/**
 * For a set of offer ids + a locale, resolve any running experiment to the
 * APPROVED variant this anonymous session should see. Returns a map keyed by
 * offerId. Offers with no running experiment (or a non-approved variant) are
 * simply absent from the map, so the caller renders the base description.
 *
 * NOTE: this performs reads only and never mutates status. It does NOT emit
 * analytics — the caller does that with the returned assignments so emission
 * stays in the request-scoped analytics helper.
 */
export async function resolveActiveCopyForOffers(
  db: PrismaClient,
  opts: { offerIds: string[]; locale: string; anonSessionId: string },
): Promise<Map<string, ActiveCopyAssignment>> {
  const result = new Map<string, ActiveCopyAssignment>();
  if (opts.offerIds.length === 0) return result;

  const experiments = await db.copyExperiment.findMany({
    where: {
      farmProductOfferId: { in: opts.offerIds },
      locale: opts.locale,
      status: "running",
    },
    include: { variantA: true, variantB: true },
    orderBy: { startedAt: "desc" },
  });

  const serveable = (status: string): boolean =>
    (SERVEABLE_VARIANT_STATUSES as readonly string[]).includes(status);

  for (const exp of experiments) {
    // One running experiment per offer wins (most-recently started). Skip if we
    // already assigned this offer.
    if (result.has(exp.farmProductOfferId)) continue;
    const a = exp.variantA;
    const b = exp.variantB;
    // Only serve when BOTH arms are approved — never expose a draft/pending/
    // rejected variant to the public.
    if (!a || !b || !serveable(a.status) || !serveable(b.status)) continue;

    const arm = assignArm(opts.anonSessionId, exp.id);
    const chosen = arm === "A" ? a : b;
    result.set(exp.farmProductOfferId, {
      offerId: exp.farmProductOfferId,
      experimentId: exp.id,
      copyVariantId: chosen.id,
      text: chosen.text,
      arm,
    });
  }

  return result;
}

/**
 * Conversion attribution helper: given a set of offer ids a session is
 * converting on (e.g. the reserved products) and the session's prior IMPRESSION
 * events, resolve which copyVariantIds the session should be credited with. A
 * conversion is only attributed when the session was ACTUALLY impressed on that
 * variant for that offer (honest attribution: no conversion without a prior
 * impression). Reads impression events for the session so it never needs cookie
 * state beyond the anon id.
 */
export async function resolveConversionVariants(
  db: PrismaClient,
  opts: { offerIds: string[]; anonSessionId: string },
): Promise<{ offerId: string; copyVariantId: string }[]> {
  if (opts.offerIds.length === 0) return [];
  const impressions = await db.analyticsEvent.findMany({
    where: {
      type: "copy_variant_impression",
      anonSessionId: opts.anonSessionId,
      offerId: { in: opts.offerIds },
      copyVariantId: { not: null },
    },
    select: { offerId: true, copyVariantId: true },
    orderBy: { createdAt: "desc" },
  });
  const seen = new Set<string>();
  const out: { offerId: string; copyVariantId: string }[] = [];
  for (const r of impressions) {
    if (!r.offerId || !r.copyVariantId) continue;
    const key = `${r.offerId}:${r.copyVariantId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ offerId: r.offerId, copyVariantId: r.copyVariantId });
  }
  return out;
}
