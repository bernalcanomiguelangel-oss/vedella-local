import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import {
  listAdminFarms,
  listAdminProducts,
  listPendingRecords,
  listPendingTranslations,
} from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
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

  const cards: { href: string; title: string; value: string; desc: string }[] = [
    {
      href: "/admin/review",
      title: "Cua de revisió",
      value: String(pendingCount),
      desc: "Registres i traduccions pendents d'aprovació humana.",
    },
    {
      href: "/admin/records",
      title: "Productes actius",
      value: `${activeProducts}/${products.length}`,
      desc: "Gestiona el cicle de vida (aprovat ≠ actiu).",
    },
    {
      href: "/admin/metrics",
      title: "Granges",
      value: String(farms.length),
      desc: "Mètriques del mercat i preu mitjà setmanal per tall.",
    },
    {
      href: "/admin/receipts",
      title: "Rebuts",
      value: "Puja",
      desc: "Extreu camps d'un rebut per pre-omplir un formulari humà.",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold">Panell d&apos;administració</h1>
      <p className="mt-1 text-sm text-pasture-600">
        Sessió: <b>{user.email}</b> · rol{" "}
        <b data-testid="dashboard-role">{user.role}</b>
        {user.role === "farm_manager" && (
          <> · només veus la teva granja</>
        )}
      </p>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-2xl bg-cream-50 p-5 shadow-sm ring-1 ring-pasture-100 transition hover:ring-pasture-300"
          >
            <p className="text-sm font-semibold text-pasture-500">{c.title}</p>
            <p className="mt-1 text-3xl font-extrabold text-pasture-900">
              {c.value}
            </p>
            <p className="mt-2 text-xs text-pasture-600">{c.desc}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 rounded-2xl bg-cream-50 p-5 text-sm text-pasture-600 ring-1 ring-pasture-100">
        <h2 className="font-semibold text-pasture-900">Recordatori de govern</h2>
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
            La IQ (traducció, mètriques, rebuts) mai aprova, publica ni fixa
            preus; només pre-omple formularis per a revisió humana.
          </li>
        </ul>
      </div>
    </div>
  );
}
