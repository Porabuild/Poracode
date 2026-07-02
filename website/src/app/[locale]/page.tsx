import type { Metadata } from "next";

import { HomeContent } from "@/app/home-content";
import type { Locale } from "@/lib/i18n/config";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { translate } from "@/lib/i18n/messages";
import { getLatestRelease } from "@/lib/releases";
import { createHomeJsonLd, createPageMetadata, stringifyJsonLd } from "@/lib/seo";

type LocaleParams = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  const title = `${translate(locale, "hero.title1")} ${translate(locale, "hero.title2")}`.replace(
    /\.$/,
    "",
  );
  return createPageMetadata({
    title,
    description: translate(locale, "faq.what.answer"),
    path: "/",
    locale,
  });
}

export default async function LocaleHome({ params }: LocaleParams) {
  const { locale } = await params;
  const release = await getLatestRelease();
  return (
    <I18nProvider locale={locale}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: stringifyJsonLd(createHomeJsonLd(release, locale)) }}
      />
      <HomeContent release={release} />
    </I18nProvider>
  );
}
