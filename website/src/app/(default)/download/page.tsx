import type { Metadata } from "next";

import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { getLocaleMessages } from "@/lib/i18n/messages";
import { getLatestRelease } from "@/lib/releases";
import { createPageMetadata } from "@/lib/seo";
import { DownloadContent } from "@/app/download/download-content";

export const metadata: Metadata = createPageMetadata({
  title: "Download Poracode",
  description:
    "Download Poracode for macOS, Windows, and Linux. Install the desktop workspace for Claude Code, Codex, Gemini, Cursor, OpenCode, and ACP agents.",
  path: "/download",
});

export default async function DownloadPage() {
  const release = await getLatestRelease();
  return (
    <I18nProvider messages={getLocaleMessages()}>
      <DownloadContent release={release} />
    </I18nProvider>
  );
}
