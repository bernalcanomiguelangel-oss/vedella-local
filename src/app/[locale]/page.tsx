import Link from "next/link";
import { FarmCard } from "@/components/FarmCard";
import { SearchBar } from "@/components/SearchBar";
import { listOfferedFarms } from "@/lib/catalog";
import { getDictionary, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function HomePage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = resolveLocale(params.locale);
  const dict = getDictionary(locale);
  const farms = await listOfferedFarms(locale);

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-pasture-700 via-pasture-600 to-pasture-800 text-cream-50">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_15%_20%,white_0,transparent_35%),radial-gradient(circle_at_85%_30%,white_0,transparent_30%),radial-gradient(circle_at_50%_90%,white_0,transparent_40%)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <p className="mb-3 inline-block rounded-full bg-cream-50/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest">
            {dict.hero.eyebrow}
          </p>
          <h1 className="max-w-2xl text-4xl font-extrabold leading-tight sm:text-5xl">
            {dict.hero.title}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-cream-100/90">
            {dict.hero.subtitle}
          </p>
          <div className="mt-8">
            <SearchBar
              locale={locale}
              strings={{
                placeholder: dict.search.placeholder,
                button: dict.search.button,
                noResults: dict.search.noResults,
                farms: dict.search.farms,
                products: dict.search.products,
                searchingHint: dict.search.searchingHint,
              }}
            />
            <p className="mt-2 text-sm text-cream-100/70">
              {dict.search.searchingHint}
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="#farms"
              className="rounded-full bg-beef-600 px-5 py-2.5 text-sm font-semibold shadow hover:bg-beef-700"
            >
              {dict.hero.cta}
            </Link>
            <Link
              href="#how"
              className="rounded-full bg-cream-50/15 px-5 py-2.5 text-sm font-semibold ring-1 ring-cream-50/30 hover:bg-cream-50/25"
            >
              {dict.hero.ctaSecondary}
            </Link>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="mx-auto max-w-6xl px-6 py-14">
        <h2 className="text-center text-2xl font-bold text-pasture-900">
          {dict.home.valuesTitle}
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {(
            [
              ["traceability", "🧬"],
              ["local", "🌱"],
              ["fair", "⚖️"],
            ] as const
          ).map(([key, icon]) => (
            <div
              key={key}
              className="rounded-2xl bg-cream-50 p-6 shadow-sm ring-1 ring-pasture-100"
            >
              <div className="text-3xl">{icon}</div>
              <h3 className="mt-3 font-bold text-pasture-900">
                {dict.home.values[key]}
              </h3>
              <p className="mt-1 text-sm text-pasture-700">
                {dict.home.values[`${key}Desc` as const]}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Farms */}
      <section id="farms" className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-pasture-900">
            {dict.home.farmsTitle}
          </h2>
          <p className="text-pasture-600">{dict.home.farmsSubtitle}</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {farms.map((farm) => (
            <FarmCard
              key={farm.id}
              farm={farm}
              locale={locale}
              strings={{
                breed: dict.farm.breed,
                foundedIn: dict.farm.foundedIn,
                animals: dict.farm.animals,
              }}
            />
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto mt-10 max-w-6xl px-6 pb-6">
        <h2 className="text-2xl font-bold text-pasture-900">
          {dict.home.stepsTitle}
        </h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-3">
          {(["one", "two", "three"] as const).map((key, i) => (
            <li
              key={key}
              className="rounded-2xl bg-pasture-50 p-6 ring-1 ring-pasture-100"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-beef-600 font-bold text-cream-50">
                {i + 1}
              </span>
              <p className="mt-3 text-pasture-800">{dict.home.steps[key]}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
