import { AddToBasketButton } from "@/components/AddToBasketButton";
import type { OfferedCut, OfferedPack, ProductTrace } from "@/lib/catalog";

interface ProductStrings {
  weight: string;
  thickness: string;
  maturation: string;
  packaging: string;
  shelfLife: string;
  addToBasket: string;
  added: string;
  included: string;
  units: string;
  lot: string;
  traceability: string;
  farmLabel: string;
  cutLabel: string;
  packLabel: string;
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value || value === "—") return null;
  return (
    <div className="flex justify-between gap-3 border-b border-pasture-100 py-1 last:border-0">
      <dt className="text-pasture-500">{label}</dt>
      <dd className="text-right font-medium text-pasture-800">{value}</dd>
    </div>
  );
}

/**
 * Per-product traceability chain (FEAT-003). Renders this specific product's
 * Farm → Lot → Tall(→ Paquet) provenance inside its card, resolved from the
 * lot(s) that actually back the offer. Reuses the chip/pill styling moved down
 * from the old farm-wide section; lot references stay in monospace. `withPack`
 * appends the Paquet node for pack-item chains.
 */
function TraceChain({
  entries,
  strings,
  withPack,
}: {
  entries: ProductTrace[];
  strings: ProductStrings;
  withPack: boolean;
}) {
  if (entries.length === 0) return null;
  return (
    <div
      data-testid="product-trace"
      className="mt-3 rounded-xl bg-pasture-50 px-3 py-2 text-xs text-pasture-700 ring-1 ring-pasture-100"
    >
      <span className="font-semibold">{strings.traceability}</span>
      <ul className="mt-2 space-y-1.5">
        {entries.map((t, i) => (
          <li
            key={`${t.cutName}-${t.lotReference ?? i}`}
            data-testid="product-trace-item"
            className="flex flex-wrap items-center gap-1.5"
          >
            <span
              className="rounded-full bg-cream-50 px-2.5 py-0.5 ring-1 ring-pasture-200"
              title={strings.farmLabel}
            >
              {t.farmName}
            </span>
            <span className="text-pasture-400">→</span>
            <span
              className="rounded-full bg-cream-50 px-2.5 py-0.5 font-mono ring-1 ring-pasture-200"
              title={strings.lot}
            >
              {t.lotReference ?? "—"}
            </span>
            <span className="text-pasture-400">→</span>
            <span
              className="rounded-full bg-cream-50 px-2.5 py-0.5 ring-1 ring-pasture-200"
              title={strings.cutLabel}
            >
              {t.cutName}
            </span>
            {withPack && t.packName && (
              <>
                <span className="text-pasture-400">→</span>
                <span
                  className="rounded-full bg-cream-50 px-2.5 py-0.5 ring-1 ring-pasture-200"
                  title={strings.packLabel}
                >
                  {t.packName}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CutCard({
  cut,
  farmSlug,
  farmName,
  strings,
}: {
  cut: OfferedCut;
  farmSlug: string;
  farmName: string;
  strings: ProductStrings;
}) {
  return (
    <div
      data-testid="cut-card"
      data-product-name={cut.name}
      className="flex flex-col rounded-2xl bg-cream-50 p-5 shadow-sm ring-1 ring-pasture-100"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-bold text-pasture-900">{cut.name}</h4>
        <span className="rounded-full bg-beef-50 px-2.5 py-1 text-sm font-bold text-beef-700">
          {cut.priceLabel}
        </span>
      </div>
      <p className="mt-1 text-sm text-pasture-700">{cut.description}</p>
      <dl className="mt-3 text-xs">
        <Fact label={strings.weight} value={cut.weight} />
        <Fact label={strings.thickness} value={cut.thickness} />
        <Fact label={strings.maturation} value={cut.maturation} />
        <Fact label={strings.packaging} value={cut.packaging} />
        <Fact label={strings.shelfLife} value={cut.shelfLife} />
      </dl>
      <TraceChain entries={[cut.trace]} strings={strings} withPack={false} />
      <div className="mt-auto pt-3">
        <AddToBasketButton
          item={{
            productId: cut.id,
            kind: "cut",
            name: cut.name,
            unitPriceCents: cut.basePriceCents,
            farmSlug,
            farmName,
            lotReference: cut.lotReference,
          }}
          label={strings.addToBasket}
          addedLabel={strings.added}
        />
      </div>
    </div>
  );
}

export function PackCard({
  pack,
  farmSlug,
  farmName,
  strings,
}: {
  pack: OfferedPack;
  farmSlug: string;
  farmName: string;
  strings: ProductStrings;
}) {
  return (
    <div
      data-testid="pack-card"
      data-product-name={pack.name}
      className="flex flex-col rounded-2xl bg-gradient-to-b from-cream-50 to-cream-100 p-5 shadow-md ring-1 ring-pasture-200"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-lg font-bold text-pasture-900">{pack.name}</h4>
        <span className="rounded-full bg-beef-600 px-3 py-1 text-sm font-bold text-cream-50 shadow">
          {pack.priceLabel}
        </span>
      </div>
      <p className="mt-1 text-sm text-pasture-700">{pack.description}</p>
      {pack.weight && (
        <p className="mt-1 text-xs text-pasture-500">{pack.weight}</p>
      )}
      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-pasture-500">
          {strings.included}
        </p>
        <ul className="mt-1 space-y-1 text-sm text-pasture-800">
          {pack.items.map((it) => (
            <li key={it.cutProductId} className="flex justify-between gap-2">
              <span>
                {it.name}
                {pack.isMultiFarm && it.farmName && (
                  <span className="ml-1 text-xs text-pasture-500">
                    · {it.farmName}
                  </span>
                )}
                {it.lotReference && (
                  <span className="ml-1 font-mono text-xs text-pasture-400">
                    {it.lotReference}
                  </span>
                )}
              </span>
              <span className="whitespace-nowrap text-pasture-500">
                {it.quantity} {strings.units}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <TraceChain entries={pack.trace} strings={strings} withPack={true} />
      <div className="mt-auto pt-3">
        <AddToBasketButton
          item={{
            productId: pack.id,
            kind: "pack",
            name: pack.name,
            unitPriceCents: pack.basePriceCents,
            farmSlug,
            farmName,
            lotReference: pack.lotReference,
          }}
          label={strings.addToBasket}
          addedLabel={strings.added}
        />
      </div>
    </div>
  );
}
