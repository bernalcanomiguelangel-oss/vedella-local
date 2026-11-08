import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listAdminFarms, getAdminFarmDetail } from "@/lib/admin/data";
import { FarmDetailPanel } from "@/components/admin/FarmDetailPanel";

export const dynamic = "force-dynamic";

/**
 * Granjas (Farms). List + detail of farms, scoped by role: a farm_manager sees
 * only their own farm, platform_admin sees all. The detail shows the full
 * structured profile, certifications and a public-readiness panel. Profile
 * edits by a farm_manager are SUBMITTED to review; only platform_admin edits the
 * "other information" and approves submissions.
 */
export default async function AdminFarmsPage({
  searchParams,
}: {
  searchParams: { farm?: string };
}) {
  const user = await requireAdmin();
  const farms = await listAdminFarms(user);
  const selectedId = searchParams.farm ?? farms[0]?.id;
  const detail = selectedId ? await getAdminFarmDetail(user, selectedId) : null;

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-bark-900">Granges</h1>
      <p className="mt-1 max-w-2xl text-sm text-bark-600">
        Llista i fitxa de les granges del mercat, amb el perfil estructurat, les
        certificacions i el panell de preparació per publicar.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav className="space-y-1">
          {farms.map((f) => (
            <Link
              key={f.id}
              href={`/admin/farms?farm=${f.id}`}
              className={`block rounded-lg px-3 py-2 text-sm ${
                f.id === selectedId
                  ? "bg-bark-700 text-cream-50"
                  : "bg-cream-50 text-bark-800 hover:bg-cream-200"
              }`}
            >
              <span className="font-semibold">{f.name}</span>
              <span className="ml-2 text-xs opacity-80">{f.lifecycle}</span>
            </Link>
          ))}
          {farms.length === 0 && (
            <p className="text-sm text-bark-500">Cap granja visible.</p>
          )}
        </nav>

        <div>
          {detail ? (
            <FarmDetailPanel
              role={user.role}
              farm={JSON.parse(JSON.stringify(detail.farm))}
              readiness={detail.readiness}
            />
          ) : (
            <p className="text-sm text-bark-500">Selecciona una granja.</p>
          )}
        </div>
      </div>
    </div>
  );
}
