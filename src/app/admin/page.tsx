import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import {
  listAdminFarms,
  listAdminProducts,
  listPendingRecords,
  listPendingTranslations,
} from "@/lib/admin/data";

export const dynamic = "force-dynamic";

/** Build a deep link to the orders list filtered by one or more statuses. */
function ordersLink(statuses: string[]): string {
  const params = new URLSearchParams({ status: statuses.join(",") });
  return `/admin/orders?${params.toString()}`;
}

interface ActionList {
  title: string;
  href: string;
  desc: string;
  rows: { id: string; label: string; href: string }[];
  emptyLabel: string;
}

export default async function AdminOverview() {
  const user = await requireAdmin();
  const [farms, products, pending, pendingTranslations] = await Promise.all([
    listAdminFarms(user),
    listAdminProducts(user),
    listPendingRecords(user),
    listPendingTranslations(user),
  ]);

  const pendingCount =
    pending.farms.length + pending.products.length + pendingTranslations.length;
  const activeProducts = products.filter((p) => p.isActive).length;

  // "Needs data correction": approved records that are not yet active, or
  // products still in draft — a stand-in until FEAT-003 adds the full
  // offer/lot field-completeness checks. Each row deep-links to the review or
  // records view with a URL-encoded filter.
  const needsCorrection = products.filter(
    (p) => p.lifecycle === "draft" || (p.isApproved && !p.isActive),
  );

  // Operational count cards — each deep-links to a filtered record set.
  const cards: { href: string; title: string; value: string; desc: string }[] = [
    {
      href: "/admin/review",
      title: "Pendent de revisió",
      value: String(pendingCount),
      desc: "Registres i traduccions pendents d'aprovació humana.",
    },
    {
      href: "/admin/metrics",
      title: "Granges",
      value: String(farms.length),
      desc: "Mètriques del mercat i preu mitjà setmanal per tall.",
    },
    {
      href: "/admin/products",
      title: "Productes actius",
      value: `${activeProducts}/${products.length}`,
      desc: "Gestiona ofertes i packs (aprovat ≠ actiu).",
    },
    {
      href: "/admin/receipts",
      title: "Rebuts",
      value: "Puja",
      desc: "Extreu camps d'un rebut per pre-omplir un formulari humà.",
    },
  ];

  const actionLists: ActionList[] = [
    {
      title: "Cal revisar",
      href: "/admin/review",
      desc: "Granges, productes, ofertes i traduccions pendents d'aprovació.",
      emptyLabel: "Res pendent de revisió.",
      rows: [
        ...pending.farms.map((f) => ({
          id: `farm-${f.id}`,
          label: `Granja · ${f.name}`,
          href: "/admin/review",
        })),
        ...pending.products.map((p) => ({
          id: `product-${p.id}`,
          label: `Producte · ${p.name} (${p.farmName})`,
          href: "/admin/review",
        })),
        ...pendingTranslations.map((t) => ({
          id: `tr-${t.id}`,
          label: `Traducció ${t.locale} · ${t.entityType}`,
          href: "/admin/review",
        })),
      ],
    },
    {
      title: "Cal resposta de la granja",
      href: ordersLink(["awaiting_farm_confirmation"]),
      desc: "Comandes que esperen confirmació de la granja.",
      emptyLabel: "Cap comanda esperant confirmació.",
      rows: [],
    },
    {
      title: "Cal acció de preparació",
      href: ordersLink(["preparing", "ready_for_pickup", "out_for_delivery"]),
      desc: "Comandes en preparació, a punt o en repartiment.",
      emptyLabel: "Cap comanda en preparació.",
      rows: [],
    },
    {
      title: "Cal corregir dades",
      href: "/admin/records",
      desc: "Ofertes i lots amb camps obligatoris incomplets o sense lot elegible.",
      emptyLabel: "Cap registre amb dades incompletes.",
      rows: needsCorrection.map((p) => ({
        id: `fix-${p.id}`,
        label: `${p.name} (${p.farmName}) · ${p.lifecycle}`,
        href: "/admin/records",
      })),
    },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-bark-900">Resum</h1>
      <p className="mt-1 text-sm text-bark-600">
        Sessió: <b>{user.email}</b> · rol{" "}
        <b data-testid="dashboard-role">{user.role}</b>
        {user.role === "farm_manager" && <> · només veus la teva granja</>}
      </p>

      {/* Operational count cards */}
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-2xl bg-cream-50 p-5 shadow-sm ring-1 ring-bark-100 transition hover:ring-bark-300"
          >
            <p className="text-sm font-semibold text-bark-500">{c.title}</p>
            <p className="mt-1 font-display text-3xl font-extrabold text-bark-900">
              {c.value}
            </p>
            <p className="mt-2 text-xs text-bark-600">{c.desc}</p>
          </Link>
        ))}
      </div>

      {/* Four action lists, each deep-linking to a pre-filtered view */}
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {actionLists.map((list) => (
          <section
            key={list.title}
            data-testid="action-list"
            className="rounded-2xl bg-cream-50 p-5 shadow-sm ring-1 ring-bark-100"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-bark-900">
                  {list.title}
                </h2>
                <p className="mt-1 text-xs text-bark-600">{list.desc}</p>
              </div>
              <Link
                href={list.href}
                className="shrink-0 rounded-full bg-bark-700 px-3 py-1 text-xs font-semibold text-cream-50 hover:bg-bark-800"
              >
                Veure {list.rows.length > 0 ? `(${list.rows.length})` : ""}
              </Link>
            </div>
            {list.rows.length === 0 ? (
              <p className="mt-3 text-sm text-bark-400">{list.emptyLabel}</p>
            ) : (
              <ul className="mt-3 divide-y divide-bark-100">
                {list.rows.slice(0, 6).map((row) => (
                  <li key={row.id}>
                    <Link
                      href={row.href}
                      className="flex items-center justify-between py-2 text-sm text-bark-800 hover:text-bark-950"
                    >
                      <span>{row.label}</span>
                      <span aria-hidden>→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <div className="mt-8 rounded-2xl bg-cream-50 p-5 text-sm text-bark-600 ring-1 ring-bark-100">
        <h2 className="font-display font-semibold text-bark-900">
          Recordatori de govern
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            L&apos;aprovació i la publicació són accions{" "}
            <b>exclusivament humanes</b> i queden auditades.
          </li>
          <li>
            Un registre pot estar <b>aprovat però inactiu</b>: l&apos;aprovació és
            independent de l&apos;estat actiu.
          </li>
          <li>
            La IA (traducció, mètriques, rebuts) mai aprova, publica ni fixa
            preus; només pre-omple formularis per a revisió humana.
          </li>
        </ul>
      </div>
    </div>
  );
}
