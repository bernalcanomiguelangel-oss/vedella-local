export function SiteFooter({
  strings,
}: {
  strings: { tagline: string; rights: string };
}) {
  return (
    <footer className="mt-16 border-t border-pasture-100 bg-pasture-900 text-cream-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-beef-600">
            🐄
          </span>
          <span className="font-bold">Vedella Local</span>
        </div>
        <p className="text-sm text-cream-200/80">{strings.tagline}</p>
        <p className="text-sm font-medium text-cream-100">{strings.rights}</p>
      </div>
    </footer>
  );
}
