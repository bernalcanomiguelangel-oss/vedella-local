"use server";

/**
 * Server actions for the bounded in-panel AI assistants (FEAT-007, decision 7).
 *
 * These are the ONLY entry points the admin UI uses to (a) run an assistant to
 * get a DRAFT/SUGGESTION and (b) record the required HUMAN accept/edit/reject
 * decision with a reason. They re-authenticate on the server and delegate to the
 * governed service in src/lib/ai/assistants.ts.
 *
 * HARD BOUNDS (enforced by the service + guardrails, reiterated here):
 *  - An assistant NEVER sets a price, NEVER approves/publishes, NEVER changes a
 *    lifecycle/status/role, and NEVER creates a traceability record.
 *  - Untrusted human notes are wrapped as data and cannot change behaviour.
 *  - Every run writes an AiRun + a pending AiAssistantDecision; a human must then
 *    resolve it with a reason (resolveAssistantDecisionAction).
 */
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  runAssistant,
  resolveAssistantDecision,
  type HumanDecision,
} from "@/lib/ai/assistants";
import type { AiAssistantUseCase } from "@/lib/ai/provider";
import { prisma } from "@/lib/db";
import { visibleFarmScope } from "./scope";

export interface AssistantRunResult {
  ok: boolean;
  code?: string;
  decisionId?: string | null;
  suggestion?: unknown;
  injectionSuspected?: boolean;
  strippedFields?: string[];
}

/**
 * Run the farm-profile-draft assistant for a farm. Gathers trusted facts from
 * the DB server-side; the optional note is UNTRUSTED. A farm_manager may only
 * run it for their own farm.
 */
export async function draftFarmProfileAction(
  farmId: string,
  note?: string,
): Promise<AssistantRunResult> {
  const user = await requireAdmin();
  const scope = visibleFarmScope(user);
  if (scope !== null && !scope.includes(farmId)) {
    return { ok: false, code: "FORBIDDEN" };
  }
  const farm = await prisma.farm.findUnique({ where: { id: farmId } });
  if (!farm) return { ok: false, code: "NOT_FOUND" };

  const res = await runAssistant(
    "farmProfileDraft",
    {
      facts: {
        name: farm.name,
        town: farm.town,
        comarca: farm.comarca,
        breed: farm.breed,
        foundedYear: farm.foundedYear,
        animalCount: farm.animalCount,
      },
      inputRef: `farm:${farm.id}`,
      untrustedNote: note,
    },
    { farmId: farm.id },
  );
  revalidatePath("/admin/farms");
  revalidatePath("/admin/audit");
  return {
    ok: res.ok,
    decisionId: res.decisionId,
    suggestion: res.suggestion,
    injectionSuspected: res.injectionSuspected,
    strippedFields: res.strippedFields,
  };
}

/** Generic runner for the remaining assistants (admin-only; platform-level). */
export async function runAssistantAction(
  useCase: Exclude<AiAssistantUseCase, "farmProfileDraft">,
  inputRef: string,
  facts: Record<string, string | number | null>,
  note?: string,
): Promise<AssistantRunResult> {
  await requireAdmin();
  // These assistants operate on platform-level data the admin already sees; the
  // facts are resolved by the caller page from the DB. We still never trust the
  // note (wrapped as data) and never mutate priced/approval/traceability rows.
  // The metricsAnalyst assistant takes OBSERVED, server-computed averages. We
  // recompute them here (never invented) and pass the real numbers, so the
  // assistant only narrates figures it is handed.
  let input: Parameters<typeof runAssistant>[1];
  if (useCase === "metricsAnalyst") {
    const { loadMetricsDashboard } = await import("./metrics-data");
    const weekStart = String(facts.weekStart ?? "");
    const ref =
      weekStart && !Number.isNaN(new Date(weekStart).getTime())
        ? new Date(weekStart)
        : new Date();
    const weekly = await loadMetricsDashboard(ref);
    input = {
      facts,
      inputRef,
      untrustedNote: note,
      weekStart: weekly.weekStart,
      perCut: weekly.perCut.map((c) => ({
        cutName: c.cutName,
        avgPriceCents: c.avgPriceCents,
        sampleCount: c.sampleCount,
      })),
    } as unknown as Parameters<typeof runAssistant>[1];
  } else {
    input = {
      facts,
      inputRef,
      untrustedNote: note,
      ...(useCase === "offerCompare"
        ? { definitionName: String(facts.definitionName ?? ""), offers: [] }
        : {}),
      ...(useCase === "traceabilityReview"
        ? {
            chain: {
              farmName: String(facts.farmName ?? ""),
              lotReference: facts.lotReference ? String(facts.lotReference) : null,
              offerName: facts.offerName ? String(facts.offerName) : null,
              packName: facts.packName ? String(facts.packName) : null,
            },
          }
        : {}),
    } as Parameters<typeof runAssistant>[1];
  }
  const res = await runAssistant(useCase, input);
  revalidatePath("/admin/audit");
  return {
    ok: res.ok,
    decisionId: res.decisionId,
    suggestion: res.suggestion,
    injectionSuspected: res.injectionSuspected,
    strippedFields: res.strippedFields,
  };
}

/**
 * Record the REQUIRED human decision (accept/edit/reject) plus a reason on an
 * assistant suggestion. This updates the AiAssistantDecision only; it never
 * applies the suggestion to a priced/approved/traceability record.
 */
export async function resolveAssistantDecisionAction(
  decisionId: string,
  decision: HumanDecision,
  reason: string,
): Promise<{ ok: boolean; code?: string; message?: string }> {
  const user = await requireAdmin();
  const res = await resolveAssistantDecision({
    decisionId,
    decision,
    reason,
    decidedByUserId: user.id,
    decidedByEmail: user.email,
  });
  revalidatePath("/admin/audit");
  return res;
}
