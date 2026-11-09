import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listWebsiteTexts } from "@/lib/admin/website-text";
import { WebsiteTextPanel } from "@/components/admin/WebsiteTextPanel";

export const dynamic = "force-dynamic";

/**
 * Textos web (Website text, §3.9). Platform-only CMS for GENERIC site copy
 * (ca/es/en) with draft + published states, preview and char limits. The hard
 * guardrail — operational facts (weights, prices, dates, capacity, farm,
 * traceability) are NEVER stored here — is enforced in the server action layer
 * (src/lib/admin/website-text).
 */
export default async function AdminWebsiteTextPage() {
  await requirePlatformAdmin();
  const rows = await listWebsiteTexts(prisma);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-bark-900">Textos web</h1>
      <p className="mt-1 max-w-2xl text-sm text-bark-600">
        CMS per a textos genèrics del lloc (ca/es/en) amb esborrany i publicat.
      </p>
      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Els fets operatius (pesos, preus, dates, capacitat, granja, traçabilitat)
        mai es guarden aquí: provenen de registres estructurats. Qualsevol intent
        de desar-los es rebutja.
      </p>

      <WebsiteTextPanel
        rows={rows.map((r) => ({
          id: r.id,
          pageKey: r.pageKey,
          sectionKey: r.sectionKey,
          locale: r.locale,
          draftText: r.draftText,
          publishedText: r.publishedText,
          charLimit: r.charLimit,
          isPublished: r.isPublished,
          hasUnpublishedChanges: r.hasUnpublishedChanges,
        }))}
      />
    </div>
  );
}
