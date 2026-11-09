import Link from "next/link";
import { notFound } from "next/navigation";
import { CutCard, PackCard } from "@/components/ProductCard";
import { getFarmCatalog } from "@/lib/catalog";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { startPageSession, emit } from "@/lib/analytics-session";
import {
  isPublicImageRef,
  publicImageRefs,
  imageAltText,
} from "@/lib/image-display";

export const dynamic = "force-dynamic";

export default async function FarmPage({
  params,
  searchParams,
}: {
  params: { locale: string; slug: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const locale = resolveLocale(params.locale);
  const dict = getDictionary(locale);
  const farm = await getFarmCatalog(params.slug, locale);

  // 404 when the farm is not approved+active (getFarmCatalog returns null).
  if (!farm) {
    notFound();
  }

  // Anonymous visitor tracking (decision 4): record that this specific farm was
  // viewed. A farm referral code on the URL (?ref=) attributes the session to
  // this farm. No PII is stored.
  const session = await startPageSession(searchParams, locale);
  await emit("farm_viewed", { farmId: farm.id, language: locale }, session);

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
    traceability: dict.farm.traceability,
    farmLabel: dict.farm.farmLabel,
    cutLabel: dict.farm.cutLabel,
    packLabel: dict.farm.packLabel,
  };

  const hasProducts = farm.packs.length > 0 || farm.cuts.length > 0;
  const hasHero = isPublicImageRef(farm.heroImageRef);
  const gallery = publicImageRefs(farm.galleryRefs);

  return (
    <main>
      {/* Farm header. When an APPROVED hero image exists it fills the banner
          behind a dark scrim that keeps the cream text readable; otherwise the
          established pasture gradient is used as a graceful fallback so seeded
          farms with no upload still look polished. */}
      <section className="relative overflow-hidden bg-gradient-to-br from-pasture-600 to-pasture-800 text-cream-50">
        {hasHero ? (
          <>
            <img
              src={farm.heroImageRef as string}
              alt={imageAltText(farm.name)}
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* Scrim: decorative, ensures text contrast over the photo. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-br from-pasture-900/80 via-pasture-900/55 to-pasture-800/70"
            />
          </>
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_30%,white_0,transparent_40%),radial-gradient(circle_at_80%_70%,white_0,transparent_35%)]"
          />
        )}
        <div className="relative mx-auto max-w-6xl px-6 py-14">
          <Link
            href={`/${locale}`}
            className="rounded text-sm text-cream-100/80 hover:text-cream-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream-50 focus-visible:ring-offset-2 focus-visible:ring-offset-pasture-800"
          >
            ← {dict.farm.backToMarket}
          </Link>
          <h1 className="mt-3 font-display text-4xl font-extrabold">{farm.name}</h1>
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

      {/* FEAT-003: the farm-wide traceability list was removed from here.
          Each cut/pack now renders its OWN Farm → Lot → Tall(→ Paquet) chain
          inside its product card (see ProductCard CutCard / PackCard). */}

      {/* Farm gallery (FEAT-004): only APPROVED gallery photos are ever exposed
          here. Rendered with a consistent 4:3 aspect ratio; absent entirely for
          seeded farms with no uploads. */}
      {gallery.length > 0 && (
        <section
          data-testid="farm-gallery"
          className="mx-auto max-w-6xl px-6 pt-8"
        >
          <h2 className="mb-4 text-2xl font-bold text-pasture-900">
            {dict.media.galleryTitle}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gallery.map((src, i) => (
              <div
                key={`${src}-${i}`}
                className="aspect-[4/3] overflow-hidden rounded-2xl ring-1 ring-pasture-100"
              >
                <img
                  src={src}
                  alt={imageAltText(farm.name, `${i + 1}`)}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {!hasProducts && (
        <p className="mx-auto max-w-6xl px-6 py-12 text-pasture-600">
          {dict.farm.noProducts}
        </p>
      )}

      {/* Packs */}
      {farm.packs.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-8">
          <h2 className="mb-5 font-display text-2xl font-bold text-pasture-900">
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
          <h2 className="mb-2 font-display text-2xl font-bold text-pasture-900">
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
