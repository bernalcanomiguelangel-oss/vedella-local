"use client";

/**
 * Review-queue UI. Renders pending farms/products and machine translations, and
 * wires the human approve/reject/edit controls to the server actions. All
 * authorisation and auditing happen on the server inside those actions; this
 * component is purely a presentation + trigger layer.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  transitionLifecycle,
  approveTranslation,
  rejectTranslation,
  editAndApproveTranslation,
} from "@/lib/admin/actions";
import type {
  AdminFarmRow,
  AdminProductRow,
  PendingTranslationRow,
} from "@/lib/admin/data";
import type { Role } from "@/lib/auth";

function StateBadge({ state }: { state: string }) {
  return (
    <span className="rounded-full bg-pasture-100 px-2 py-0.5 text-xs font-semibold text-pasture-700">
      {state}
    </span>
  );
}

export function ReviewQueue({
  role,
  pendingFarms,
  pendingProducts,
  translations,
}: {
  role: Role;
  pendingFarms: AdminFarmRow[];
  pendingProducts: AdminProductRow[];
  translations: PendingTranslationRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const isPlatform = role === "platform_admin";

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.message ?? "Acció no permesa.");
      router.refresh();
    });
  }

  const nothing =
    pendingFarms.length === 0 &&
    pendingProducts.length === 0 &&
    translations.length === 0;

  return (
    <div className="mt-6 space-y-8">
      {error && (
        <p className="rounded-lg bg-beef-50 p-3 text-sm text-beef-800 ring-1 ring-beef-200">
          {error}
        </p>
      )}

      {nothing && (
        <p className="rounded-2xl bg-cream-50 p-6 text-pasture-600 ring-1 ring-pasture-100">
          No hi ha res pendent de revisió ara mateix.
        </p>
      )}

      {/* Pending products */}
      {pendingProducts.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Productes pendents</h2>
          <ul className="space-y-3">
            {pendingProducts.map((p) => (
              <li
                key={p.id}
                data-testid="pending-product"
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream-50 p-4 shadow-sm ring-1 ring-pasture-100"
              >
                <div>
                  <p className="font-semibold">
                    {p.name}{" "}
                    <span className="text-sm font-normal text-pasture-500">
                      · {p.farmName} · {p.priceLabel}
                    </span>
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-xs">
                    <StateBadge state={p.lifecycle} />
                    <span className="text-pasture-400">
                      aprovat: {p.isApproved ? "sí" : "no"} · actiu:{" "}
                      {p.isActive ? "sí" : "no"}
                    </span>
                  </p>
                </div>
                <div className="flex gap-2">
                  {isPlatform ? (
                    <>
                      <button
                        type="button"
                        disabled={isPending}
                        data-testid="approve-product"
                        onClick={() =>
                          run(() =>
                            transitionLifecycle("product", p.id, "approved"),
                          )
                        }
                        className="rounded-full bg-pasture-600 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-pasture-700 disabled:opacity-50"
                      >
                        Aprova
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        data-testid="reject-product"
                        onClick={() =>
                          run(() =>
                            transitionLifecycle("product", p.id, "rejected"),
                          )
                        }
                        className="rounded-full bg-beef-100 px-4 py-2 text-sm font-semibold text-beef-800 hover:bg-beef-200 disabled:opacity-50"
                      >
                        Rebutja
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-pasture-400">
                      Pendent d&apos;aprovació de la plataforma
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Pending farms */}
      {pendingFarms.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Granges pendents</h2>
          <ul className="space-y-3">
            {pendingFarms.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream-50 p-4 shadow-sm ring-1 ring-pasture-100"
              >
                <div>
                  <p className="font-semibold">{f.name}</p>
                  <p className="mt-1">
                    <StateBadge state={f.lifecycle} />
                  </p>
                </div>
                {isPlatform && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        run(() => transitionLifecycle("farm", f.id, "approved"))
                      }
                      className="rounded-full bg-pasture-600 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-pasture-700 disabled:opacity-50"
                    >
                      Aprova
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        run(() => transitionLifecycle("farm", f.id, "rejected"))
                      }
                      className="rounded-full bg-beef-100 px-4 py-2 text-sm font-semibold text-beef-800 hover:bg-beef-200 disabled:opacity-50"
                    >
                      Rebutja
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Machine translations */}
      {translations.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">
            Traduccions generades per IA (màquina)
          </h2>
          <p className="mb-3 text-xs text-pasture-500">
            Revisa-les i, si cal, edita-les abans de publicar-les. Fins que no
            s&apos;aproven, no es mostren al mercat.
          </p>
          <ul className="space-y-3">
            {translations.map((t) => (
              <li
                key={t.id}
                data-testid="pending-translation"
                className="rounded-2xl bg-cream-50 p-4 shadow-sm ring-1 ring-pasture-100"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-pasture-500">
                  <span className="rounded-full bg-pasture-100 px-2 py-0.5 font-semibold uppercase">
                    {t.locale}
                  </span>
                  <span>
                    {t.entityType} · {t.field}
                    {t.farmName ? ` · ${t.farmName}` : ""}
                  </span>
                  <StateBadge state={t.status} />
                </div>

                {t.sourceText && (
                  <p className="mt-2 text-xs text-pasture-500">
                    <span className="font-semibold">Original (ca):</span>{" "}
                    {t.sourceText}
                  </p>
                )}

                <textarea
                  defaultValue={t.text}
                  onChange={(e) =>
                    setEdits((s) => ({ ...s, [t.id]: e.target.value }))
                  }
                  data-testid="translation-text"
                  className="mt-2 w-full rounded-lg border border-pasture-200 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-pasture-400"
                  rows={2}
                />

                {isPlatform ? (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      data-testid="approve-translation"
                      onClick={() =>
                        run(() => {
                          const edited = edits[t.id];
                          return edited !== undefined && edited !== t.text
                            ? editAndApproveTranslation(t.id, edited)
                            : approveTranslation(t.id);
                        })
                      }
                      className="rounded-full bg-pasture-600 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-pasture-700 disabled:opacity-50"
                    >
                      Aprova i publica
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      data-testid="reject-translation"
                      onClick={() => run(() => rejectTranslation(t.id))}
                      className="rounded-full bg-beef-100 px-4 py-2 text-sm font-semibold text-beef-800 hover:bg-beef-200 disabled:opacity-50"
                    >
                      Rebutja
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-pasture-400">
                    Només la plataforma pot aprovar traduccions.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
