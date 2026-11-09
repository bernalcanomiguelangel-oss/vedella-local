"use client";

/**
 * Settings editor UI (FEAT-006 §3.13). Platform-only. Edits the fixed settings
 * catalogue via the audited server action. There is NO field here for an AI/
 * provider key: keys live only in the git-ignored .env and never appear in the
 * browser. Values are coerced to their stored type server-side.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSettingAction } from "@/lib/admin/settings-actions";

interface SettingView {
  key: string;
  label: string;
  category: string;
  valueType: string;
  value: string;
}

export function SettingsPanel({ settings }: { settings: SettingView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(settings.map((s) => [s.key, s.value])),
  );

  function save(key: string) {
    setMsg(null);
    startTransition(async () => {
      const res = await updateSettingAction({ key, value: draft[key] ?? "" });
      setMsg(res.ok ? `${key} desat.` : res.message ?? "Error");
      router.refresh();
    });
  }

  // Group by category for display.
  const byCategory = new Map<string, SettingView[]>();
  for (const s of settings) {
    if (!byCategory.has(s.category)) byCategory.set(s.category, []);
    byCategory.get(s.category)!.push(s);
  }

  return (
    <div className="mt-6 space-y-6" data-testid="settings-panel">
      {Array.from(byCategory.entries()).map(([category, rows]) => (
        <section key={category} className="rounded-2xl border border-bark-200 bg-white p-4">
          <h2 className="font-display text-lg font-bold capitalize text-bark-900">
            {category}
          </h2>
          <div className="mt-3 space-y-3">
            {rows.map((s) => (
              <div key={s.key} className="flex flex-wrap items-end gap-2">
                <label className="flex-1 text-xs font-semibold text-bark-600">
                  {s.label || s.key}
                  <span className="ml-1 text-bark-400">({s.valueType})</span>
                  {s.valueType === "boolean" ? (
                    <select
                      value={draft[s.key]}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, [s.key]: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
                    >
                      <option value="true">sí</option>
                      <option value="false">no</option>
                    </select>
                  ) : (
                    <input
                      value={draft[s.key]}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, [s.key]: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-bark-200 px-2 py-1 text-sm"
                    />
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => save(s.key)}
                  disabled={pending}
                  className="rounded-lg bg-bark-700 px-3 py-1.5 text-sm font-semibold text-cream-50 hover:bg-bark-800 disabled:opacity-50"
                >
                  Desa
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
      {msg && <p className="text-sm text-olive-700" data-testid="settings-msg">{msg}</p>}
    </div>
  );
}
