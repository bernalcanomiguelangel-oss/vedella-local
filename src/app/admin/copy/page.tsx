import { requireAdmin } from "@/lib/auth";
import { loadCopyAbData } from "@/lib/admin/copy-ab-data";
import { listAdminOffers } from "@/lib/admin/data";
import { CopyProposeControls } from "@/components/admin/CopyProposeControls";
import { CopyVariantDecision } from "@/components/admin/CopyVariantDecision";

export const dynamic = "force-dynamic";

/**
 * Copy A/B — the human-approved, auditable AI copy loop (FEAT-005).
 *
 * The AI PROPOSES alternative product descriptions and an LLM-as-JUDGE scores
 * them PASS/FAIL/UNKNOWN with a reason, using human-authored rules AND the
 * accumulated examples of past human decisions (NOT model training). A HUMAN
 * then accepts / edits / rejects each variant WITH a required reason; publish /
 * approve is platform_admin-only. Running experiments are measured with the
 * existing anonymous analytics (impressions + conversions), reported as RAW
 * counts with the numerator/denominator named and an explicit small-sample
 * caveat — never a significance claim. Everything is clearly labelled as an AI
 * DRAFT / RECOMMENDATION; nothing goes live without the human action.
 */
export default async function AdminCopyAbPage() {
  const user = await requireAdmin();
  const canApprove = user.role === "platform_admin";
  const [data, offers] = await Promise.all([
    loadCopyAbData(user),
    listAdminOffers(user),
  ]);

  const verdictBadge = (verdict: string) => {
    const base = "rounded-full px-2 py-0.5 text-xs font-semibold";
    if (verdict === "PASS") return `${base} bg-olive-100 text-olive-800`;
    if (verdict === "FAIL") return `${base} bg-beef-100 text-beef-800`;
    return `${base} bg-cream-100 text-bark-600`;
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl font-bold text-bark-900">
          Copy A/B (descripcions)
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-bark-600">
          L&apos;IA <strong>proposa</strong> descripcions alternatives i un{" "}
          <strong>jutge (LLM-as-judge)</strong> les puntua PASS/FAIL amb un motiu,
          seguint regles humanes i els <strong>exemples acumulats</strong> de
          decisions humanes anteriors (no s&apos;entrena cap model). Un humà{" "}
          <strong>accepta, edita o rebutja</strong> cada variant amb un motiu
          obligatori; només un <code>platform_admin</code> pot aprovar/publicar.
          Es mesura amb l&apos;analítica anònima existent (impressions +
          conversions) amb avisos de mostra petita i sense afirmar
          significació estadística.
        </p>
      </header>

      {/* Judge-vs-human agreement: TWO SEPARATE counts, never one accuracy. */}
      <section
        data-testid="judge-agreement"
        className="rounded-2xl border border-bark-200 bg-white p-4"
      >
        <h2 className="font-display text-lg font-bold text-bark-800">
          Acord jutge ↔ humà (comptes separats)
        </h2>
        <p className="text-xs text-bark-500">
          Es reporten per separat i <strong>mai</strong> es col·lapsen en una sola
          xifra d&apos;&quot;exactitud&quot;.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
          <div>
            <dt className="text-bark-500">Fallades detectades</dt>
            <dd className="text-lg font-bold text-bark-900" data-testid="failures-caught">
              {data.agreement.failuresCaught}
            </dd>
            <dd className="text-xs text-bark-500">jutge FAIL + humà rebutja/edita</dd>
          </div>
          <div>
            <dt className="text-bark-500">Aprovacions coincidents</dt>
            <dd className="text-lg font-bold text-bark-900" data-testid="passes-agreed">
              {data.agreement.passesAgreed}
            </dd>
            <dd className="text-xs text-bark-500">jutge PASS + humà aprova</dd>
          </div>
          <div>
            <dt className="text-bark-500">Desacord (jutge massa dur)</dt>
            <dd className="text-lg font-bold text-bark-900">
              {data.agreement.disagreementsJudgeFailHumanApprove}
            </dd>
          </div>
          <div>
            <dt className="text-bark-500">Desacord (jutge massa tou)</dt>
            <dd className="text-lg font-bold text-bark-900">
              {data.agreement.disagreementsJudgePassHumanReject}
            </dd>
          </div>
        </dl>
      </section>

      {/* Propose a draft for any offer in scope. */}
      <section className="rounded-2xl border border-dashed border-bark-300 bg-cream-50 p-4">
        <h2 className="font-display text-lg font-bold text-bark-800">Proposa variants per a una oferta</h2>
        <p className="text-xs text-bark-500">
          Tria una oferta i genera un esborrany d&apos;IA (ca per defecte). Pots
          canviar de locale un cop proposat.
        </p>
        <div className="mt-3 space-y-2">
          {offers.slice(0, 20).map((o) => (
            <div
              key={o.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2 ring-1 ring-bark-100"
            >
              <span className="text-sm text-bark-800">
                {o.publicName}{" "}
                <span className="text-xs text-bark-500">({o.farmName})</span>
              </span>
              <CopyProposeControls offerId={o.id} locale="ca" variantIds={[]} />
            </div>
          ))}
          {offers.length === 0 && (
            <p className="text-sm text-bark-500">Cap oferta visible.</p>
          )}
        </div>
      </section>

      {/* Offers with proposed variants: judge verdicts + human decision. */}
      <section className="space-y-5">
        <h2 className="font-display text-lg font-bold text-bark-800">Variants proposades</h2>
        {data.offers.length === 0 && (
          <p className="text-sm text-bark-500">
            Encara no hi ha variants. Proposa&apos;n per a una oferta a dalt.
          </p>
        )}
        {data.offers.map((offer) => (
          <article
            key={offer.offerId}
            data-testid="copy-offer"
            className="rounded-2xl border border-bark-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-bark-900">
                {offer.publicName}{" "}
                <span className="text-xs font-normal text-bark-500">
                  ({offer.farmName})
                </span>
              </h3>
              <CopyProposeControls
                offerId={offer.offerId}
                locale={offer.variants[0]?.locale ?? "ca"}
                variantIds={offer.variants.map((v) => v.id)}
              />
            </div>

            <ul className="mt-3 space-y-3">
              {offer.variants.map((v) => (
                <li
                  key={v.id}
                  data-testid="copy-variant"
                  className="rounded-xl bg-cream-50 p-3 ring-1 ring-bark-100"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-bark-100 px-2 py-0.5 text-xs text-bark-600">
                      {v.locale} · {v.status} · {v.source}
                    </span>
                    {v.judge ? (
                      <span className={verdictBadge(v.judge.verdict)} data-testid="judge-verdict">
                        Jutge: {v.judge.verdict}
                      </span>
                    ) : (
                      <span className="rounded-full bg-cream-100 px-2 py-0.5 text-xs text-bark-500">
                        Jutge: sense avaluar
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-bark-800" data-testid="variant-text">
                    {v.text}
                  </p>
                  {v.judge?.reason && (
                    <p className="mt-1 text-xs text-bark-500">
                      Motiu del jutge: {v.judge.reason}
                    </p>
                  )}
                  {v.evidence.length > 0 && (
                    <p className="mt-1 text-xs text-bark-500">
                      Evidència: {v.evidence.join("; ")}
                    </p>
                  )}
                  <CopyVariantDecision
                    copyVariantId={v.id}
                    status={v.status}
                    canApprove={canApprove}
                  />
                </li>
              ))}
            </ul>

            {/* Running experiment: raw per-variant impressions/conversions. */}
            {offer.experiment?.metrics && (
              <div
                data-testid="experiment-metrics"
                className="mt-4 rounded-xl border border-bark-100 bg-white p-3"
              >
                <h4 className="font-display text-sm font-bold text-bark-800">
                  Experiment {offer.experiment.status} · {offer.experiment.locale}
                </h4>
                <p className="text-xs text-bark-500">
                  Comptes crus. Numerador ={" "}
                  <strong>{offer.experiment.metrics.numeratorLabel}</strong>{" "}
                  (sessions convertides); denominador ={" "}
                  <strong>{offer.experiment.metrics.denominatorLabel}</strong>{" "}
                  (sessions impressionades). Sense afirmació de significació
                  estadística.
                </p>
                {offer.experiment.metrics.sampleTooSmall && (
                  <p
                    data-testid="small-sample-warning"
                    className="mt-1 rounded bg-cream-100 px-2 py-1 text-xs text-beef-800"
                  >
                    ⚠ Mostra massa petita (&lt;{" "}
                    {offer.experiment.metrics.smallSampleThreshold} impressions en
                    alguna variant): no en treguis conclusions.
                  </p>
                )}
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[26rem] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-bark-500">
                        <th className="py-1 pr-3">Variant</th>
                        <th className="py-1 text-right tabular-nums">Impressions (denom.)</th>
                        <th className="py-1 text-right tabular-nums">Conversions (numer.)</th>
                        <th className="py-1 text-right tabular-nums">Taxa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[offer.experiment.metrics.variantA, offer.experiment.metrics.variantB].map(
                        (vc) => (
                          <tr key={vc.copyVariantId} className="border-t border-bark-100 align-top">
                            <td className="py-1 pr-3">
                              <span className="font-semibold text-bark-800">{vc.arm}</span>
                              <span className="ml-1 block max-w-[16rem] truncate text-xs text-bark-500">
                                {vc.text}
                              </span>
                            </td>
                            <td className="py-1 text-right tabular-nums">{vc.impressedSessions}</td>
                            <td className="py-1 text-right tabular-nums">{vc.convertedSessions}</td>
                            <td className="py-1 text-right tabular-nums">
                              {(vc.conversionRate * 100).toFixed(1)}%
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </article>
        ))}
      </section>

      {/* Decision / audit history: the underlying decisions are visible. */}
      <section
        data-testid="decision-history"
        className="rounded-2xl border border-bark-200 bg-white p-4"
      >
        <h2 className="font-display text-lg font-bold text-bark-800">
          Historial de decisions (exemples acumulats)
        </h2>
        <p className="text-xs text-bark-500">
          Cada decisió humana queda registrada amb el seu motiu i es reutilitza
          com a exemple (few-shot) en les properes propostes i judicis.
          L&apos;aprenentatge és per acumulació d&apos;exemples, no per
          entrenament d&apos;un model.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {data.history.map((h) => (
            <li
              key={h.id}
              className="rounded-lg bg-cream-50 p-2 ring-1 ring-bark-100"
              data-testid="history-row"
            >
              <span className="font-semibold text-bark-800">{h.verdict}</span>{" "}
              <span className="text-xs text-bark-500">
                {h.locale ?? "—"} · {new Date(h.createdAt).toLocaleString()}
              </span>
              <p className="text-xs text-bark-600">Motiu: {h.reason}</p>
            </li>
          ))}
          {data.history.length === 0 && (
            <li className="text-sm text-bark-500">Encara no hi ha decisions.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
