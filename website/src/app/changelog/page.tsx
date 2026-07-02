import type { Metadata } from "next";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { createPageMetadata } from "@/lib/seo";
import { ChangelogContent } from "./changelog-content";

export const metadata: Metadata = createPageMetadata({
  title: "Lightcode Changelog",
  description: "Everything new in Lightcode — features, improvements, and fixes, newest first.",
  path: "/changelog",
});

export default function ChangelogPage() {
  return (
    <I18nProvider>
      <ChangelogContent />
    </I18nProvider>
  );
}
