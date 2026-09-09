import type { ReactNode } from "react";
import { I18nProvider, useLingui } from "@lingui/react";
import { I18nProvider as AriaI18nProvider } from "react-aria-components/I18nProvider";
import { i18n } from "./i18n";

export function AppLocaleProvider({ children }: { children: ReactNode }) {
  return (
    <I18nProvider i18n={i18n}>
      <AriaLocale>{children}</AriaLocale>
    </I18nProvider>
  );
}

function AriaLocale({ children }: { children: ReactNode }) {
  // Subscribe to the activated catalog, including asynchronous language changes.
  const { i18n: activeI18n } = useLingui();
  return <AriaI18nProvider locale={activeI18n.locale}>{children}</AriaI18nProvider>;
}
