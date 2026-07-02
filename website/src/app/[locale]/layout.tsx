import { DEFAULT_LOCALE, LOCALE_CODES } from "@/lib/i18n/config";

// Only the non-default locales are prefixed (the default locale is served at the
// root). `dynamicParams = false` makes any other segment a 404, so this dynamic
// segment never shadows real routes like /download with a bogus locale.
export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALE_CODES.filter((locale) => locale !== DEFAULT_LOCALE).map((locale) => ({ locale }));
}

export default function LocaleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
