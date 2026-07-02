import type { Metadata } from "next";

import { ChangelogContent } from "@/app/changelog/changelog-content";
import type { Locale } from "@/lib/i18n/config";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { translate } from "@/lib/i18n/messages";
import { createPageMetadata, SITE_NAME } from "@/lib/seo";

type LocaleParams = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  return createPageMetadata({
    title: `${translate(locale, "nav.changelog")} ${SITE_NAME}`,
    description: translate(locale, "faq.what.answer"),
    path: "/changelog",
    locale,
  });
}

export default async function LocaleChangelogPage({ params }: LocaleParams) {
  const { locale } = await params;
  return (
    <I18nProvider locale={locale}>
      <ChangelogContent />
    </I18nProvider>
  );
}
