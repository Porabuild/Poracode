import type { Metadata } from "next";

import { DownloadContent } from "@/app/download/download-content";
import type { Locale } from "@/lib/i18n/config";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { getLocaleMessages, translate } from "@/lib/i18n/messages";
import { getLatestRelease, getNpmLauncherVersion } from "@/lib/releases";
import { createPageMetadata } from "@/lib/seo";

type LocaleParams = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  return createPageMetadata({
    title: translate(locale, "download.title"),
    description: translate(locale, "download.metaDescription"),
    path: "/download",
    locale,
  });
}

export default async function LocaleDownloadPage({ params }: LocaleParams) {
  const { locale } = await params;
  const [release, npmVersion] = await Promise.all([getLatestRelease(), getNpmLauncherVersion()]);
  return (
    <I18nProvider locale={locale} messages={getLocaleMessages(locale)}>
      <DownloadContent release={release} npxAvailable={npmVersion !== null} />
    </I18nProvider>
  );
}
