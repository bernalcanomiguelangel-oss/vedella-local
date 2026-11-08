"use client";

import { useState, useTransition } from "react";
import { offerSelfEditAction } from "@/lib/admin/manage-actions";

/**
 * A single offer row with the ONLY live self-edit a farm_manager may make:
 * price + available units. Everything else requires review and is not editable
 * here. The server action re-checks scope and the permission matrix.
 */
export function OfferSelfEditRow({
  offerId,
  farmName,
  publicName,
  priceAmountCents,
  lifecycle,
}: {
  offerId: string;
  farmName: string;
  publicName: string;
  priceAmountCents: number;
  lifecycle: string;
}) {
  const [price, setPrice] = useState((priceAmountCents / 100).toFixed(2));
  const [units, setUnits] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    const cents = Math.round(parseFloat(price) * 100);
    const unitsVal = units === "" ? undefined : parseInt(units, 10);
    startTransition(async () => {
      const res = await offerSelfEditAction(
        offerId,
        Number.isFinite(cents) ? cents : undefined,
        unitsVal,
      );
      setMsg(res.ok ? "Desat (en viu, sense revisió)." : res.message ?? "Error");
    });
  }

  return (
    <tr className="border-t border-bark-100">
      <td className="py-1 font-medium">{farmName}</td>
      <td>{publicName}</td>
      <td>{(priceAmountCents / 100).toFixed(2)} €</td>
      <td>
        <span className="rounded-full bg-cream-100 px-2 py-0.5 text-xs">{lifecycle}</span>
      </td>
      <td>
        <div className="flex items-center gap-1">
          <input
            className="w-16 rounded border border-bark-300 p-1 text-xs"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            aria-label="Preu"
          />
          <input
            className="w-14 rounded border border-bark-300 p-1 text-xs"
            placeholder="unitats"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            aria-label="Unitats"
          />
          <button
            onClick={save}
            disabled={pending}
            className="rounded bg-bark-700 px-2 py-1 text-xs text-cream-50 disabled:opacity-50"
          >
            Desa
          </button>
        </div>
        {msg && <span className="text-xs text-olive-700">{msg}</span>}
      </td>
    </tr>
  );
}
