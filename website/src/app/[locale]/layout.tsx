import { ROOT_METADATA, SiteDocument } from "@/app/site-document";
import { DEFAULT_LOCALE, LOCALE_CODES } from "@/lib/i18n/config";

export const metadata = ROOT_METADATA;

// Only the non-default locales are prefixed (the default locale is served at the
// root). `dynamicParams = false` makes any other segment a 404, so this dynamic
// segment never shadows real routes like /download with a bogus locale.
export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALE_CODES.filter((locale) => locale !== DEFAULT_LOCALE).map((locale) => ({ locale }));
}

export default async function LocaleRootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <SiteDocument lang={locale}>{children}</SiteDocument>;
}
