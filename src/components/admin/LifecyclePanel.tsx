"use client";

/**
 * Lifecycle management UI. For each farm/product it shows the current state and
 * the legal next states (from the shared lifecycle machine). Clicking a target
 * calls the human-only server action, which re-checks auth/scope and audits.
 *
 * The approval-separate-from-active rule is visible here: `approved` and
 * `active` are distinct targets, and `active` is only offered from an approved/
 * inactive state.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { transitionLifecycle, requestTranslation } from "@/lib/admin/actions";
import { allowedTransitions } from "@/lib/admin/lifecycle";
import type { AdminFarmRow, AdminProductRow } from "@/lib/admin/data";
import type { Role } from "@/lib/auth";

const PLATFORM_ONLY = new Set(["approved", "active"]);

function Flags({ approved, active }: { approved: boolean; active: boolean }) {
  return (
    <span className="text-xs text-pasture-400">
      aprovat: <b>{approved ? "sí" : "no"}</b> · actiu:{" "}
      <b>{active ? "sí" : "no"}</b>
    </span>
  );
}

function Row({
  entityType,
  id,
  name,
  extra,
  lifecycle,
  isApproved,
  isActive,
  role,
}: {
  entityType: "farm" | "product";
  id: string;
  name: string;
  extra?: string;
  lifecycle: string;
  isApproved: boolean;
  isActive: boolean;
  role: Role;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const targets = allowedTransitions(lifecycle);
  const isPlatform = role === "platform_admin";

  function go(to: string) {
    setError(null);
    startTransition(async () => {
      const res = await transitionLifecycle(entityType, id, to);
      if (!res.ok) setError(res.message ?? "No permès.");
      router.refresh();
    });
  }

  function translate() {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const res = await requestTranslation(entityType, id, "name", name);
      setNote(
        res.ok
          ? "Traduccions generades (màquina). Revisa-les a la cua de revisió."
          : `Traducció: ${res.code}`,
      );
      router.refresh();
    });
  }

  return (
    <li
      data-testid={`lifecycle-${entityType}`}
      className="rounded-2xl bg-cream-50 p-4 shadow-sm ring-1 ring-pasture-100"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">
            {name}
            {extra && (
              <span className="text-sm font-normal text-pasture-500">
                {" "}
                · {extra}
              </span>
            )}
          </p>
          <p className="mt-1 flex items-center gap-2 text-xs">
            <span
              data-testid="current-state"
              className="rounded-full bg-pasture-100 px-2 py-0.5 font-semibold text-pasture-700"
            >
              {lifecycle}
            </span>
            <Flags approved={isApproved} active={isActive} />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {targets.length === 0 && (
            <span className="text-xs text-pasture-400">Sense transicions</span>
          )}
          {targets.map((to) => {
            const blocked = PLATFORM_ONLY.has(to) && !isPlatform;
            return (
              <button
                key={to}
                type="button"
                disabled={isPending || blocked}
                title={
                  blocked ? "Només la plataforma pot aprovar/publicar" : undefined
                }
                data-testid={`to-${to}`}
                onClick={() => go(to)}
                className="rounded-full bg-pasture-200 px-3 py-1.5 text-xs font-semibold text-pasture-800 hover:bg-pasture-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                → {to}
              </button>
            );
          })}
          <button
            type="button"
            disabled={isPending}
            data-testid="request-translation"
            onClick={translate}
            className="rounded-full bg-cream-100 px-3 py-1.5 text-xs font-semibold text-pasture-700 ring-1 ring-pasture-200 hover:bg-cream-50 disabled:opacity-40"
          >
            Tradueix amb IA
          </button>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-xs font-medium text-beef-700">{error}</p>
      )}
      {note && <p className="mt-2 text-xs text-pasture-500">{note}</p>}
    </li>
  );
}

export function LifecyclePanel({
  role,
  farms,
  products,
}: {
  role: Role;
  farms: AdminFarmRow[];
  products: AdminProductRow[];
}) {
  return (
    <div className="mt-6 space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-bold">Granges</h2>
        <ul className="space-y-3">
          {farms.map((f) => (
            <Row
              key={f.id}
              entityType="farm"
              id={f.id}
              name={f.name}
              lifecycle={f.lifecycle}
              isApproved={f.isApproved}
              isActive={f.isActive}
              role={role}
            />
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Productes</h2>
        <ul className="space-y-3">
          {products.map((p) => (
            <Row
              key={p.id}
              entityType="product"
              id={p.id}
              name={p.name}
              extra={`${p.farmName} · ${p.priceLabel}`}
              lifecycle={p.lifecycle}
              isApproved={p.isApproved}
              isActive={p.isActive}
              role={role}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
