"use client";

/**
 * Extended review queue (FEAT-004): offers, lots, certifications, farm-profile
 * edits and packs awaiting human review. Only a platform_admin sees the
 * approve/reject controls; a farm_manager sees their own pending items as
 * read-only (the approval is the platform's). All authorisation + auditing is
 * enforced server-side in the actions. AI never appears as an approver here.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  certApproveAction,
  certRejectAction,
  profileApproveAction,
  profileRejectAction,
  packPublishAction,
} from "@/lib/admin/manage-actions";
import { transitionLifecycle } from "@/lib/admin/actions";

interface Item {
  id: string;
  label: string;
  sublabel?: string;
}

export function ExtendedReviewQueue({
  isPlatform,
  offers,
  lots,
  certs,
  profileEdits,
  packs,
}: {
  isPlatform: boolean;
  offers: Item[];
  lots: Item[];
  certs: Item[];
  profileEdits: Item[];
  packs: Item[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      const res = await fn();
      setMsg(res.ok ? "Fet." : res.message ?? "Error");
      router.refresh();
    });
  }

  const Section = ({
    title,
    items,
    render,
  }: {
    title: string;
    items: Item[];
    render: (i: Item) => React.ReactNode;
  }) => (
    <section className="mt-5">
      <h3 className="font-semibold text-bark-800">
        {title} <span className="text-xs text-bark-500">({items.length})</span>
      </h3>
      <ul className="mt-2 space-y-1">
        {items.map((i) => (
          <li
            key={i.id}
            className="flex items-center justify-between rounded-lg bg-cream-50 px-3 py-2 text-sm"
          >
            <span>
              {i.label}
              {i.sublabel && <span className="ml-1 text-xs text-bark-500">{i.sublabel}</span>}
            </span>
            {isPlatform && render(i)}
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-xs text-bark-400">Res pendent.</li>
        )}
      </ul>
    </section>
  );

  return (
    <div className="mt-8 rounded-2xl border border-bark-200 bg-white p-4">
      <h2 className="font-display text-lg font-bold text-bark-900">
        Cua de revisió ampliada
      </h2>
      <p className="text-xs text-bark-500">
        Ofertes, lots, certificacions, canvis de perfil i packs pendents. Només
        la plataforma aprova.
      </p>

      <Section
        title="Ofertes"
        items={offers}
        render={(i) => (
          <span className="flex gap-2">
            <button
              onClick={() => run(() => transitionLifecycle("product", i.id, "approved"))}
              disabled={pending}
              className="rounded bg-olive-600 px-2 py-0.5 text-xs text-white"
            >
              Aprova
            </button>
          </span>
        )}
      />
      <Section
        title="Lots (traçabilitat)"
        items={lots}
        render={() => <span className="text-xs text-bark-400">via l&apos;oferta</span>}
      />
      <Section
        title="Certificacions"
        items={certs}
        render={(i) => (
          <span className="flex gap-2">
            <button
              onClick={() => run(() => certApproveAction(i.id))}
              disabled={pending}
              className="rounded bg-olive-600 px-2 py-0.5 text-xs text-white"
            >
              Aprova
            </button>
            <button
              onClick={() => run(() => certRejectAction(i.id, "Rebutjada"))}
              disabled={pending}
              className="rounded bg-red-600 px-2 py-0.5 text-xs text-white"
            >
              Rebutja
            </button>
          </span>
        )}
      />
      <Section
        title="Canvis de perfil"
        items={profileEdits}
        render={(i) => (
          <span className="flex gap-2">
            <button
              onClick={() => run(() => profileApproveAction(i.id))}
              disabled={pending}
              className="rounded bg-olive-600 px-2 py-0.5 text-xs text-white"
            >
              Aprova
            </button>
            <button
              onClick={() => run(() => profileRejectAction(i.id, "Rebutjat"))}
              disabled={pending}
              className="rounded bg-red-600 px-2 py-0.5 text-xs text-white"
            >
              Rebutja
            </button>
          </span>
        )}
      />
      <Section
        title="Packs"
        items={packs}
        render={(i) => (
          <button
            onClick={() => run(() => packPublishAction(i.id))}
            disabled={pending}
            className="rounded bg-bark-700 px-2 py-0.5 text-xs text-cream-50"
          >
            Publica
          </button>
        )}
      />
      {msg && <p className="mt-3 text-sm text-olive-700">{msg}</p>}
    </div>
  );
}
