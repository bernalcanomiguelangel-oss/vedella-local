"use client";

/**
 * Search bar + live results. Queries /api/search (debounced) and renders matched
 * farms and products. Only publicly offered records come back from the API.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import type { SearchResult } from "@/lib/catalog";

interface SearchStrings {
  placeholder: string;
  button: string;
  noResults: string;
  farms: string;
  products: string;
  searchingHint: string;
}

export function SearchBar({
  locale,
  strings,
}: {
  locale: Locale;
  strings: SearchStrings;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length === 0) {
      setResults(null);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          setResults((await res.json()) as SearchResult);
          setOpen(true);
        }
      } catch {
        // Aborted or network error: ignore.
      }
    }, 200);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q]);

  // Close results on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const hasResults =
    results && (results.farms.length > 0 || results.products.length > 0);

  return (
    <div ref={boxRef} className="relative w-full max-w-xl">
      <div className="flex items-center gap-2 rounded-full bg-cream-50 px-4 py-2 shadow-lg ring-1 ring-pasture-200 focus-within:ring-2 focus-within:ring-pasture-500">
        <svg
          className="h-5 w-5 shrink-0 text-pasture-500"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 1 0 3.473 9.776l3.376 3.375a.75.75 0 1 0 1.06-1.06l-3.375-3.376A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
            clipRule="evenodd"
          />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results && setOpen(true)}
          placeholder={strings.placeholder}
          aria-label={strings.button}
          className="w-full bg-transparent text-pasture-900 placeholder:text-pasture-400 focus:outline-none"
        />
      </div>

      {open && q.trim().length > 0 && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl bg-cream-50 shadow-2xl ring-1 ring-pasture-200">
          {!hasResults ? (
            <p className="px-4 py-3 text-sm text-pasture-600">
              {strings.noResults}
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto p-2">
              {results!.farms.length > 0 && (
                <div className="px-2 py-1">
                  <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-pasture-500">
                    {strings.farms}
                  </p>
                  {results!.farms.map((f) => (
                    <Link
                      key={f.id}
                      href={`/${locale}/farms/${f.slug}`}
                      onClick={() => setOpen(false)}
                      className="block rounded-lg px-2 py-2 hover:bg-pasture-100"
                    >
                      <span className="font-medium text-pasture-900">
                        {f.name}
                      </span>
                      <span className="ml-2 text-sm text-pasture-500">
                        {f.town} · {f.comarca}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
              {results!.products.length > 0 && (
                <div className="px-2 py-1">
                  <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-pasture-500">
                    {strings.products}
                  </p>
                  {results!.products.map((p) => (
                    <Link
                      key={p.id}
                      href={`/${locale}/farms/${p.farmSlug}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-pasture-100"
                    >
                      <span>
                        <span className="font-medium text-pasture-900">
                          {p.name}
                        </span>
                        <span className="ml-2 text-sm text-pasture-500">
                          {p.farmName}
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-beef-700">
                        {p.priceLabel}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
