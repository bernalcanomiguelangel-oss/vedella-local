"use client";

/**
 * Sticky marketplace header: brand, nav, basket count badge, language switcher.
 */
import Link from "next/link";
import { useBasket } from "@/components/BasketProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import type { Locale } from "@/lib/i18n";

interface HeaderStrings {
  brand: string;
  home: string;
  basket: string;
}

export function SiteHeader({
  locale,
  strings,
}: {
  locale: Locale;
  strings: HeaderStrings;
}) {
  const { unitCount, hydrated } = useBasket();

  return (
    <header className="sticky top-0 z-30 border-b border-pasture-100 bg-cream-50/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href={`/${locale}`} className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-beef-600 text-cream-50 shadow">
            🐄
          </span>
          <span className="text-lg font-extrabold tracking-tight text-pasture-900">
            {strings.brand}
          </span>
        </Link>

        <nav className="flex items-center gap-3 sm:gap-5">
          <Link
            href={`/${locale}`}
            className="hidden text-sm font-medium text-pasture-700 hover:text-beef-700 sm:inline"
          >
            {strings.home}
          </Link>
          <Link
            href={`/${locale}/basket`}
            className="relative inline-flex items-center gap-1.5 rounded-full bg-pasture-600 px-4 py-2 text-sm font-semibold text-cream-50 shadow hover:bg-pasture-700"
          >
            {strings.basket}
            {hydrated && unitCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-beef-600 px-1 text-xs font-bold">
                {unitCount}
              </span>
            )}
          </Link>
          <LanguageSwitcher current={locale} />
        </nav>
      </div>
    </header>
  );
}
