"use client";

/**
 * Receipt upload -> pre-filled human review form. The upload calls the FEAT-003
 * receipt endpoint (which creates/approves NOTHING, only extracts fields). The
 * extracted values pre-fill an editable form; the human confirms them, enters a
 * price (AI never sets prices), and submits. Submission calls createFromReceipt,
 * which creates a Product + Lot via validateLot and routes them to pending_review.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFromReceipt } from "@/lib/admin/actions";

interface Extracted<T> {
  value: T | null;
  evidence: { sourceRef: string | null; needsEvidence: boolean };
}

interface ReceiptExtraction {
  farmName: Extracted<string>;
  productName: Extracted<string>;
  lotReference: Extracted<string>;
  units: Extracted<number>;
  slaughterDate: Extracted<string>;
  cuttingDate: Extracted<string>;
  packingDate: Extracted<string>;
  expiryDate: Extracted<string>;
  notes: string;
}

interface FormState {
  farmId: string;
  productName: string;
  productKind: "cut" | "pack";
  priceEuros: string;
  lotReference: string;
  units: string;
  slaughterDate: string;
  cuttingDate: string;
  packingDate: string;
  expiryDate: string;
}

function evidenceBadge(e: { needsEvidence: boolean; sourceRef: string | null }) {
  if (e.needsEvidence) {
    return (
      <span className="ml-2 rounded-full bg-beef-100 px-2 py-0.5 text-[10px] font-semibold text-beef-800">
        needs-evidence
      </span>
    );
  }
  return (
    <span className="ml-2 rounded-full bg-pasture-100 px-2 py-0.5 text-[10px] font-semibold text-pasture-700">
      {e.sourceRef ?? "font"}
    </span>
  );
}

export function ReceiptReview({
  farms,
}: {
  farms: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ReceiptExtraction | null>(null);
  const [injection, setInjection] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploadError(null);
    setResult(null);
    const input = e.currentTarget.elements.namedItem("file") as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) {
      setUploadError("Tria un fitxer primer.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    setUploading(true);
    try {
      const res = await fetch("/api/ai/receipt", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.prefill) {
        setUploadError(
          data?.code ? `Extracció no vàlida (${data.code}).` : "Extracció no vàlida.",
        );
        setExtraction(null);
        setForm(null);
        return;
      }
      const ex = data.prefill as ReceiptExtraction;
      setExtraction(ex);
      setInjection(!!data.injectionSuspected);
      setForm({
        farmId: farms[0]?.id ?? "",
        productName: ex.productName.value ?? "",
        productKind: "cut",
        priceEuros: "", // human enters the price; AI never provides it
        lotReference: ex.lotReference.value ?? "",
        units: ex.units.value != null ? String(ex.units.value) : "",
        slaughterDate: ex.slaughterDate.value ?? "",
        cuttingDate: ex.cuttingDate.value ?? "",
        packingDate: ex.packingDate.value ?? "",
        expiryDate: ex.expiryDate.value ?? "",
      });
    } catch {
      setUploadError("No s'ha pogut processar el fitxer.");
    } finally {
      setUploading(false);
    }
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  function submit() {
    if (!form) return;
    setResult(null);
    const priceCents = Math.round(parseFloat(form.priceEuros.replace(",", ".")) * 100);
    startTransition(async () => {
      const res = await createFromReceipt({
        farmId: form.farmId,
        productName: form.productName,
        productKind: form.productKind,
        basePriceCents: Number.isFinite(priceCents) ? priceCents : -1,
        lotReference: form.lotReference,
        units: parseInt(form.units, 10),
        slaughterDate: form.slaughterDate,
        cuttingDate: form.cuttingDate,
        packingDate: form.packingDate,
        expiryDate: form.expiryDate,
      });
      if (res.ok) {
        setResult("Creat a revisió pendent. Cap registre s'ha aprovat.");
        setExtraction(null);
        setForm(null);
        router.refresh();
      } else {
        setResult(`Error: ${res.message ?? res.code}`);
      }
    });
  }

  const field =
    "w-full rounded-lg border border-pasture-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pasture-400";

  return (
    <div className="mt-6 space-y-6">
      {/* Upload */}
      <form
        onSubmit={onUpload}
        className="rounded-2xl bg-cream-50 p-5 shadow-sm ring-1 ring-pasture-100"
      >
        <label className="block text-sm font-semibold">
          Rebut (PNG, JPEG, WebP o PDF)
        </label>
        <input
          type="file"
          name="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          data-testid="receipt-file"
          className="mt-2 block text-sm"
        />
        <button
          type="submit"
          disabled={uploading}
          data-testid="receipt-upload"
          className="mt-3 rounded-full bg-beef-600 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-beef-700 disabled:opacity-50"
        >
          {uploading ? "Extraient…" : "Extreu els camps"}
        </button>
        {uploadError && (
          <p className="mt-2 text-sm text-beef-700">{uploadError}</p>
        )}
      </form>

      {injection && (
        <p className="rounded-lg bg-beef-50 p-3 text-sm text-beef-800 ring-1 ring-beef-200">
          Atenció: el text del document contenia instruccions sospitoses. Es
          tracten com a dades; no poden canviar permisos, aprovacions ni preus.
        </p>
      )}

      {/* Pre-filled review form */}
      {form && extraction && (
        <div
          data-testid="receipt-form"
          className="rounded-2xl bg-cream-50 p-5 shadow-sm ring-1 ring-pasture-100"
        >
          <h2 className="font-bold">Formulari pre-omplert (revisió humana)</h2>
          <p className="mt-1 text-xs text-pasture-500">
            Confirma cada camp. El preu l&apos;introdueixes tu: la IA mai fixa
            preus.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold">Granja</label>
              <select
                value={form.farmId}
                onChange={(e) => update("farmId", e.target.value)}
                data-testid="receipt-farm"
                className={field}
              >
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold">Tipus</label>
              <select
                value={form.productKind}
                onChange={(e) =>
                  update("productKind", e.target.value as "cut" | "pack")
                }
                className={field}
              >
                <option value="cut">Tall</option>
                <option value="pack">Pack</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold">
                Nom del producte
                {evidenceBadge(extraction.productName.evidence)}
              </label>
              <input
                value={form.productName}
                onChange={(e) => update("productName", e.target.value)}
                data-testid="receipt-product-name"
                className={field}
              />
            </div>
            <div>
              <label className="text-sm font-semibold">
                Preu (€) · l&apos;introdueix l&apos;humà
              </label>
              <input
                value={form.priceEuros}
                onChange={(e) => update("priceEuros", e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                data-testid="receipt-price"
                className={field}
              />
            </div>
            <div>
              <label className="text-sm font-semibold">
                Referència de lot
                {evidenceBadge(extraction.lotReference.evidence)}
              </label>
              <input
                value={form.lotReference}
                onChange={(e) => update("lotReference", e.target.value)}
                data-testid="receipt-lot"
                className={field}
              />
            </div>
            <div>
              <label className="text-sm font-semibold">
                Unitats{evidenceBadge(extraction.units.evidence)}
              </label>
              <input
                value={form.units}
                onChange={(e) => update("units", e.target.value)}
                inputMode="numeric"
                className={field}
              />
            </div>
            <div>
              <label className="text-sm font-semibold">
                Data de sacrifici
                {evidenceBadge(extraction.slaughterDate.evidence)}
              </label>
              <input
                type="date"
                value={form.slaughterDate}
                onChange={(e) => update("slaughterDate", e.target.value)}
                className={field}
              />
            </div>
            <div>
              <label className="text-sm font-semibold">
                Data de tall{evidenceBadge(extraction.cuttingDate.evidence)}
              </label>
              <input
                type="date"
                value={form.cuttingDate}
                onChange={(e) => update("cuttingDate", e.target.value)}
                className={field}
              />
            </div>
            <div>
              <label className="text-sm font-semibold">
                Data d&apos;envasat
                {evidenceBadge(extraction.packingDate.evidence)}
              </label>
              <input
                type="date"
                value={form.packingDate}
                onChange={(e) => update("packingDate", e.target.value)}
                className={field}
              />
            </div>
            <div>
              <label className="text-sm font-semibold">
                Data de caducitat
                {evidenceBadge(extraction.expiryDate.evidence)}
              </label>
              <input
                type="date"
                value={form.expiryDate}
                onChange={(e) => update("expiryDate", e.target.value)}
                className={field}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            data-testid="receipt-submit"
            className="mt-5 rounded-full bg-pasture-600 px-5 py-2.5 text-sm font-semibold text-cream-50 hover:bg-pasture-700 disabled:opacity-50"
          >
            {isPending ? "Creant…" : "Crea a revisió pendent"}
          </button>
        </div>
      )}

      {result && (
        <p
          data-testid="receipt-result"
          className="rounded-lg bg-pasture-50 p-3 text-sm font-medium text-pasture-800 ring-1 ring-pasture-100"
        >
          {result}
        </p>
      )}
    </div>
  );
}
