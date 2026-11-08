"use client";

/**
 * Incidents UI (FEAT-006 §3.8). Lists incidents with severity/status, lets an
 * operator file a new one (linked to a farm/lot by id), update status, and —
 * for a high-severity lot incident — withdraw the lot, which returns the count
 * of affected unfulfilled orders. All authorisation + auditing is server-side;
 * a farm_manager is confined to their own farm by the action layer.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createIncidentAction,
  updateIncidentAction,
  withdrawLotForIncidentAction,
} from "@/lib/admin/incident-actions";

interface IncidentView {
  id: string;
  reference: string;
  category: string;
  severity: string;
  status: string;
  description: string;
  canWithdrawLot: boolean;
  reportedAt: string;
}

const CATEGORIES = ["delivery", "complaint", "quality", "lot", "logistics", "other"];
const SEVERITIES = ["low", "medium", "high", "critical"];
const STATUSES = ["open", "investigating", "resolved", "closed"];

const severityClass: Record<string, string> = {
  low: "bg-olive-100 text-olive-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

export function IncidentsPanel({
  isPlatform,
  incidents,
  farms,
}: {
  isPlatform: boolean;
  incidents: IncidentView[];
  farms: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // New-incident form state.
  const [reference, setReference] = useState("");
  const [category, setCategory] = useState("quality");
  const [severity, setSeverity] = useState("low");
  const [description, setDescription] = useState("");
  const [farmId, setFarmId] = useState(farms[0]?.id ?? "");
  const [lotId, setLotId] = useState("");

  function create() {
    setMsg(null);
    startTransition(async () => {
      const res = await createIncidentAction({
        reference,
        category,
        severity,
        description,
        farmId: farmId || null,
        lotId: lotId || null,
      });
      setMsg(res.ok ? "Incidència creada." : res.message ?? "Error");
      if (res.ok) {
        setReference("");
        setDescription("");
        setLotId("");
      }
      router.refresh();
    });
  }

  function setStatus(id: string, status: string) {
    setMsg(null);
    startTransition(async () => {
      const res = await updateIncidentAction(id, { status });
      setMsg(res.ok ? "Actualitzat." : res.message ?? "Error");
      router.refresh();
    });
  }

  function withdraw(id: string) {
    setMsg(null);
    startTransition(async () => {
      const res = await withdrawLotForIncidentAction(id);
      setMsg(
        res.ok
          ? `Lot retirat. Comandes no completades afectades: ${res.affectedOrderCount ?? 0}.`
          : res.message ?? "Error",
      );
      router.refresh();
    });
  }

  return (
    <div className="mt-6">
      {/* New incident */}
      <section
        className="rounded-2xl border border-bark-200 bg-white p-4"
        data-testid="incident-form"
      >
        <h2 className="font-display text-lg font-bold text-bark-900">Nova incidència</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-semibold text-bark-600">
            Referència
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-bark-600">
            Categoria
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-bark-600">
            Severitat
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-bark-600">
            Granja{isPlatform ? " (opcional)" : ""}
            <select
              value={farmId}
              onChange={(e) => setFarmId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
            >
              {isPlatform && <option value="">— cap —</option>}
              {farms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-bark-600">
            Lot vinculat (id)
            <input
              value={lotId}
              onChange={(e) => setLotId(e.target.value)}
              placeholder="per a incidències de lot"
              className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-bark-600 sm:col-span-2 lg:col-span-3">
            Descripció
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={create}
          disabled={pending}
          data-testid="incident-create"
          className="mt-3 rounded-full bg-bark-700 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-bark-800 disabled:opacity-50"
        >
          {pending ? "Desant…" : "Crea incidència"}
        </button>
        {msg && <p className="mt-2 text-sm text-olive-700">{msg}</p>}
      </section>

      {/* Incident list */}
      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg font-bold text-bark-900">
          Incidències ({incidents.length})
        </h2>
        {incidents.length === 0 ? (
          <p className="rounded-2xl bg-cream-50 p-5 text-sm text-bark-600 ring-1 ring-bark-100">
            Cap incidència registrada.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl ring-1 ring-bark-100">
            <table className="w-full text-sm" data-testid="incident-table">
              <thead className="bg-bark-100 text-left text-bark-700">
                <tr>
                  <th className="px-4 py-2">Ref.</th>
                  <th className="px-4 py-2">Categoria</th>
                  <th className="px-4 py-2">Severitat</th>
                  <th className="px-4 py-2">Estat</th>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-bark-100 bg-cream-50">
                {incidents.map((i) => (
                  <tr key={i.id} data-testid="incident-row">
                    <td className="px-4 py-2 font-medium">{i.reference}</td>
                    <td className="px-4 py-2 text-bark-600">{i.category}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          severityClass[i.severity] ?? "bg-bark-100 text-bark-700"
                        }`}
                      >
                        {i.severity}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={i.status}
                        onChange={(e) => setStatus(i.id, e.target.value)}
                        disabled={pending}
                        className="rounded border border-bark-200 px-1 py-0.5 text-xs"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-bark-500">{i.reportedAt}</td>
                    <td className="px-4 py-2 text-right">
                      {i.canWithdrawLot && (
                        <button
                          type="button"
                          onClick={() => withdraw(i.id)}
                          disabled={pending}
                          data-testid="withdraw-lot"
                          className="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Retira lot
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
