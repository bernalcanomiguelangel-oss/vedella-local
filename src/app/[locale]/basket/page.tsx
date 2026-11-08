import { BasketView } from "@/components/BasketView";
import { prisma } from "@/lib/db";
import { getDictionary, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function BasketPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = resolveLocale(params.locale);
  const dict = getDictionary(locale);

  const cycle = await prisma.reservationCycle.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });

  const cycleInfo = cycle
    ? {
        name: cycle.name,
        zone: cycle.zone,
        closeDate: cycle.closeDate.toISOString(),
        deliveryDate: cycle.deliveryDate.toISOString(),
        freePlaces: cycle.freePlaces,
        totalPlaces: cycle.totalPlaces,
        transportNote: cycle.transportNote,
      }
    : null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <BasketView locale={locale} dict={dict} cycle={cycleInfo} />
    </main>
  );
}
