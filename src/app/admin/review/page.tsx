import { requireAdmin } from "@/lib/auth";
import {
  listPendingRecords,
  listPendingTranslations,
  listReviewQueueExtended,
} from "@/lib/admin/data";
import { ReviewQueue } from "@/components/admin/ReviewQueue";
import { ExtendedReviewQueue } from "@/components/admin/ExtendedReviewQueue";

export const dynamic = "force-dynamic";

/**
 * Human review / approval queue. Lists records in `pending_review` and AI
 * translations with status `machine`/`in_review`. A platform_admin approves
 * (-> approved) or rejects (-> rejected / deleted). All transitions are human
 * actions and are audited by the server actions.
 */
export default async function AdminReviewPage() {
  const user = await requireAdmin();
  const [pending, translations, extended] = await Promise.all([
    listPendingRecords(user),
    listPendingTranslations(user),
    listReviewQueueExtended(user),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Cua de revisió</h1>
      <p className="mt-1 text-sm text-pasture-600">
        {user.role === "platform_admin"
          ? "Aprova o rebutja registres pendents i traduccions generades per IA."
          : "Veus els registres pendents de la teva granja. L'aprovació la fa la plataforma."}
      </p>

      <ReviewQueue
        role={user.role}
        pendingFarms={pending.farms}
        pendingProducts={pending.products}
        translations={translations}
      />

      <ExtendedReviewQueue
        isPlatform={user.role === "platform_admin"}
        offers={extended.offers.map((o) => ({
          id: o.id,
          label: `${o.farm.name} · ${o.publicName}`,
          sublabel: o.productDefinition.canonicalName,
        }))}
        lots={extended.lots.map((l) => ({
          id: l.id,
          label: l.reference,
          sublabel: l.farm.name,
        }))}
        certs={extended.certs.map((c) => ({
          id: c.id,
          label: c.title,
          sublabel: `${c.farm.name} · ${c.type}`,
        }))}
        profileEdits={extended.profileEdits.map((p) => ({
          id: p.id,
          label: `Perfil: ${p.farm.name}`,
          sublabel: Object.keys(JSON.parse(p.changes)).join(", "),
        }))}
        packs={extended.packs.map((p) => ({
          id: p.id,
          label: p.publicName,
          sublabel: p.isMultiFarm ? "multi-granja" : "una granja",
        }))}
      />
    </div>
  );
}
