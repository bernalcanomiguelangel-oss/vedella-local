"use client";

import { useState, useTransition } from "react";
import {
  proposeCopyAction,
  judgeCopyVariantAction,
} from "@/lib/admin/copy-ab-actions";

/**
 * Admin controls to DRAFT (propose) AI copy variants for an offer+locale and to
 * run the LLM-as-judge over a variant (FEAT-005). Clearly labelled as an AI
 * DRAFT / RECOMMENDATION: the proposer only drafts (status='draft'); the judge
 * only scores. Neither prices, approves, publishes, nor flips status — a human
 * does that via the decision control. The provider key lives only in .env; no
 * secret reaches the browser.
 */
export function CopyProposeControls({
  offerId,
  locale,
  variantIds,
}: {
  offerId: string;
  locale: string;
  variantIds: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function propose() {
    setMessage(null);
    startTransition(async () => {
      const res = await proposeCopyAction(offerId, locale, 2);
      setMessage(
        res.ok
          ? `Esborrany d'IA generat (${res.variantIds?.length ?? 0} variants).`
          : res.message ?? res.code ?? "Error",
      );
    });
  }

  function judgeAll() {
    setMessage(null);
    startTransition(async () => {
      for (const id of variantIds) {
        await judgeCopyVariantAction(id);
      }
      setMessage("Judici (LLM-as-judge) executat sobre les variants.");
    });
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="copy-propose">
      <span className="rounded-full bg-bark-700 px-2 py-0.5 text-xs font-semibold text-cream-50">
        Esborrany / recomanació d&apos;IA
      </span>
      <button
        type="button"
        onClick={propose}
        disabled={pending}
        data-testid="copy-propose-run"
        className="rounded-full bg-bark-700 px-3 py-1 text-xs font-semibold text-cream-50 hover:bg-bark-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 disabled:opacity-50"
      >
        {pending ? "Generant…" : "Proposa variants (IA)"}
      </button>
      {variantIds.length > 0 && (
        <button
          type="button"
          onClick={judgeAll}
          disabled={pending}
          data-testid="copy-judge-run"
          className="rounded-full bg-bark-500 px-3 py-1 text-xs font-semibold text-cream-50 hover:bg-bark-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 disabled:opacity-50"
        >
          Avalua amb el jutge (IA)
        </button>
      )}
      {message && <span className="text-xs text-bark-600">{message}</span>}
    </div>
  );
}
