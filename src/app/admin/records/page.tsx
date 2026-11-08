import { requireAdmin } from "@/lib/auth";
import { listAdminFarms, listAdminProducts } from "@/lib/admin/data";
import { LifecyclePanel } from "@/components/admin/LifecyclePanel";

export const dynamic = "force-dynamic";

/**
 * Lifecycle controls. Human-only transitions across the lifecycle states, with
 * the approval-separate-from-active invariant enforced by the server action +
 * state machine. farm_manager sees only their farm; platform_admin sees all.
 */
export default async function AdminRecordsPage() {
  const user = await requireAdmin();
  const [farms, products] = await Promise.all([
    listAdminFarms(user),
    listAdminProducts(user),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Cicle de vida dels registres</h1>
      <p className="mt-1 text-sm text-pasture-600">
        Les transicions són exclusivament humanes i queden auditades.{" "}
        <b>Aprovat</b> és independent d&apos;<b>actiu</b>: un registre pot estar
        aprovat però no publicat.
      </p>

      <LifecyclePanel role={user.role} farms={farms} products={products} />
    </div>
  );
}
