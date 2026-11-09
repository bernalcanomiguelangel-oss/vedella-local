"use client";

import { useState, useTransition } from "react";
import { cycleTransitionAction } from "@/lib/admin/manage-actions";

type Status = "open" | "closed" | "fulfilling" | "fulfilled" | "cancelled" | "archived";

export function CycleRow({
  isPlatform,
  cycle,
}: {
  isPlatform: boolean;
  cycle: {
    id: string;
    name: string;
    zone: string;
    status: string;
    closeDate: string;
    totalPlaces: number;
    freePlaces: number;
    orderCount: number;
    farms: Array<{ id: string; name: string }>;
    ineligibleOffers: number;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function transition(to: Status) {
    startTransition(async () => {
      const res = await cycleTransitionAction(cycle.id, to);
      setMsg(res.ok ? `Estat: ${to}` : res.message ?? "Error");
    });
  }

  return (
    <div className="rounded-2xl border border-bark-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-bark-900">
          {cycle.name}{" "}
          <span className="text-xs font-normal text-bark-500">· {cycle.zone}</span>
        </h3>
        <span className="rounded-full bg-cream-100 px-2 py-0.5 text-xs">{cycle.status}</span>
      </div>
      <p className="mt-1 text-sm text-bark-600">
        {cycle.freePlaces}/{cycle.totalPlaces} places lliures · tanca {cycle.closeDate} ·{" "}
        {cycle.orderCount} comandes
      </p>
      <p className="mt-1 text-xs text-bark-500">
        Granges: {cycle.farms.map((f) => f.name).join(", ") || "cap"}
      </p>
      {cycle.ineligibleOffers > 0 && (
        <p className="mt-1 text-xs text-red-600">
          {cycle.ineligibleOffers} oferta(es) sense lot elegible
        </p>
      )}

      {isPlatform && (
        <div className="mt-3 flex flex-wrap gap-2">
          {(["open", "closed", "fulfilling", "fulfilled", "cancelled", "archived"] as Status[]).map(
            (s) => (
              <button
                key={s}
                onClick={() => transition(s)}
                disabled={pending}
                className="rounded border border-bark-300 px-2 py-1 text-xs hover:bg-cream-100 disabled:opacity-50"
              >
                {s}
              </button>
            ),
          )}
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-olive-700">{msg}</p>}
    </div>
  );
}
