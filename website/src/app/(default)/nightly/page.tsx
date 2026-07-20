import type { Metadata } from "next";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { getLocaleMessages } from "@/lib/i18n/messages";
import { getLatestNightlyRelease } from "@/lib/releases";
import { createPageMetadata } from "@/lib/seo";
import { NightlyContent } from "@/app/nightly/nightly-content";

export const metadata: Metadata = createPageMetadata({
  title: "Poracode Nightly — Latest pre-release builds",
  description:
    "Download the latest Poracode nightly build. Pre-release installers with the newest changes, refreshed automatically from CI.",
  path: "/nightly",
});

export default async function NightlyPage() {
  const release = await getLatestNightlyRelease();
  return (
    <I18nProvider messages={getLocaleMessages()}>
      <NightlyContent release={release} />
    </I18nProvider>
  );
}
