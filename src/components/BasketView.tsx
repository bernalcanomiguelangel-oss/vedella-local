"use client";

/**
 * Basket + reservation UI. Totals are computed with the shared pricing.ts
 * (discount tiers 3/−2%, 5/−3%, 8/−5%, delivery fee 6,00 €). Reservation POSTs to
 * /api/reserve which revalidates everything server-side and returns an immutable
 * order with a lot code. On success it renders the confirmation and clears the
 * basket.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useBasket } from "@/components/BasketProvider";
import { formatCents, priceBasket } from "@/lib/pricing";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { ReserveOutcome } from "@/lib/reserve";

interface CycleInfo {
  name: string;
  zone: string;
  closeDate: string;
  deliveryDate: string;
  freePlaces: number;
  totalPlaces: number;
  transportNote: string;
}

type Confirmation = Extract<ReserveOutcome, { ok: true }>;

function formatDate(iso: string, locale: Locale): string {
  const map: Record<Locale, string> = { ca: "ca-ES", es: "es-ES", en: "en-GB" };
  return new Date(iso).toLocaleDateString(map[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function BasketView({
  locale,
  dict,
  cycle,
}: {
  locale: Locale;
  dict: Dictionary;
  cycle: CycleInfo | null;
}) {
  const { items, setQuantity, remove, clear, hydrated } = useBasket();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const pricing = useMemo(
    () =>
      priceBasket(
        items.map((i) => ({
          unitPriceCents: i.unitPriceCents,
          quantity: i.quantity,
        })),
      ),
    [items],
  );

  const cycleFull = cycle !== null && cycle.freePlaces <= 0;
  const canReserve =
    hydrated && items.length > 0 && cycle !== null && !cycleFull && !submitting;

  async function reserveNow() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
          customerName: name || undefined,
          customerEmail: email || undefined,
        }),
      });
      const data = (await res.json()) as ReserveOutcome;
      if (res.ok && data.ok) {
        setConfirmation(data);
        clear();
      } else if (!data.ok && data.code === "CYCLE_FULL") {
        setError(dict.basket.cycleFull);
      } else {
        setError(dict.basket.cycleFull);
      }
    } catch {
      setError(dict.basket.cycleFull);
    } finally {
      setSubmitting(false);
    }
  }

  // Confirmation view.
  if (confirmation) {
    return (
      <div className="rounded-2xl bg-cream-50 p-8 shadow-md ring-1 ring-pasture-100">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-pasture-600 text-2xl text-cream-50">
            ✓
          </span>
          <h1 className="text-2xl font-bold text-pasture-900">
            {dict.confirmation.title}
          </h1>
        </div>
        <p className="mt-3 text-pasture-700">{dict.confirmation.thanks}</p>

        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-pasture-50 p-4 ring-1 ring-pasture-100">
            <dt className="text-xs uppercase tracking-wide text-pasture-500">
              {dict.confirmation.orderRef}
            </dt>
            <dd className="font-mono text-sm text-pasture-900">
              {confirmation.orderId}
            </dd>
          </div>
          <div className="rounded-xl bg-beef-50 p-4 ring-1 ring-beef-200">
            <dt className="text-xs uppercase tracking-wide text-beef-700">
              {dict.confirmation.lotCode}
            </dt>
            <dd className="font-mono text-sm font-bold text-beef-800">
              {confirmation.lotReference || "—"}
            </dd>
          </div>
          <div className="rounded-xl bg-pasture-50 p-4 ring-1 ring-pasture-100">
            <dt className="text-xs uppercase tracking-wide text-pasture-500">
              {dict.confirmation.deliveryOn}
            </dt>
            <dd className="text-sm text-pasture-900">
              {formatDate(confirmation.deliveryDate as unknown as string, locale)}
            </dd>
          </div>
          <div className="rounded-xl bg-pasture-50 p-4 ring-1 ring-pasture-100">
            <dt className="text-xs uppercase tracking-wide text-pasture-500">
              {dict.confirmation.total}
            </dt>
            <dd className="text-lg font-bold text-pasture-900">
              {formatCents(confirmation.totalCents)}
            </dd>
          </div>
        </dl>

        <h2 className="mt-6 font-semibold text-pasture-900">
          {dict.confirmation.items}
        </h2>
        <ul className="mt-2 divide-y divide-pasture-100">
          {confirmation.items.map((it, idx) => (
            <li key={idx} className="flex justify-between py-2 text-sm">
              <span className="text-pasture-800">
                {it.quantity} × {it.name}
                {it.lotReferenceSnapshot && (
                  <span className="ml-2 font-mono text-xs text-pasture-400">
                    {dict.farm.lot} {it.lotReferenceSnapshot}
                  </span>
                )}
              </span>
              <span className="font-medium text-pasture-900">
                {formatCents(it.priceCentsSnapshot * it.quantity)}
              </span>
            </li>
          ))}
        </ul>

        <Link
          href={`/${locale}`}
          className="mt-8 inline-block rounded-full bg-pasture-600 px-5 py-2.5 text-sm font-semibold text-cream-50 hover:bg-pasture-700"
        >
          {dict.confirmation.backHome}
        </Link>
      </div>
    );
  }

  // Empty basket.
  if (hydrated && items.length === 0) {
    return (
      <div className="rounded-2xl bg-cream-50 p-10 text-center shadow-sm ring-1 ring-pasture-100">
        <h1 className="text-2xl font-bold text-pasture-900">
          {dict.basket.title}
        </h1>
        <p className="mt-3 text-pasture-600">{dict.basket.empty}</p>
        <Link
          href={`/${locale}`}
          className="mt-6 inline-block rounded-full bg-beef-600 px-5 py-2.5 text-sm font-semibold text-cream-50 hover:bg-beef-700"
        >
          {dict.basket.emptyCta}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div>
        <h1 className="mb-5 text-2xl font-bold text-pasture-900">
          {dict.basket.title}
        </h1>
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.productId}
              className="flex items-center gap-4 rounded-2xl bg-cream-50 p-4 shadow-sm ring-1 ring-pasture-100"
            >
              <div className="flex-1">
                <p className="font-semibold text-pasture-900">{item.name}</p>
                <p className="text-sm text-pasture-500">{item.farmName}</p>
                {item.lotReference && (
                  <p className="mt-0.5 font-mono text-xs text-pasture-400">
                    {dict.farm.lot} {item.lotReference}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="-"
                  onClick={() => setQuantity(item.productId, item.quantity - 1)}
                  className="h-8 w-8 rounded-full bg-pasture-100 font-bold text-pasture-700 hover:bg-pasture-200"
                >
                  −
                </button>
                <span className="w-6 text-center font-semibold">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  aria-label="+"
                  onClick={() => setQuantity(item.productId, item.quantity + 1)}
                  className="h-8 w-8 rounded-full bg-pasture-100 font-bold text-pasture-700 hover:bg-pasture-200"
                >
                  +
                </button>
              </div>
              <div className="w-20 text-right font-semibold text-pasture-900">
                {formatCents(item.unitPriceCents * item.quantity)}
              </div>
              <button
                type="button"
                onClick={() => remove(item.productId)}
                className="text-xs text-beef-600 hover:underline"
              >
                {dict.basket.remove}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Summary + reservation */}
      <aside className="space-y-4">
        <div className="rounded-2xl bg-cream-50 p-5 shadow-md ring-1 ring-pasture-100">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-pasture-600">{dict.basket.unitCount}</dt>
              <dd className="font-semibold">{pricing.unitCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-pasture-600">{dict.basket.subtotal}</dt>
              <dd className="font-semibold">
                {formatCents(pricing.subtotalCents)}
              </dd>
            </div>
            {pricing.discountCents > 0 && (
              <div className="flex justify-between text-pasture-700">
                <dt>
                  {dict.basket.discount} (
                  {Math.round(pricing.discountRate * 100)}%)
                </dt>
                <dd className="font-semibold text-beef-700">
                  −{formatCents(pricing.discountCents)}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-pasture-600">{dict.basket.delivery}</dt>
              <dd className="font-semibold">
                {formatCents(pricing.deliveryFeeCents)}
              </dd>
            </div>
            <div className="mt-2 flex justify-between border-t border-pasture-100 pt-2 text-base">
              <dt className="font-bold text-pasture-900">
                {dict.basket.total}
              </dt>
              <dd className="font-extrabold text-beef-700">
                {formatCents(pricing.totalCents)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-pasture-500">
            {dict.basket.discountHint}
          </p>
        </div>

        {/* Cycle + reservation */}
        <div className="rounded-2xl bg-pasture-50 p-5 ring-1 ring-pasture-100">
          {cycle ? (
            <>
              <h2 className="font-bold text-pasture-900">
                {dict.basket.cycleTitle}
              </h2>
              <p className="mt-1 text-sm font-semibold text-pasture-800">
                {cycle.name}
              </p>
              <dl className="mt-2 space-y-1 text-sm text-pasture-700">
                <div className="flex justify-between">
                  <dt>{dict.basket.cycleZone}</dt>
                  <dd>{cycle.zone}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>{dict.basket.cycleClose}</dt>
                  <dd>{formatDate(cycle.closeDate, locale)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>{dict.basket.cycleDelivery}</dt>
                  <dd>{formatDate(cycle.deliveryDate, locale)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>{dict.basket.cyclePlaces}</dt>
                  <dd className="font-semibold">
                    {cycle.freePlaces}/{cycle.totalPlaces}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-pasture-500">
                {cycle.transportNote}
              </p>

              {cycleFull ? (
                <p className="mt-4 rounded-lg bg-beef-50 p-3 text-sm font-medium text-beef-800 ring-1 ring-beef-200">
                  {dict.basket.cycleFull}
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={dict.basket.nameLabel}
                    className="w-full rounded-lg border border-pasture-200 bg-cream-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pasture-400"
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={dict.basket.emailLabel}
                    className="w-full rounded-lg border border-pasture-200 bg-cream-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pasture-400"
                  />
                </div>
              )}

              {error && (
                <p className="mt-3 text-sm font-medium text-beef-700">{error}</p>
              )}

              <button
                type="button"
                disabled={!canReserve}
                onClick={reserveNow}
                className="mt-4 w-full rounded-full bg-beef-600 px-5 py-3 text-sm font-bold text-cream-50 shadow transition hover:bg-beef-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? dict.basket.reserving : dict.basket.reserve}
              </button>
              <p className="mt-2 text-center text-xs font-medium text-pasture-600">
                {dict.basket.payOnDelivery}
              </p>
            </>
          ) : (
            <p className="text-sm text-pasture-600">{dict.basket.noCycle}</p>
          )}
        </div>
      </aside>
    </div>
  );
}
