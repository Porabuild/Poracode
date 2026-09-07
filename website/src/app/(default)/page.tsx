import type { Metadata } from "next";

import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { getLocaleMessages } from "@/lib/i18n/messages";
import { getLatestRelease } from "@/lib/releases";
import { CHANGELOG } from "@/lib/changelog";
import {
  createHomeJsonLd,
  createPageMetadata,
  SITE_DESCRIPTION,
  SITE_TITLE,
  stringifyJsonLd,
} from "@/lib/seo";
import { HomeContent } from "@/app/home-content";

export const metadata: Metadata = createPageMetadata({
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  path: "/",
});

export default async function Home() {
  const release = await getLatestRelease();
  return (
    <I18nProvider messages={getLocaleMessages()}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: stringifyJsonLd(createHomeJsonLd(release)) }}
      />
      <HomeContent
        release={release}
        releaseTagline={
          CHANGELOG.find((entry) => entry.version === release.version)?.tagline ?? null
        }
      />
    </I18nProvider>
  );
}
