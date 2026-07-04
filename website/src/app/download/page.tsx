import type { Metadata } from "next";

import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { getLatestRelease } from "@/lib/releases";
import { createPageMetadata } from "@/lib/seo";
import { DownloadContent } from "./download-content";

export const metadata: Metadata = createPageMetadata({
  title: "Download Poracode",
  description:
    "Download Poracode for macOS, Windows, and Linux. Install the desktop workspace for Claude Code, Codex, Gemini, Cursor, OpenCode, and ACP agents.",
  path: "/download",
});

export default async function DownloadPage() {
  const release = await getLatestRelease();
  return (
    <I18nProvider>
      <DownloadContent release={release} />
    </I18nProvider>
  );
}
