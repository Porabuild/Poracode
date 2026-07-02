import type { Metadata } from "next";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { getLatestNightlyRelease } from "@/lib/releases";
import { createPageMetadata } from "@/lib/seo";
import { NightlyContent } from "./nightly-content";

export const metadata: Metadata = createPageMetadata({
  title: "Lightcode Nightly — Latest pre-release builds",
  description:
    "Download the latest Lightcode nightly build. Pre-release installers with the newest changes, refreshed automatically from CI.",
  path: "/nightly",
});

export default async function NightlyPage() {
  const release = await getLatestNightlyRelease();
  return (
    <I18nProvider>
      <NightlyContent release={release} />
    </I18nProvider>
  );
}
