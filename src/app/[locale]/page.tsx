import Link from "next/link";
import { FarmCard } from "@/components/FarmCard";
import { SearchBar } from "@/components/SearchBar";
import { NotifyMeForm } from "@/components/NotifyMeForm";
import { CycleCountdown } from "@/components/CycleCountdown";
import { listOfferedFarms, getActiveCycleFacts } from "@/lib/catalog";
import { formatDate } from "@/lib/format";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { startPageSession, emit } from "@/lib/analytics-session";

export const dynamic = "force-dynamic";

export default async function HomePage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const locale = resolveLocale(params.locale);
  const dict = getDictionary(locale);
  const [farms, cycle] = await Promise.all([
    listOfferedFarms(locale),
    getActiveCycleFacts(),
  ]);

  // Anonymous visitor tracking (decision 4): resolve the session (emitting
  // session_started + channel attribution on a brand-new session) then record
  // that the marketplace farm list was viewed. No PII is stored.
  const session = await startPageSession(searchParams, locale);
  await emit("farm_list_viewed", { language: locale }, session);

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

      {/* Active reservation cycle — every fact is read from the DB
          (ReservationCycle). The countdown runs against the real closeAt
          timestamp. Nothing here is hard-coded. */}
      {cycle && (
        <section className="mx-auto -mt-8 max-w-6xl px-6" data-testid="cycle-block">
          <div className="rounded-2xl bg-pasture-900 p-6 text-cream-50 shadow-lg ring-1 ring-pasture-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold" data-testid="cycle-name">
                  {cycle.name}
                </h2>
                <p className="text-sm text-cream-100/80">{cycle.transportNote}</p>
              </div>
              {cycle.closed ? (
                <span
                  data-testid="cycle-countdown-closed"
                  className="rounded-full bg-beef-100 px-3 py-1 text-sm font-semibold text-beef-800"
                >
                  {dict.cycle.closed}
                </span>
              ) : (
                <CycleCountdown
                  closeAtIso={cycle.closeAtIso}
                  labels={{
                    closesIn: dict.cycle.closesIn,
                    closed: dict.cycle.closed,
                    days: dict.cycle.days,
                    hours: dict.cycle.hours,
                    minutes: dict.cycle.minutes,
                    seconds: dict.cycle.seconds,
                  }}
                />
              )}
            </div>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-cream-100/70">{dict.cycle.zone}</dt>
                <dd className="font-semibold" data-testid="cycle-zone">
                  {cycle.zone}
                </dd>
              </div>
              <div>
                <dt className="text-cream-100/70">{dict.cycle.method}</dt>
                <dd className="font-semibold">
                  {cycle.method === "delivery_or_pickup"
                    ? dict.cycle.methodDeliveryOrPickup
                    : dict.cycle.methodDelivery}
                </dd>
              </div>
              <div>
                <dt className="text-cream-100/70">{dict.cycle.close}</dt>
                <dd className="font-semibold" data-testid="cycle-close">
                  {formatDate(cycle.closeAtIso, locale)}
                </dd>
              </div>
              <div>
                <dt className="text-cream-100/70">{dict.cycle.delivery}</dt>
                <dd className="font-semibold">
                  {formatDate(cycle.deliveryDateIso, locale)}
                </dd>
              </div>
              {cycle.pickupDateIso && (
                <div>
                  <dt className="text-cream-100/70">{dict.cycle.pickup}</dt>
                  <dd className="font-semibold">
                    {formatDate(cycle.pickupDateIso, locale)}
                  </dd>
                </div>
              )}
              {cycle.deliveryPriceLabel && (
                <div>
                  <dt className="text-cream-100/70">{dict.cycle.deliveryPrice}</dt>
                  <dd className="font-semibold" data-testid="cycle-delivery-price">
                    {cycle.deliveryPriceLabel}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-cream-100/70">{dict.cycle.places}</dt>
                <dd className="font-semibold" data-testid="cycle-places">
                  {cycle.remainingPlaces} / {cycle.totalPlaces}
                </dd>
              </div>
            </dl>
          </div>
        </section>
      )}

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

      {/* Notify-me / interested list (decision 5). Anonymous opt-in email so a
          visitor can be told when the next cycle opens. No marketing automation;
          just capture. */}
      <section className="mx-auto mt-10 max-w-6xl px-6">
        <div className="rounded-2xl bg-pasture-50 p-6 ring-1 ring-pasture-100">
          <h2 className="text-xl font-bold text-pasture-900">
            {dict.notify.title}
          </h2>
          <p className="mt-1 text-sm text-pasture-700">{dict.notify.subtitle}</p>
          <div className="mt-4 max-w-md">
            <NotifyMeForm
              locale={locale}
              strings={{
                placeholder: dict.notify.placeholder,
                button: dict.notify.button,
                success: dict.notify.success,
                error: dict.notify.error,
              }}
            />
          </div>
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
