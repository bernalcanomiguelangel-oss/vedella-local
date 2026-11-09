"use client";

/**
 * Website-text CMS UI (FEAT-006 §3.9). Platform-only. Lets an operator create /
 * edit a draft copy block (page+section+locale) and publish it, with a live
 * preview and char-limit counter. The operational-fact guardrail lives in the
 * server action; if a write is rejected the reason is surfaced here. All
 * authorisation + auditing is server-side.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveWebsiteTextDraftAction,
  publishWebsiteTextAction,
} from "@/lib/admin/website-text-actions";

interface Row {
  id: string;
  pageKey: string;
  sectionKey: string;
  locale: string;
  draftText: string;
  publishedText: string | null;
  charLimit: number | null;
  isPublished: boolean;
  hasUnpublishedChanges: boolean;
}

export function WebsiteTextPanel({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // Draft editor state.
  const [pageKey, setPageKey] = useState("home");
  const [sectionKey, setSectionKey] = useState("hero");
  const [locale, setLocale] = useState("ca");
  const [draftText, setDraftText] = useState("");
  const [charLimit, setCharLimit] = useState("");

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveWebsiteTextDraftAction({
        pageKey,
        sectionKey,
        locale,
        draftText,
        charLimit: charLimit ? Number(charLimit) : null,
      });
      setMsg(res.ok ? "Esborrany desat." : res.message ?? "Error");
      router.refresh();
    });
  }

  function publish(id: string) {
    setMsg(null);
    startTransition(async () => {
      const res = await publishWebsiteTextAction(id);
      setMsg(res.ok ? "Publicat." : res.message ?? "Error");
      router.refresh();
    });
  }

  const limit = charLimit ? Number(charLimit) : null;
  const over = limit != null && draftText.length > limit;

  return (
    <div className="mt-6">
      <section
        className="rounded-2xl border border-bark-200 bg-white p-4"
        data-testid="website-text-form"
      >
        <h2 className="font-display text-lg font-bold text-bark-900">
          Edita un bloc de text
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-bark-600">
            Pàgina
            <input
              value={pageKey}
              onChange={(e) => setPageKey(e.target.value)}
              className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-bark-600">
            Secció
            <input
              value={sectionKey}
              onChange={(e) => setSectionKey(e.target.value)}
              className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-bark-600">
            Idioma
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
            >
              <option value="ca">ca</option>
              <option value="es">es</option>
              <option value="en">en</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-bark-600">
            Límit de caràcters
            <input
              type="number"
              value={charLimit}
              onChange={(e) => setCharLimit(e.target.value)}
              className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-bark-600 sm:col-span-2 lg:col-span-4">
            Text (esborrany)
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
            />
            <span
              className={`mt-1 block text-right text-xs ${over ? "text-red-600" : "text-bark-400"}`}
            >
              {draftText.length}
              {limit != null ? ` / ${limit}` : ""}
            </span>
          </label>
        </div>
        {/* Preview */}
        <div className="mt-3 rounded-lg bg-cream-50 p-3" data-testid="website-text-preview">
          <p className="text-xs font-semibold text-bark-500">Vista prèvia</p>
          <p className="mt-1 text-sm text-bark-800">{draftText || "—"}</p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          data-testid="website-text-save"
          className="mt-3 rounded-full bg-bark-700 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-bark-800 disabled:opacity-50"
        >
          {pending ? "Desant…" : "Desa esborrany"}
        </button>
        {msg && <p className="mt-2 text-sm text-olive-700" data-testid="website-text-msg">{msg}</p>}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg font-bold text-bark-900">
          Blocs ({rows.length})
        </h2>
        {rows.length === 0 ? (
          <p className="rounded-2xl bg-cream-50 p-5 text-sm text-bark-600 ring-1 ring-bark-100">
            Encara no hi ha cap bloc de text.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl ring-1 ring-bark-100">
            <table className="w-full text-sm" data-testid="website-text-table">
              <thead className="bg-bark-100 text-left text-bark-700">
                <tr>
                  <th className="px-4 py-2">Pàgina</th>
                  <th className="px-4 py-2">Secció</th>
                  <th className="px-4 py-2">Idioma</th>
                  <th className="px-4 py-2">Estat</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-bark-100 bg-cream-50">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-medium">{r.pageKey}</td>
                    <td className="px-4 py-2 text-bark-600">{r.sectionKey}</td>
                    <td className="px-4 py-2 text-bark-600">{r.locale}</td>
                    <td className="px-4 py-2 text-xs">
                      {r.isPublished ? (
                        <span className="text-olive-700">
                          publicat{r.hasUnpublishedChanges ? " · canvis pendents" : ""}
                        </span>
                      ) : (
                        <span className="text-amber-700">esborrany</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => publish(r.id)}
                        disabled={pending}
                        className="rounded bg-olive-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-olive-700 disabled:opacity-50"
                      >
                        Publica
                      </button>
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
