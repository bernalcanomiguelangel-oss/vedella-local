import Link from "next/link";
import { requireAdmin, visibleFarmScope } from "@/lib/auth";
import { listAuditEntries } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

const sourceClass: Record<string, string> = {
  human: "bg-olive-100 text-olive-800",
  ai: "bg-amber-100 text-amber-800",
  assistant: "bg-blue-100 text-blue-800",
};

/**
 * Registro de actividad (Audit log, §3.12). Read-only, filterable browse over
 * AdminAudit (human actions) + AiRun (AI runs). The data loader leaves a clear
 * extension point for the FEAT-007 AI-assistant decision history and is tolerant
 * of it being absent. Farm managers see only their own-farm entries (and never
 * platform-level AI runs). URL-encoded filters keep every view deep-linkable.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const user = await requireAdmin();
  const scope = visibleFarmScope(user);

  const source = typeof searchParams?.source === "string" ? searchParams.source : "all";
  const action = typeof searchParams?.action === "string" ? searchParams.action : "";
  const entityType =
    typeof searchParams?.entityType === "string" ? searchParams.entityType : "";

  const entries = await listAuditEntries(user, {
    source,
    action: action || undefined,
    entityType: entityType || undefined,
  });

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-bark-900">
        Registre d&apos;activitat
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-bark-600">
        Historial de només lectura de les accions humanes (AdminAudit) i les
        execucions d&apos;IA (AiRun).
      </p>
      <p className="mt-2 text-xs text-bark-500" data-testid="scope-note">
        {scope === null
          ? "Veus tot el registre (platform_admin)."
          : "Veus només les teves entrades."}
      </p>

      {/* URL-encoded filter bar. */}
      <form
        method="get"
        data-testid="audit-filters"
        className="mt-5 grid gap-3 rounded-2xl bg-cream-50 p-4 ring-1 ring-bark-100 sm:grid-cols-4"
      >
        <label className="text-xs font-semibold text-bark-600">
          Origen
          <select
            name="source"
            defaultValue={source}
            className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
          >
            <option value="all">Tots</option>
            <option value="human">Humà</option>
            {scope === null && <option value="ai">IA</option>}
            <option value="assistant">Assistent IA</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-bark-600">
          Acció
          <input
            name="action"
            defaultValue={action}
            className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-bark-600">
          Tipus d&apos;entitat
          <input
            name="entityType"
            defaultValue={entityType}
            className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-lg bg-bark-700 px-3 py-1.5 text-sm font-semibold text-cream-50 hover:bg-bark-800"
          >
            Filtra
          </button>
          <Link
            href="/admin/audit"
            className="rounded-lg bg-bark-100 px-3 py-1.5 text-sm font-semibold text-bark-700 hover:bg-bark-200"
          >
            Reinicia
          </Link>
        </div>
      </form>

      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg font-bold text-bark-900">
          Entrades ({entries.length})
        </h2>
        {entries.length === 0 ? (
          <p className="rounded-2xl bg-cream-50 p-5 text-sm text-bark-600 ring-1 ring-bark-100">
            Cap entrada per a aquests filtres.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl ring-1 ring-bark-100">
            <table className="w-full text-sm" data-testid="audit-table">
              <thead className="bg-bark-100 text-left text-bark-700">
                <tr>
                  <th className="px-4 py-2">Origen</th>
                  <th className="px-4 py-2">Acció</th>
                  <th className="px-4 py-2">Actor</th>
                  <th className="px-4 py-2">Entitat</th>
                  <th className="px-4 py-2">Detall</th>
                  <th className="px-4 py-2">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bark-100 bg-cream-50">
                {entries.map((e) => (
                  <tr key={`${e.source}-${e.id}`} data-testid="audit-row">
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          sourceClass[e.source] ?? "bg-bark-100 text-bark-700"
                        }`}
                      >
                        {e.source}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-medium">{e.action}</td>
                    <td className="px-4 py-2 text-bark-600">{e.actor}</td>
                    <td className="px-4 py-2 text-bark-600">
                      {e.entityType}
                      {e.entityId ? `:${e.entityId.slice(0, 10)}` : ""}
                    </td>
                    <td className="px-4 py-2 text-bark-500">{e.detail}</td>
                    <td className="px-4 py-2 text-bark-500">
                      {e.createdAt.toISOString().slice(0, 16).replace("T", " ")}
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
