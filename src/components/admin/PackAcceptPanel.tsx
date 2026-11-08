"use client";

import { useState, useTransition } from "react";
import {
  packAcceptAction,
  packDeclineAction,
  packPublishAction,
} from "@/lib/admin/manage-actions";

interface PackLike {
  id: string;
  publicName: string;
  isMultiFarm: boolean;
  lifecycle: string;
  itemCount: number;
  acceptances: Array<{ farmId: string; farmName: string; accepted: boolean }>;
}

/**
 * Pack panel showing the dual-accept state. Each participating farm's manager
 * can accept/decline its own participation; a platform_admin can publish once
 * all participants have accepted (the server enforces the gate and that the
 * platform cannot force a farm's acceptance).
 */
export function PackAcceptPanel({
  role,
  userFarmId,
  pack,
}: {
  role: string;
  userFarmId: string | null;
  pack: PackLike;
}) {
  const isPlatform = role === "platform_admin";
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const allAccepted = pack.acceptances.every((a) => a.accepted);
  const myAcceptance = pack.acceptances.find((a) => a.farmId === userFarmId);

  function act(fn: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      const res = await fn();
      setMsg(res.ok ? "Fet." : res.message ?? "Error");
    });
  }

  return (
    <div className="rounded-2xl border border-bark-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-bark-900">
          {pack.publicName}{" "}
          {pack.isMultiFarm && (
            <span className="ml-1 rounded-full bg-gold-100 px-2 py-0.5 text-xs text-gold-800">
              multi-granja
            </span>
          )}
        </h3>
        <span className="rounded-full bg-cream-100 px-2 py-0.5 text-xs">
          {pack.lifecycle}
        </span>
      </div>
      <p className="text-xs text-bark-500">{pack.itemCount} elements</p>

      <ul className="mt-2 space-y-1">
        {pack.acceptances.map((a) => (
          <li key={a.farmId} className="flex items-center gap-2 text-sm">
            <span className={a.accepted ? "text-olive-700" : "text-bark-400"}>
              {a.accepted ? "✓" : "○"}
            </span>
            {a.farmName}
            {a.farmId === userFarmId && !a.accepted && role === "farm_manager" && (
              <button
                onClick={() => act(() => packAcceptAction(pack.id, a.farmId))}
                disabled={pending}
                className="ml-2 rounded bg-olive-600 px-2 py-0.5 text-xs text-white"
              >
                Accepta
              </button>
            )}
            {a.farmId === userFarmId && a.accepted && role === "farm_manager" && (
              <button
                onClick={() => act(() => packDeclineAction(pack.id, a.farmId))}
                disabled={pending}
                className="ml-2 rounded bg-red-600 px-2 py-0.5 text-xs text-white"
              >
                Retira
              </button>
            )}
          </li>
        ))}
      </ul>

      {isPlatform && (
        <button
          onClick={() => act(() => packPublishAction(pack.id))}
          disabled={pending || (pack.isMultiFarm && !allAccepted)}
          className="mt-3 rounded-full bg-bark-700 px-4 py-1.5 text-sm font-semibold text-cream-50 disabled:opacity-50"
          title={
            pack.isMultiFarm && !allAccepted
              ? "Totes les granges han d'acceptar primer"
              : undefined
          }
        >
          Publica
        </button>
      )}
      {myAcceptance && role === "farm_manager" && (
        <p className="mt-2 text-xs text-bark-500">
          {myAcceptance.accepted
            ? "Has acceptat la teva participació."
            : "Pendent de la teva acceptació."}
        </p>
      )}
      {msg && <p className="mt-1 text-xs text-olive-700">{msg}</p>}
    </div>
  );
}
