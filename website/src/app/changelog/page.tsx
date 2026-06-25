import type { Metadata } from "next";
import { ChangelogContent } from "./changelog-content";

export const metadata: Metadata = {
  title: "Changelog - Lightcode",
  description: "Everything new in Lightcode — features, improvements, and fixes, newest first.",
};

export default function ChangelogPage() {
  return <ChangelogContent />;
}
