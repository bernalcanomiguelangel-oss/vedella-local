import Link from "next/link";
import { notFound } from "next/navigation";
import { CutCard, PackCard } from "@/components/ProductCard";
import { getFarmCatalog } from "@/lib/catalog";
import { getDictionary, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function FarmPage({
  params,
}: {
  params: { locale: string; slug: string };
}) {
  const locale = resolveLocale(params.locale);
  const dict = getDictionary(locale);
  const farm = await getFarmCatalog(params.slug, locale);

  // 404 when the farm is not approved+active (getFarmCatalog returns null).
  if (!farm) {
    notFound();
  }

  const productStrings = {
    weight: dict.product.weight,
    thickness: dict.product.thickness,
    maturation: dict.product.maturation,
    packaging: dict.product.packaging,
    shelfLife: dict.product.shelfLife,
    addToBasket: dict.product.addToBasket,
    added: dict.product.added,
    included: dict.farm.included,
    units: dict.farm.units,
    lot: dict.farm.lot,
  };

  const hasProducts = farm.packs.length > 0 || farm.cuts.length > 0;

  return (
    <main>
      {/* Farm header */}
      <section className="relative overflow-hidden bg-gradient-to-br from-pasture-600 to-pasture-800 text-cream-50">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_30%,white_0,transparent_40%),radial-gradient(circle_at_80%_70%,white_0,transparent_35%)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-14">
          <Link
            href={`/${locale}`}
            className="text-sm text-cream-100/80 hover:text-cream-50"
          >
            ← {dict.farm.backToMarket}
          </Link>
          <h1 className="mt-3 text-4xl font-extrabold">{farm.name}</h1>
          <p className="mt-1 text-cream-100/90">
            {farm.town} · {farm.comarca}
          </p>
          <p className="mt-4 max-w-2xl text-cream-100/90">{farm.story}</p>
          <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <dt className="text-cream-100/70">{dict.farm.breed}</dt>
              <dd className="font-semibold">{farm.breed}</dd>
            </div>
            <div>
              <dt className="text-cream-100/70">{dict.farm.foundedIn}</dt>
              <dd className="font-semibold">{farm.foundedYear}</dd>
            </div>
            <div>
              <dt className="text-cream-100/70">{dict.farm.animals}</dt>
              <dd className="font-semibold">{farm.animalCount}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Rich profile + approved certifications (decision 3 / rule C). Only
          approved certifications are ever shown; unverified claims are never
          exposed by getFarmCatalog. */}
      {(farm.profile.productionMethod ||
        farm.profile.traceabilityInfo ||
        farm.profile.welfareInfo ||
        farm.profile.feedInfo ||
        farm.certifications.length > 0) && (
        <section className="mx-auto max-w-6xl px-6 pt-8">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3 text-sm text-pasture-800">
              {farm.profile.productionMethod && (
                <p>
                  <span className="font-semibold">Mètode de producció:</span>{" "}
                  {farm.profile.productionMethod}
                </p>
              )}
              {farm.profile.welfareInfo && (
                <p>
                  <span className="font-semibold">Benestar animal:</span>{" "}
                  {farm.profile.welfareInfo}
                </p>
              )}
              {farm.profile.feedInfo && (
                <p>
                  <span className="font-semibold">Alimentació:</span>{" "}
                  {farm.profile.feedInfo}
                </p>
              )}
              {farm.profile.traceabilityInfo && (
                <p>
                  <span className="font-semibold">Traçabilitat:</span>{" "}
                  {farm.profile.traceabilityInfo}
                </p>
              )}
            </div>
            {farm.certifications.length > 0 && (
              <div>
                <h3 className="font-semibold text-pasture-900">Certificacions</h3>
                <ul className="mt-2 space-y-2">
                  {farm.certifications.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-lg bg-pasture-50 px-3 py-2 text-sm ring-1 ring-pasture-100"
                    >
                      <span className="font-semibold">{c.title}</span>
                      {c.body && <p className="text-pasture-700">{c.body}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Traceability chain */}
      <section className="mx-auto max-w-6xl px-6 pt-8">
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-pasture-50 px-4 py-3 text-sm text-pasture-700 ring-1 ring-pasture-100">
          <span className="font-semibold">{dict.farm.traceability}:</span>
          <span className="rounded-full bg-cream-50 px-2.5 py-0.5 ring-1 ring-pasture-200">
            Granja
          </span>
          <span className="text-pasture-400">→</span>
          <span className="rounded-full bg-cream-50 px-2.5 py-0.5 ring-1 ring-pasture-200">
            Lot
          </span>
          <span className="text-pasture-400">→</span>
          <span className="rounded-full bg-cream-50 px-2.5 py-0.5 ring-1 ring-pasture-200">
            Tall
          </span>
          <span className="text-pasture-400">→</span>
          <span className="rounded-full bg-cream-50 px-2.5 py-0.5 ring-1 ring-pasture-200">
            Paquet
          </span>
        </div>
      </section>

      {!hasProducts && (
        <p className="mx-auto max-w-6xl px-6 py-12 text-pasture-600">
          {dict.farm.noProducts}
        </p>
      )}

      {/* Packs */}
      {farm.packs.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-8">
          <h2 className="mb-5 text-2xl font-bold text-pasture-900">
            {dict.farm.packsTitle}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {farm.packs.map((pack) => (
              <PackCard
                key={pack.id}
                pack={pack}
                farmSlug={farm.slug}
                farmName={farm.name}
                strings={productStrings}
              />
            ))}
          </div>
        </section>
      )}

      {/* Cuts */}
      {farm.cuts.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-8">
          <h2 className="mb-2 text-2xl font-bold text-pasture-900">
            {dict.farm.cutsTitle}
          </h2>
          <p className="mb-5 text-sm text-pasture-500">
            {dict.product.surchargeNote}
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {farm.cuts.map((cut) => (
              <CutCard
                key={cut.id}
                cut={cut}
                farmSlug={farm.slug}
                farmName={farm.name}
                strings={productStrings}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
