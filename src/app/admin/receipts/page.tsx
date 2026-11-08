import { requireAdmin } from "@/lib/auth";
import { listAdminFarms } from "@/lib/admin/data";
import { ReceiptReview } from "@/components/admin/ReceiptReview";

export const dynamic = "force-dynamic";

/**
 * Receipt review. A farm_manager/platform_admin uploads an image/PDF; the
 * FEAT-003 receipt endpoint extracts structured fields (NEVER creating or
 * approving anything); the human edits the PRE-FILLED form and submits. The
 * submission creates a Product + Lot through validateLot and routes them into
 * `pending_review`. The AI never creates or approves these records.
 */
export default async function AdminReceiptsPage() {
  const user = await requireAdmin();
  const farms = await listAdminFarms(user);

  return (
    <div>
      <h1 className="text-2xl font-bold">Ingesta de rebuts</h1>
      <p className="mt-1 text-sm text-pasture-600">
        Puja un rebut (imatge o PDF). La IA n&apos;extreu camps per{" "}
        <b>pre-omplir</b> el formulari. Res no es crea ni s&apos;aprova fins que
        tu ho revises i ho envies; el registre entra a <b>revisió pendent</b>.
      </p>

      <ReceiptReview
        farms={farms.map((f) => ({ id: f.id, name: f.name }))}
      />
    </div>
  );
}
