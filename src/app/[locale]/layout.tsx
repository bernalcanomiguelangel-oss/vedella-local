import { notFound } from "next/navigation";
import { BasketProvider } from "@/components/BasketProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getDictionary, isLocale, LOCALES, type Locale } from "@/lib/i18n";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!isLocale(params.locale)) {
    notFound();
  }
  const locale = params.locale as Locale;
  const dict = getDictionary(locale);

  return (
    <BasketProvider>
      <div className="flex min-h-screen flex-col">
        <SiteHeader
          locale={locale}
          strings={{
            brand: dict.brand,
            home: dict.nav.home,
            basket: dict.nav.basket,
          }}
        />
        <div className="flex-1">{children}</div>
        <SiteFooter
          strings={{ tagline: dict.footer.tagline, rights: dict.footer.rights }}
        />
      </div>
    </BasketProvider>
  );
}
