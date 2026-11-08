import { requirePlatformAdmin } from "@/lib/auth";
import { SectionPlaceholder } from "@/components/admin/SectionPlaceholder";

export const dynamic = "force-dynamic";

/**
 * Textos web (Website text). Platform-only CMS for generic site copy (ca/es/en)
 * with draft/published states. Operational facts (weights, prices, dates,
 * capacity, traceability) are NEVER stored here — they come from structured
 * records.
 */
export default async function AdminWebsiteTextPage() {
  await requirePlatformAdmin();

  return (
    <SectionPlaceholder
      title="Textos web"
      description="CMS per a textos genèrics del lloc (ca/es/en) amb esborrany i publicat. Els fets operatius mai es guarden aquí."
      scopeNote="Només platform_admin."
    />
  );
}
