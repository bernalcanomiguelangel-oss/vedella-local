import { redirect } from "next/navigation";
import { DEFAULT_LOCALE } from "@/lib/i18n";

/**
 * Root redirect: the marketplace is locale-scoped under /[locale]. Send visitors
 * to the default locale (Catalan).
 */
export default function RootIndex() {
  redirect(`/${DEFAULT_LOCALE}`);
}
