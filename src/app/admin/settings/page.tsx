import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  listSettings,
  ensureDefaultSettings,
  buildAiDiagnostics,
} from "@/lib/admin/settings";
import { SettingsPanel } from "@/components/admin/SettingsPanel";

export const dynamic = "force-dynamic";

/**
 * Ajustes (Settings, §3.13). Platform-only. Editable marketplace settings PLUS
 * a read-only AI diagnostics block.
 *
 * HARD SECURITY RULE: no secret VALUE is ever sent to the browser. The AI
 * diagnostics come from `buildAiDiagnostics`, which reuses `readAiConfig` and
 * returns ONLY presence-only booleans and feature flags — never the key value.
 * The block also LABELS where the real key is configured (the git-ignored .env,
 * var AI_API_KEY) so a future operator knows where to plug a provider in.
 */
export default async function AdminSettingsPage() {
  await requirePlatformAdmin();

  // Seed defaults on first visit so the page always has a catalogue to edit.
  await ensureDefaultSettings(prisma);
  const settings = await listSettings(prisma);

  // Presence-only diagnostics. buildAiDiagnostics never returns the key value.
  const ai = buildAiDiagnostics();

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-bark-900">Ajustos</h1>
      <p className="mt-1 max-w-2xl text-sm text-bark-600">
        Identitat del mercat, idiomes, lliurament, cicles, notificacions,
        funcionalitats i analítica. Cap secret es mostra al navegador.
      </p>

      <SettingsPanel
        settings={settings.map((s) => ({
          key: s.key,
          label: s.label,
          category: s.category,
          valueType: s.valueType,
          value:
            s.valueType === "json"
              ? JSON.stringify(s.value)
              : String(s.value),
        }))}
      />

      {/* Read-only AI diagnostics — PRESENCE ONLY, never a key value. */}
      <section className="mt-8" data-testid="ai-diagnostics">
        <h2 className="mb-3 font-display text-lg font-bold text-bark-900">
          Diagnòstic d&apos;IA (només lectura)
        </h2>
        <div className="rounded-2xl border border-bark-200 bg-white p-4 text-sm">
          <p>
            Proveïdor configurat:{" "}
            <span className="font-semibold">{ai.provider}</span>
          </p>
          <p className="mt-1">
            Clau d&apos;IA configurada:{" "}
            <span
              className="rounded-full bg-olive-100 px-2 py-0.5 text-xs font-semibold text-olive-800"
              data-testid="ai-key-presence"
            >
              {ai.hasApiKey ? "sí" : "no (mode mock)"}
            </span>
          </p>
          <p className="mt-2 rounded-lg bg-cream-50 p-3 text-xs text-bark-600">
            La clau real es configura només a{" "}
            <code className="font-semibold">{ai.keyConfigLocation}</code> (variable{" "}
            <code className="font-semibold">{ai.keyEnvVar}</code>). El seu valor
            mai es desa a la base de dades ni s&apos;envia al navegador.
          </p>

          <h3 className="mt-4 font-semibold text-bark-800">
            On viu cada assistent d&apos;IA
          </h3>
          <ul className="mt-2 space-y-1" data-testid="ai-assistants">
            {ai.assistants.map((a) => (
              <li
                key={a.useCase}
                className="flex items-center justify-between rounded-lg bg-cream-50 px-3 py-2 text-xs"
              >
                <span>
                  <span className="font-semibold">{a.label}</span>
                  <span className="ml-1 text-bark-500">({a.location})</span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 font-semibold ${
                    a.flagEnabled
                      ? "bg-olive-100 text-olive-800"
                      : "bg-bark-100 text-bark-600"
                  }`}
                >
                  {a.flagEnabled ? "actiu" : "desactivat (mock)"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
