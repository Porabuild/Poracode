import type { Metadata } from "next";

import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { getLatestRelease } from "@/lib/releases";
import {
  createHomeJsonLd,
  createPageMetadata,
  SITE_DESCRIPTION,
  SITE_TITLE,
  stringifyJsonLd,
} from "@/lib/seo";
import { HomeContent } from "./home-content";

export const metadata: Metadata = createPageMetadata({
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  path: "/",
});

export default async function Home() {
  const release = await getLatestRelease();
  return (
    <I18nProvider>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: stringifyJsonLd(createHomeJsonLd(release)) }}
      />
      <HomeContent release={release} />
    </I18nProvider>
  );
}
