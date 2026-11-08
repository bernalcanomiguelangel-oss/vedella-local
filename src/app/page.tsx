/**
 * Baseline homepage placeholder. The full marketplace homepage (approved+active
 * farms + search) is implemented in FEAT-002. This keeps the app runnable and
 * confirms the Tailwind palette is wired up.
 */
export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold text-beef-700">Vedella Local</h1>
      <p className="mt-4 text-lg text-pasture-800">
        Mercat de vedella local i traçable de Catalunya. Reserva ara, paga a
        l&apos;entrega.
      </p>
      <p className="mt-8 rounded-lg bg-pasture-100 p-4 text-sm text-pasture-700">
        Base del projecte configurada. El mercat, les pàgines de granja, la cerca
        i la cistella arriben a les properes fases.
      </p>
    </main>
  );
}
