"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { DEFAULT_LOCALE, type Locale } from "./config";
import { translate, type MessageKey } from "./messages";

interface I18nValue {
  locale: Locale;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * The active locale is owned by the URL: the default locale renders at the root
 * (e.g. "/") and every other locale under a path prefix (e.g. "/es"). Each page
 * passes its route locale here, so the server renders the right language and
 * there is no client-side locale flip. Language switching is navigation — see
 * <LanguageSelector>.
 */
export function I18nProvider({
  locale = DEFAULT_LOCALE,
  children,
}: {
  locale?: Locale;
  children: ReactNode;
}) {
  // Keep <html lang> in sync with the route locale (the root layout renders a
  // static lang="en"; this corrects it on prefixed locale routes after hydration).
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value: I18nValue = {
    locale,
    t: (key, vars) => translate(locale, key, vars),
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}
