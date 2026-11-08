"use client";

/**
 * Human trigger for the weekly metrics job. Persists MarketPriceSnapshot rows
 * via the audited server action. The AI only phrases a headline; it never sets
 * any price.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runWeeklyMetricsAction } from "@/lib/admin/actions";

export function RunMetricsButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run() {
    setMsg(null);
    startTransition(async () => {
      const res = await runWeeklyMetricsAction();
      setMsg(res.ok ? "Snapshots actualitzats." : `Resultat: ${res.code}`);
      router.refresh();
    });
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={run}
        disabled={isPending}
        data-testid="run-metrics"
        className="rounded-full bg-beef-600 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-beef-700 disabled:opacity-50"
      >
        {isPending ? "Executant…" : "Executa la feina setmanal"}
      </button>
      {msg && <p className="mt-1 text-xs text-pasture-500">{msg}</p>}
    </div>
  );
}
