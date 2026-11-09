import Link from "next/link";

/**
 * Titled placeholder for admin sections whose full UI lands in later phases
 * (FEAT-003+). The route already re-authenticates server-side and scopes by
 * role before this renders; the placeholder only explains what the section will
 * hold and keeps the route reachable from the nav.
 */
export function SectionPlaceholder({
  title,
  description,
  scopeNote,
  children,
}: {
  title: string;
  description: string;
  scopeNote?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-bark-900">{title}</h1>
      <p className="mt-1 max-w-2xl text-sm text-bark-600">{description}</p>
      {scopeNote && (
        <p className="mt-2 text-xs text-bark-500" data-testid="scope-note">
          {scopeNote}
        </p>
      )}
      {children}
      <div className="mt-6 rounded-2xl border border-dashed border-bark-300 bg-cream-50 p-5 text-sm text-bark-600">
        <p>
          Aquesta secció s&apos;està construint. La seva interfície completa
          arriba en una fase posterior; la ruta ja aplica el control d&apos;accés
          al servidor.
        </p>
        <p className="mt-2">
          <Link href="/admin" className="font-semibold text-bark-800 underline">
            ← Torna al resum
          </Link>
        </p>
      </div>
    </div>
  );
}
