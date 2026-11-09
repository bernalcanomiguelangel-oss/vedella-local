"use client";

import { useState, useTransition } from "react";
import { lotCreateAction } from "@/lib/admin/manage-actions";

export function LotCreateForm({
  role,
  offers,
}: {
  role: string;
  offers: Array<{ id: string; label: string; farmId: string }>;
}) {
  const [offerId, setOfferId] = useState(offers[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [units, setUnits] = useState("10");
  const [slaughter, setSlaughter] = useState("");
  const [cutting, setCutting] = useState("");
  const [packing, setPacking] = useState("");
  const [expiry, setExpiry] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function create() {
    const offer = offers.find((o) => o.id === offerId);
    if (!offer) return;
    startTransition(async () => {
      const res = await lotCreateAction({
        farmId: offer.farmId,
        farmProductOfferId: offer.id,
        reference,
        units: parseInt(units, 10),
        slaughterDate: slaughter,
        cuttingDate: cutting,
        packingDate: packing,
        expiryDate: expiry,
      });
      setMsg(
        res.ok
          ? role === "farm_manager"
            ? "Lot creat. L'oferta passa a revisió (canvi de traçabilitat)."
            : "Lot creat."
          : res.message ?? "Error",
      );
      if (res.ok) setReference("");
    });
  }

  return (
    <section className="rounded-2xl border border-bark-200 bg-white p-4">
      <h2 className="font-semibold text-bark-800">Nou lot</h2>
      {role === "farm_manager" && (
        <p className="text-xs text-bark-500">
          Els canvis de traçabilitat requereixen aprovació: l&apos;oferta passarà
          a revisió.
        </p>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-sm">
          Oferta
          <select
            className="mt-1 w-full rounded border border-bark-300 p-2 text-sm"
            value={offerId}
            onChange={(e) => setOfferId(e.target.value)}
          >
            {offers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Referència
          <input
            className="mt-1 w-full rounded border border-bark-300 p-2 text-sm"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Unitats
          <input
            type="number"
            className="mt-1 w-full rounded border border-bark-300 p-2 text-sm"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Sacrifici
          <input
            type="date"
            className="mt-1 w-full rounded border border-bark-300 p-2 text-sm"
            value={slaughter}
            onChange={(e) => setSlaughter(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Especejament
          <input
            type="date"
            className="mt-1 w-full rounded border border-bark-300 p-2 text-sm"
            value={cutting}
            onChange={(e) => setCutting(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Envasat
          <input
            type="date"
            className="mt-1 w-full rounded border border-bark-300 p-2 text-sm"
            value={packing}
            onChange={(e) => setPacking(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Caducitat
          <input
            type="date"
            className="mt-1 w-full rounded border border-bark-300 p-2 text-sm"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          />
        </label>
      </div>
      <button
        onClick={create}
        disabled={pending || !offerId || !reference}
        className="mt-3 rounded-full bg-bark-700 px-4 py-1.5 text-sm font-semibold text-cream-50 disabled:opacity-50"
      >
        Crea lot
      </button>
      {msg && <p className="mt-2 text-sm text-olive-700">{msg}</p>}
    </section>
  );
}
