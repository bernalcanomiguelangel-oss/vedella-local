"use client";

import { useState, useTransition } from "react";
import {
  profileSubmitReviewAction,
  profileDirectEditAction,
  certSubmitAction,
  certApproveAction,
  certRejectAction,
} from "@/lib/admin/manage-actions";
import { ImageUploadControl } from "@/components/admin/ImageUploadControl";

interface Cert {
  id: string;
  type: string;
  title: string;
  body: string;
  status: string;
  evidenceRef: string | null;
}

interface FarmLike {
  id: string;
  name: string;
  town: string;
  comarca: string;
  breed: string;
  story: string;
  productionMethod: string | null;
  traceabilityInfo: string | null;
  welfareInfo: string | null;
  feedInfo: string | null;
  locationDetail: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
  otherInformation: string | null;
  heroImageRef: string | null;
  pendingHeroImageRef: string | null;
  galleryRefs: string | null;
  pendingGalleryRefs: string | null;
  certifications: Cert[];
}

/** Parse a nullable JSON-array string of image paths; tolerant of bad data. */
function parseGallery(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

interface Readiness {
  approved: boolean;
  active: boolean;
  notTest: boolean;
  hasEligibleOffer: boolean;
  publicReady: boolean;
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className={ok ? "text-olive-700" : "text-red-600"}>
        {ok ? "✓" : "✗"}
      </span>
      {label}
    </li>
  );
}

export function FarmDetailPanel({
  role,
  farm,
  readiness,
}: {
  role: string;
  farm: FarmLike;
  readiness: Readiness;
}) {
  const isPlatform = role === "platform_admin";
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const [story, setStory] = useState(farm.story ?? "");
  const [productionMethod, setProductionMethod] = useState(farm.productionMethod ?? "");
  const [traceabilityInfo, setTraceabilityInfo] = useState(farm.traceabilityInfo ?? "");
  const [otherInformation, setOtherInformation] = useState(farm.otherInformation ?? "");

  const [certTitle, setCertTitle] = useState("");
  const [certType, setCertType] = useState("organic");
  const [certEvidence, setCertEvidence] = useState("");

  function saveProfile() {
    const changes = { story, productionMethod, traceabilityInfo };
    startTransition(async () => {
      const res = isPlatform
        ? await profileDirectEditAction(farm.id, changes)
        : await profileSubmitReviewAction(farm.id, changes);
      setMsg(
        res.ok
          ? isPlatform
            ? "Canvis aplicats."
            : "Canvis enviats a revisió de la plataforma."
          : res.message ?? "Error",
      );
    });
  }

  function saveOtherInfo() {
    startTransition(async () => {
      const res = await profileDirectEditAction(farm.id, { otherInformation });
      setMsg(res.ok ? "Altra informació desada." : res.message ?? "Error");
    });
  }

  function submitCert() {
    startTransition(async () => {
      const res = await certSubmitAction({
        farmId: farm.id,
        type: certType,
        title: certTitle,
        evidenceRef: certEvidence || undefined,
      });
      setMsg(
        res.ok
          ? "Certificació enviada a revisió (no és pública fins l'aprovació)."
          : res.message ?? "Error",
      );
      if (res.ok) setCertTitle("");
    });
  }

  function decideCert(id: string, approve: boolean) {
    startTransition(async () => {
      const res = approve
        ? await certApproveAction(id)
        : await certRejectAction(id, "Rebutjada");
      setMsg(res.ok ? "Fet." : res.message ?? "Error");
    });
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display text-xl font-bold text-bark-900">{farm.name}</h2>
        <p className="text-sm text-bark-600">
          {farm.town} · {farm.comarca} · {farm.breed}
        </p>
      </header>

      {/* Public-readiness panel */}
      <section className="rounded-2xl border border-bark-200 bg-cream-50 p-4">
        <h3 className="font-semibold text-bark-800">Preparació per publicar</h3>
        <ul className="mt-2 space-y-1">
          <Check ok={readiness.approved} label="Aprovada" />
          <Check ok={readiness.active} label="Activa" />
          <Check ok={readiness.notTest} label="No és de prova" />
          <Check ok={readiness.hasEligibleOffer} label="Té una oferta activa amb lot elegible" />
        </ul>
        <p className={`mt-2 text-sm font-semibold ${readiness.publicReady ? "text-olive-700" : "text-bark-500"}`}>
          {readiness.publicReady ? "Llesta per al públic" : "Encara no és pública"}
        </p>
      </section>

      {/* Structured profile (review-gated for farm_manager) */}
      <section className="rounded-2xl border border-bark-200 bg-white p-4">
        <h3 className="font-semibold text-bark-800">Perfil de la granja</h3>
        <p className="text-xs text-bark-500">
          {isPlatform
            ? "Els teus canvis s'apliquen directament."
            : "Els teus canvis s'envien a revisió; no es publiquen fins que la plataforma els aprova."}
        </p>
        <label className="mt-3 block text-sm font-medium">Història</label>
        <textarea
          className="mt-1 w-full rounded-lg border border-bark-300 p-2 text-sm"
          rows={3}
          value={story}
          onChange={(e) => setStory(e.target.value)}
        />
        <label className="mt-3 block text-sm font-medium">Mètode de producció</label>
        <input
          className="mt-1 w-full rounded-lg border border-bark-300 p-2 text-sm"
          value={productionMethod}
          onChange={(e) => setProductionMethod(e.target.value)}
        />
        <label className="mt-3 block text-sm font-medium">Informació de traçabilitat</label>
        <textarea
          className="mt-1 w-full rounded-lg border border-bark-300 p-2 text-sm"
          rows={2}
          value={traceabilityInfo}
          onChange={(e) => setTraceabilityInfo(e.target.value)}
        />
        <button
          onClick={saveProfile}
          disabled={pending}
          className="mt-3 rounded-full bg-bark-700 px-4 py-1.5 text-sm font-semibold text-cream-50 hover:bg-bark-800 disabled:opacity-50"
        >
          {isPlatform ? "Desa" : "Envia a revisió"}
        </button>
      </section>

      {/* Farm images (hero + gallery). Uploads are SUBMITTED and only public
          after platform_admin approval, by default. */}
      <section className="rounded-2xl border border-bark-200 bg-white p-4">
        <h3 className="font-semibold text-bark-800">Imatges de la granja</h3>
        <p className="text-xs text-bark-500">
          Puja la imatge de portada i les fotos de la galeria. S&apos;envien a
          revisió i es publiquen quan la plataforma les aprova.
        </p>
        <div className="mt-3 space-y-3">
          <ImageUploadControl
            target="farm_hero"
            targetId={farm.id}
            title="Imatge de portada"
            currentRef={farm.heroImageRef}
            pendingRef={farm.pendingHeroImageRef}
            isPlatform={isPlatform}
          />
          <ImageUploadControl
            target="farm_gallery"
            targetId={farm.id}
            title="Galeria (afegeix una foto)"
            currentRef={parseGallery(farm.galleryRefs)[0] ?? null}
            pendingRef={parseGallery(farm.pendingGalleryRefs).slice(-1)[0] ?? null}
            isPlatform={isPlatform}
          />
        </div>
      </section>

      {/* "Other information" — platform_admin only */}
      {isPlatform && (
        <section className="rounded-2xl border border-gold-300 bg-gold-50 p-4">
          <h3 className="font-semibold text-bark-800">Altra informació (només plataforma)</h3>
          <textarea
            className="mt-2 w-full rounded-lg border border-bark-300 p-2 text-sm"
            rows={2}
            value={otherInformation}
            onChange={(e) => setOtherInformation(e.target.value)}
          />
          <button
            onClick={saveOtherInfo}
            disabled={pending}
            className="mt-2 rounded-full bg-bark-700 px-4 py-1.5 text-sm font-semibold text-cream-50 hover:bg-bark-800 disabled:opacity-50"
          >
            Desa
          </button>
        </section>
      )}

      {/* Certifications */}
      <section className="rounded-2xl border border-bark-200 bg-white p-4">
        <h3 className="font-semibold text-bark-800">Certificacions</h3>
        <p className="text-xs text-bark-500">
          Les certificacions no verificades MAI són públiques. Cal una prova i
          l&apos;aprovació de la plataforma.
        </p>
        <ul className="mt-3 space-y-2">
          {farm.certifications.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-lg bg-cream-50 px-3 py-2 text-sm"
            >
              <span>
                <span className="font-semibold">{c.title}</span>{" "}
                <span className="text-xs text-bark-500">({c.type})</span>{" "}
                <span
                  className={`ml-1 rounded-full px-2 py-0.5 text-xs ${
                    c.status === "approved"
                      ? "bg-olive-100 text-olive-800"
                      : c.status === "rejected"
                        ? "bg-red-100 text-red-700"
                        : "bg-gold-100 text-gold-800"
                  }`}
                >
                  {c.status}
                </span>
              </span>
              {isPlatform && c.status === "pending_review" && (
                <span className="flex gap-2">
                  <button
                    onClick={() => decideCert(c.id, true)}
                    disabled={pending}
                    className="rounded bg-olive-600 px-2 py-0.5 text-xs text-white"
                  >
                    Aprova
                  </button>
                  <button
                    onClick={() => decideCert(c.id, false)}
                    disabled={pending}
                    className="rounded bg-red-600 px-2 py-0.5 text-xs text-white"
                  >
                    Rebutja
                  </button>
                </span>
              )}
            </li>
          ))}
          {farm.certifications.length === 0 && (
            <li className="text-sm text-bark-500">Cap certificació encara.</li>
          )}
        </ul>

        <div className="mt-4 rounded-lg border border-dashed border-bark-300 p-3">
          <h4 className="text-sm font-semibold">Nova certificació (amb prova)</h4>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <input
              className="rounded-lg border border-bark-300 p-2 text-sm"
              placeholder="Títol"
              value={certTitle}
              onChange={(e) => setCertTitle(e.target.value)}
            />
            <input
              className="rounded-lg border border-bark-300 p-2 text-sm"
              placeholder="Tipus"
              value={certType}
              onChange={(e) => setCertType(e.target.value)}
            />
            <input
              className="rounded-lg border border-bark-300 p-2 text-sm"
              placeholder="Referència de la prova"
              value={certEvidence}
              onChange={(e) => setCertEvidence(e.target.value)}
            />
          </div>
          <button
            onClick={submitCert}
            disabled={pending || !certTitle}
            className="mt-2 rounded-full bg-bark-700 px-4 py-1.5 text-sm font-semibold text-cream-50 hover:bg-bark-800 disabled:opacity-50"
          >
            Envia a revisió
          </button>
        </div>
      </section>

      {msg && <p className="text-sm text-olive-700">{msg}</p>}
    </div>
  );
}
