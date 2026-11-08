import { requireAdmin } from "@/lib/auth";
import {
  listDefinitions,
  listOffersGroupedByDefinition,
  listAdminPacks,
} from "@/lib/admin/data";
import { OfferSelfEditRow } from "@/components/admin/OfferSelfEditRow";
import { PackAcceptPanel } from "@/components/admin/PackAcceptPanel";

export const dynamic = "force-dynamic";

/**
 * Products & packs. Three sections:
 *  - Definicions: the platform-curated canonical catalogue. Farms CANNOT create
 *    definitions (decision 1) — they are read-only here for a farm_manager.
 *  - Ofertes: farm-specific offers grouped by definition, shown side-by-side per
 *    farm WITHOUT merging. A farm_manager self-edits ONLY their own price + units.
 *  - Packs: composition + the multi-farm dual-accept workflow.
 */
export default async function AdminProductsPage() {
  const user = await requireAdmin();
  const isPlatform = user.role === "platform_admin";
  const [definitions, groups, packs] = await Promise.all([
    listDefinitions(),
    listOffersGroupedByDefinition(user),
    listAdminPacks(user),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl font-bold text-bark-900">
          Productes i packs
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-bark-600">
          Catàleg de definicions (gestionat per la plataforma), ofertes per
          granja i packs (inclosos els multi-granja amb doble acceptació).
        </p>
      </header>

      {/* Definitions */}
      <section>
        <h2 className="font-semibold text-bark-800">Definicions (catàleg canònic)</h2>
        <p className="text-xs text-bark-500">
          {isPlatform
            ? "La plataforma gestiona aquest catàleg. Les granges NO poden crear definicions."
            : "Només lectura. Les granges no poden crear definicions; només ofertes contra una definició existent."}
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {definitions.map((d) => (
            <li
              key={d.id}
              className="rounded-full bg-cream-50 px-3 py-1 text-sm ring-1 ring-bark-200"
            >
              {d.canonicalName}
              <span className="ml-1 text-xs text-bark-500">({d.lifecycle})</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Offers grouped by definition */}
      <section>
        <h2 className="font-semibold text-bark-800">Ofertes per definició</h2>
        <p className="text-xs text-bark-500">
          Cada granja mostra els seus valors per separat (sense fusionar). Un
          gestor de granja només pot editar el PREU i les UNITATS de la seva
          pròpia oferta; qualsevol altre canvi passa per revisió.
        </p>
        <div className="mt-3 space-y-4">
          {groups.map((g) => (
            <div key={g.definitionId} className="rounded-2xl border border-bark-200 bg-white p-4">
              <h3 className="font-semibold text-bark-900">{g.definitionName}</h3>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-bark-500">
                    <th className="py-1">Granja</th>
                    <th>Nom públic</th>
                    <th>Preu</th>
                    <th>Estat</th>
                    <th>Editar (preu/unitats)</th>
                  </tr>
                </thead>
                <tbody>
                  {g.offers.map((o) => (
                    <OfferSelfEditRow
                      key={o.id}
                      offerId={o.id}
                      farmName={o.farmName}
                      publicName={o.publicName}
                      priceAmountCents={o.priceAmountCents}
                      lifecycle={o.lifecycle}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {groups.length === 0 && (
            <p className="text-sm text-bark-500">Cap oferta visible.</p>
          )}
        </div>
      </section>

      {/* Packs */}
      <section>
        <h2 className="font-semibold text-bark-800">Packs</h2>
        <p className="text-xs text-bark-500">
          Un pack multi-granja només es pot publicar quan TOTES les granges
          participants l&apos;han acceptat. La plataforma no pot forçar
          l&apos;acceptació d&apos;una granja.
        </p>
        <div className="mt-3 space-y-3">
          {packs.map((p) => (
            <PackAcceptPanel
              key={p.id}
              role={user.role}
              userFarmId={user.farmId}
              pack={{
                id: p.id,
                publicName: p.publicName,
                isMultiFarm: p.isMultiFarm,
                lifecycle: p.lifecycle,
                acceptances: p.acceptances.map((a) => ({
                  farmId: a.farmId,
                  farmName: a.farm.name,
                  accepted: a.accepted,
                })),
                itemCount: p.items.length,
              }}
            />
          ))}
          {packs.length === 0 && (
            <p className="text-sm text-bark-500">Cap pack encara.</p>
          )}
        </div>
      </section>
    </div>
  );
}
