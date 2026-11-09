/**
 * Bounded in-panel AI assistants service (FEAT-007, decision 7 / R-AI1/R-AI2).
 *
 * The five assistants only DRAFT or SUGGEST copy/insights for a human to
 * accept/edit/reject. They are governed by exactly the same boundary as the
 * other AI use cases:
 *  - server-side only, behind a per-assistant feature flag;
 *  - deterministic MockAiProvider by default so the app runs offline zero-config;
 *  - output validated against a strict Zod schema (schemas.ts) AND passed through
 *    the guardrail filter (guardrails.ts) that strips any price/approval/
 *    lifecycle/status/role field at any depth and scans for WTP-proxy wording;
 *  - all untrusted human/document text is wrapped as DATA (sanitize.ts) before a
 *    model sees it and can never change roles/permissions/status/prices;
 *  - every run writes an AiRun audit row (prompt+model version + input ref) AND
 *    an AiAssistantDecision row that a HUMAN must later resolve with an explicit
 *    accept/edit/reject decision and a reason.
 *
 * CRITICAL: nothing here ever writes a price, an approval, a lifecycle/status
 * change, or a traceability record. The service persists ONLY the AiRun and the
 * pending AiAssistantDecision (a JSON suggestion blob). Acting on a suggestion
 * is a separate, human-driven action elsewhere.
 */
import { prisma } from "@/lib/db";
import {
  getAiProvider,
  type AiAssistantUseCase,
  type AssistantFacts,
  type OfferCompareFacts,
  type TraceabilityFacts,
  type MetricsInput,
} from "./provider";
import {
  AssistantOutputSchema,
  type AssistantOutput,
} from "./schemas";
import { applyGuardrails } from "./guardrails";
import { looksLikeInjection } from "./sanitize";
import { recordAiRun } from "./audit";

export type AssistantOutcome = "ok" | "invalid" | "error";

export interface RunAssistantResult {
  ok: boolean;
  outcome: AssistantOutcome;
  /** The guardrail-filtered, schema-valid suggestion (null on invalid/error). */
  suggestion: AssistantOutput | null;
  /** The created pending AiAssistantDecision id (null when nothing was stored). */
  decisionId: string | null;
  /** True when an injected instruction was detected in the untrusted note. */
  injectionSuspected: boolean;
  /** Fields the guardrail stripped (price/approval/etc.), for the audit trail. */
  strippedFields: string[];
}

/** Map an assistant use case to the provider method that produces its output. */
async function callProvider(
  useCase: AiAssistantUseCase,
  input: AssistantFacts | OfferCompareFacts | TraceabilityFacts | MetricsInput,
): Promise<{ raw: unknown; provider: Awaited<ReturnType<typeof getAiProvider>> }> {
  const provider = await getAiProvider(useCase);
  const p = provider.provider;
  let raw: unknown;
  switch (useCase) {
    case "farmProfileDraft":
      raw = await p.draftFarmProfile(input as AssistantFacts);
      break;
    case "offerCompare":
      raw = await p.compareOffers(input as OfferCompareFacts);
      break;
    case "traceabilityReview":
      raw = await p.reviewTraceability(input as TraceabilityFacts);
      break;
    case "metricsAnalyst":
      raw = await p.analyzeMetrics(input as MetricsInput);
      break;
    case "cycleRecommendation":
      raw = await p.recommendCycle(input as AssistantFacts);
      break;
  }
  return { raw, provider };
}

function untrustedNoteOf(
  input: AssistantFacts | OfferCompareFacts | TraceabilityFacts | MetricsInput,
): string | undefined {
  return (input as AssistantFacts).untrustedNote;
}

function inputRefOf(
  useCase: AiAssistantUseCase,
  input: AssistantFacts | OfferCompareFacts | TraceabilityFacts | MetricsInput,
): string {
  const ref = (input as AssistantFacts).inputRef;
  return ref ?? `${useCase}:unknown`;
}

/**
 * Run one assistant. Validates + guardrails the output, writes an AiRun audit
 * row and a PENDING AiAssistantDecision. Never writes a price/approval/
 * traceability row. On invalid/hostile output it falls back safely (null
 * suggestion) and still audits.
 */
export async function runAssistant(
  useCase: AiAssistantUseCase,
  input: AssistantFacts | OfferCompareFacts | TraceabilityFacts | MetricsInput,
  options: { farmId?: string | null } = {},
): Promise<RunAssistantResult> {
  const inputRef = inputRefOf(useCase, input);
  const note = untrustedNoteOf(input);
  const injectionSuspected = !!note && looksLikeInjection(note);

  let outcome: AssistantOutcome = "ok";
  let outputValid = false;
  let suggestion: AssistantOutput | null = null;
  let strippedFields: string[] = [];
  let providerName = "mock";
  let model = "mock-deterministic-v1";
  let promptVersion = "mock-1";
  let flagEnabled = false;

  try {
    const { raw, provider } = await callProvider(useCase, input);
    providerName = provider.provider.name;
    model = provider.provider.model;
    promptVersion = provider.provider.promptVersion;
    flagEnabled = provider.flagEnabled;

    // Defence in depth: strict Zod parse at the boundary (drops unknown keys a
    // hostile model added) THEN the guardrail filter (strips any price/approval/
    // lifecycle/status/role field at any depth + scans WTP-proxy wording).
    const parsed = AssistantOutputSchema.safeParse(raw);
    if (!parsed.success) {
      outcome = "invalid";
    } else {
      outputValid = true;
      const { value: safe, report } = applyGuardrails(parsed.data);
      strippedFields = report.strippedFields;
      // Re-validate AFTER guardrails so the stored blob is still schema-valid
      // (guardrails only strip never-allowed fields; the shape is preserved).
      const revalidated = AssistantOutputSchema.safeParse(safe);
      suggestion = revalidated.success ? revalidated.data : safe;
    }
  } catch (err) {
    outcome = "error";
    console.error(
      `[ai-assistant:${useCase}] provider error:`,
      err instanceof Error ? err.message : "unknown error",
    );
  }

  const aiRunId = await recordAiRun({
    useCase,
    provider: providerName,
    model,
    promptVersion,
    flagEnabled,
    inputRef,
    outputValid,
    outcome: outcome === "ok" ? "ok" : outcome,
  });

  let decisionId: string | null = null;
  if (suggestion) {
    // Persist ONLY a pending decision + the JSON suggestion. No price/approval/
    // traceability row is ever created here — that is a separate human action.
    const row = await prisma.aiAssistantDecision.create({
      data: {
        assistant: useCase,
        inputRef,
        suggestionJson: JSON.stringify(suggestion),
        aiRunId: aiRunId ?? undefined,
        decision: "pending",
        farmId: options.farmId ?? null,
      },
    });
    decisionId = row.id;
  }

  return {
    ok: outcome === "ok",
    outcome,
    suggestion,
    decisionId,
    injectionSuspected,
    strippedFields,
  };
}

export type HumanDecision = "accepted" | "edited" | "rejected";

export interface ResolveDecisionInput {
  decisionId: string;
  decision: HumanDecision;
  reason: string;
  decidedByUserId: string;
  decidedByEmail: string;
}

export interface ResolveDecisionResult {
  ok: boolean;
  code?: string;
  message?: string;
}

/**
 * Record a HUMAN decision on an assistant suggestion. A decision + a non-empty
 * reason are REQUIRED (the assistant never decides for itself). This updates the
 * AiAssistantDecision row only; it never applies the suggestion to any priced/
 * approved/traceability record.
 */
export async function resolveAssistantDecision(
  input: ResolveDecisionInput,
): Promise<ResolveDecisionResult> {
  if (!["accepted", "edited", "rejected"].includes(input.decision)) {
    return { ok: false, code: "BAD_DECISION", message: "Unknown decision." };
  }
  const reason = input.reason?.trim() ?? "";
  if (reason.length === 0) {
    // A human reason is mandatory for every accept/edit/reject.
    return {
      ok: false,
      code: "REASON_REQUIRED",
      message: "A decision reason is required.",
    };
  }
  const row = await prisma.aiAssistantDecision.findUnique({
    where: { id: input.decisionId },
  });
  if (!row) {
    return { ok: false, code: "NOT_FOUND", message: "Unknown decision." };
  }
  await prisma.aiAssistantDecision.update({
    where: { id: input.decisionId },
    data: {
      decision: input.decision,
      decisionReason: reason,
      decidedByUserId: input.decidedByUserId,
      decidedByEmail: input.decidedByEmail,
      decidedAt: new Date(),
    },
  });
  return { ok: true };
}
