"use client";

import { useState, useTransition } from "react";
import { decideCopyVariant } from "@/lib/admin/copy-ab-actions";

/**
 * Human accept / edit / reject control for one AI-proposed copy variant
 * (FEAT-005). A non-empty reason is REQUIRED (enforced here AND server-side by
 * decideCopyVariant). Approve/publish is platform_admin-only on the server; a
 * farm_manager who cannot approve simply gets a FORBIDDEN result shown inline.
 *
 * This widget NEVER prices or publishes anything on its own: it only forwards
 * the human's decision + reason to the server action, which is the sole place a
 * variant's status changes.
 */
export function CopyVariantDecision({
  copyVariantId,
  status,
  canApprove,
}: {
  copyVariantId: string;
  status: string;
  canApprove: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [editedText, setEditedText] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function decide(decision: "approve" | "reject" | "edit") {
    if (reason.trim().length === 0) {
      setError("Cal un motiu per a la decisió / A decision reason is required.");
      return;
    }
    if (decision === "edit" && editedText.trim().length === 0) {
      setError("Cal el text editat per a una edició.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await decideCopyVariant({
        copyVariantId,
        decision,
        reason,
        editedText: decision === "edit" ? editedText : undefined,
      });
      if (res.ok) {
        setDone(decision);
      } else {
        setError(res.message ?? res.code ?? "Error");
      }
    });
  }

  if (done) {
    return (
      <p className="mt-2 text-sm font-semibold text-olive-700" data-testid="copy-decided">
        Decisió registrada: {done}.
      </p>
    );
  }

  return (
    <div className="mt-2" data-testid="copy-decision">
      <label className="block text-xs font-medium text-bark-700">
        Motiu de la decisió (obligatori) · Decision reason (required)
        <input
          className="mt-1 w-full rounded-lg border border-bark-200 p-2 text-sm"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          data-testid="copy-reason"
        />
      </label>
      {showEdit && (
        <label className="mt-2 block text-xs font-medium text-bark-700">
          Text editat · Edited text
          <textarea
            className="mt-1 w-full rounded-lg border border-bark-200 p-2 text-sm"
            rows={3}
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            data-testid="copy-edited-text"
          />
        </label>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => decide("approve")}
          disabled={pending || !canApprove || status === "approved"}
          title={canApprove ? undefined : "Només un platform_admin pot aprovar."}
          data-testid="copy-approve"
          className="rounded-full bg-olive-600 px-3 py-1 text-xs font-semibold text-cream-50 hover:bg-olive-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 disabled:opacity-50"
        >
          Aprova
        </button>
        <button
          type="button"
          onClick={() => {
            if (!showEdit) {
              setShowEdit(true);
              return;
            }
            decide("edit");
          }}
          disabled={pending}
          data-testid="copy-edit"
          className="rounded-full bg-bark-600 px-3 py-1 text-xs font-semibold text-cream-50 hover:bg-bark-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 disabled:opacity-50"
        >
          {showEdit ? "Desa l'edició" : "Edita"}
        </button>
        <button
          type="button"
          onClick={() => decide("reject")}
          disabled={pending}
          data-testid="copy-reject"
          className="rounded-full bg-beef-600 px-3 py-1 text-xs font-semibold text-cream-50 hover:bg-beef-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 disabled:opacity-50"
        >
          Rebutja
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-beef-700" data-testid="copy-error">{error}</p>}
    </div>
  );
}
