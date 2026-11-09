"use client";

import { useState, useTransition } from "react";
import {
  draftFarmProfileAction,
  runAssistantAction,
  resolveAssistantDecisionAction,
  type AssistantRunResult,
} from "@/lib/admin/assistant-actions";

type AssistantKind =
  | "farmProfileDraft"
  | "offerCompare"
  | "traceabilityReview"
  | "metricsAnalyst"
  | "cycleRecommendation";

/**
 * Generic in-panel AI-assistant widget (FEAT-007, decision 7).
 *
 * It makes the bound crystal clear in the UI: the assistant ONLY drafts/
 * suggests; it NEVER prices, approves, publishes or creates traceability, and a
 * HUMAN must accept/edit/reject the suggestion WITH a reason before anything is
 * used. The real provider key is configured only in the git-ignored .env; this
 * widget never shows or sends any secret.
 */
export function AssistantPanel({
  kind,
  title,
  farmId,
  inputRef,
  facts,
}: {
  kind: AssistantKind;
  title: string;
  /** For farmProfileDraft. */
  farmId?: string;
  /** For the platform-level assistants. */
  inputRef?: string;
  facts?: Record<string, string | number | null>;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AssistantRunResult | null>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [decided, setDecided] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    setDecided(null);
    startTransition(async () => {
      let res: AssistantRunResult;
      if (kind === "farmProfileDraft" && farmId) {
        res = await draftFarmProfileAction(farmId, note || undefined);
      } else {
        res = await runAssistantAction(
          kind as Exclude<AssistantKind, "farmProfileDraft">,
          inputRef ?? `${kind}:unknown`,
          facts ?? {},
          note || undefined,
        );
      }
      setResult(res);
    });
  }

  function decide(decision: "accepted" | "edited" | "rejected") {
    if (!result?.decisionId) return;
    if (reason.trim().length === 0) {
      setError("Cal un motiu per a la decisió.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await resolveAssistantDecisionAction(
        result.decisionId!,
        decision,
        reason,
      );
      if (res.ok) {
        setDecided(decision);
      } else {
        setError(res.message ?? res.code ?? "Error");
      }
    });
  }

  return (
    <section
      className="mt-6 rounded-2xl border border-dashed border-bark-300 bg-cream-50 p-4"
      data-testid={`assistant-${kind}`}
    >
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-bark-700 px-2 py-0.5 text-xs font-semibold text-cream-50">
          Assistent d&apos;IA
        </span>
        <h3 className="font-semibold text-bark-900">{title}</h3>
      </div>
      <p className="mt-2 rounded-lg bg-white p-2 text-xs text-bark-600">
        Aquest assistent només <strong>redacta esborranys / suggeriments</strong>. No fixa
        preus, no aprova ni publica res i no crea traçabilitat. Un humà ha
        d&apos;<strong>acceptar, editar o rebutjar</strong> la proposta amb un motiu. La clau del
        proveïdor real només es configura al fitxer <code>.env</code> (ignorat per git,
        variable <code>AI_API_KEY</code>); cap secret arriba al navegador.
      </p>

      <label className="mt-3 block text-xs font-medium text-bark-700">
        Nota opcional (es tracta com a dades, mai com a instruccions)
        <textarea
          className="mt-1 w-full rounded-lg border border-bark-200 p-2 text-sm"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          data-testid="assistant-note"
        />
      </label>

      <button
        type="button"
        onClick={run}
        disabled={pending}
        data-testid="assistant-run"
        className="mt-2 rounded-full bg-bark-700 px-4 py-1.5 text-sm font-semibold text-cream-50 hover:bg-bark-800 disabled:opacity-50"
      >
        {pending ? "Generant…" : "Genera un esborrany"}
      </button>

      {result && result.ok && result.suggestion != null && (
        <div className="mt-3" data-testid="assistant-suggestion">
          {result.injectionSuspected && (
            <p className="mb-2 rounded bg-beef-100 px-2 py-1 text-xs text-beef-800">
              S&apos;ha detectat una possible instrucció a la nota; s&apos;ha ignorat i
              tractat com a dades.
            </p>
          )}
          {result.strippedFields && result.strippedFields.length > 0 && (
            <p className="mb-2 rounded bg-cream-100 px-2 py-1 text-xs text-bark-600">
              Camps bloquejats pel filtre de seguretat: {result.strippedFields.join(", ")}.
            </p>
          )}
          <pre className="max-h-60 overflow-auto rounded-lg bg-white p-2 text-xs text-bark-800">
            {JSON.stringify(result.suggestion, null, 2)}
          </pre>

          {decided ? (
            <p className="mt-2 text-sm font-semibold text-olive-700">
              Decisió registrada: {decided}.
            </p>
          ) : (
            <div className="mt-2">
              <label className="block text-xs font-medium text-bark-700">
                Motiu de la decisió (obligatori)
                <input
                  className="mt-1 w-full rounded-lg border border-bark-200 p-2 text-sm"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  data-testid="assistant-reason"
                />
              </label>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => decide("accepted")}
                  disabled={pending}
                  data-testid="assistant-accept"
                  className="rounded-full bg-olive-600 px-3 py-1 text-xs font-semibold text-cream-50 hover:bg-olive-700 disabled:opacity-50"
                >
                  Accepta
                </button>
                <button
                  type="button"
                  onClick={() => decide("edited")}
                  disabled={pending}
                  className="rounded-full bg-bark-600 px-3 py-1 text-xs font-semibold text-cream-50 hover:bg-bark-700 disabled:opacity-50"
                >
                  Edita
                </button>
                <button
                  type="button"
                  onClick={() => decide("rejected")}
                  disabled={pending}
                  data-testid="assistant-reject"
                  className="rounded-full bg-beef-600 px-3 py-1 text-xs font-semibold text-cream-50 hover:bg-beef-700 disabled:opacity-50"
                >
                  Rebutja
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-beef-700">{error}</p>}
    </section>
  );
}
