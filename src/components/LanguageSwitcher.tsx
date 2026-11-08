"use client";

/**
 * Language switcher ca/es/en. Rewrites the first path segment to the chosen
 * locale and navigates, preserving the rest of the path.
 */
import { usePathname, useRouter } from "next/navigation";
import { LOCALES, localeNames, type Locale } from "@/lib/i18n";

export function LanguageSwitcher({ current }: { current: Locale }) {
  const pathname = usePathname();
  const router = useRouter();

  function switchTo(locale: Locale) {
    const segments = (pathname || "/").split("/");
    // segments[0] is "" (leading slash); segments[1] is the locale.
    if (LOCALES.includes(segments[1] as Locale)) {
      segments[1] = locale;
    } else {
      segments.splice(1, 0, locale);
    }
    const next = segments.join("/") || `/${locale}`;
    router.push(next);
  }

  return (
    <div className="flex items-center gap-1 rounded-full bg-cream-100 p-1 ring-1 ring-pasture-200">
      {LOCALES.map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => switchTo(loc)}
          aria-pressed={loc === current}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide transition ${
            loc === current
              ? "bg-pasture-600 text-cream-50 shadow"
              : "text-pasture-700 hover:bg-pasture-100"
          }`}
          title={localeNames[loc]}
        >
          {loc}
        </button>
      ))}
    </div>
  );
}
