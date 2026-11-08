import { requirePlatformAdmin } from "@/lib/auth";
import { readAiConfig } from "@/lib/ai/provider";
import { SectionPlaceholder } from "@/components/admin/SectionPlaceholder";

export const dynamic = "force-dynamic";

/**
 * Ajustes (Settings). Platform-only. Marketplace identity, languages, delivery
 * zones, cycle defaults, feature flags and AI flags. NO secrets are shown in
 * the browser; AI keys stay server-side and surface only as presence booleans
 * (the existing src/lib/ai pattern). Full UI lands later.
 */
export default async function AdminSettingsPage() {
  await requirePlatformAdmin();
  // Presence-only: never read or render the key value itself.
  const ai = readAiConfig();

  return (
    <SectionPlaceholder
      title="Ajustos"
      description="Identitat del mercat, idiomes, zones de lliurament, indicadors de funcionalitats i flags d'IA. Cap secret es mostra al navegador."
      scopeNote="Només platform_admin."
    >
      <p
        className="mt-3 inline-block rounded-full bg-olive-100 px-3 py-1 text-xs font-semibold text-olive-800"
        data-testid="ai-key-presence"
      >
        Clau d&apos;IA configurada: {ai.hasApiKey ? "sí" : "no (mode mock)"}
      </p>
    </SectionPlaceholder>
  );
}
