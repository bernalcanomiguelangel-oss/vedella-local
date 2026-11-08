import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import type { OfferedFarm } from "@/lib/catalog";

interface FarmCardStrings {
  breed: string;
  foundedIn: string;
  animals: string;
}

/**
 * Marketplace farm card. Uses a CSS pasture gradient as imagery so the app ships
 * with no external image assets (works fully offline).
 */
export function FarmCard({
  farm,
  locale,
  strings,
}: {
  farm: OfferedFarm;
  locale: Locale;
  strings: FarmCardStrings;
}) {
  return (
    <Link
      href={`/${locale}/farms/${farm.slug}`}
      className="group block overflow-hidden rounded-2xl bg-cream-50 shadow-md ring-1 ring-pasture-100 transition hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="relative h-40 bg-gradient-to-br from-pasture-400 via-pasture-500 to-pasture-700">
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_30%,white_0,transparent_40%),radial-gradient(circle_at_80%_70%,white_0,transparent_35%)]" />
        <div className="absolute bottom-3 left-4 rounded-full bg-cream-50/90 px-3 py-1 text-xs font-semibold text-pasture-700 shadow">
          {farm.comarca}
        </div>
      </div>
      <div className="p-5">
        <h3 className="text-lg font-bold text-pasture-900 group-hover:text-beef-700">
          {farm.name}
        </h3>
        <p className="mt-0.5 text-sm text-pasture-500">{farm.town}</p>
        <p className="mt-3 line-clamp-3 text-sm text-pasture-700">
          {farm.story}
        </p>
        <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-pasture-600">
          <div>
            <dt className="inline font-semibold">{strings.breed}: </dt>
            <dd className="inline">{farm.breed}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">{strings.foundedIn} </dt>
            <dd className="inline">{farm.foundedYear}</dd>
          </div>
          <div>
            <dd className="inline">
              {farm.animalCount} {strings.animals}
            </dd>
          </div>
        </dl>
      </div>
    </Link>
  );
}
