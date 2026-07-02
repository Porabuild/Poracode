import type { Metadata } from "next";

import { DownloadContent } from "@/app/download/download-content";
import type { Locale } from "@/lib/i18n/config";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { translate } from "@/lib/i18n/messages";
import { getLatestRelease } from "@/lib/releases";
import { createPageMetadata, SITE_NAME } from "@/lib/seo";

type LocaleParams = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  return createPageMetadata({
    title: `${translate(locale, "nav.download")} ${SITE_NAME}`,
    description: translate(locale, "faq.what.answer"),
    path: "/download",
    locale,
  });
}

export default async function LocaleDownloadPage({ params }: LocaleParams) {
  const { locale } = await params;
  const release = await getLatestRelease();
  return (
    <I18nProvider locale={locale}>
      <DownloadContent release={release} />
    </I18nProvider>
  );
}
