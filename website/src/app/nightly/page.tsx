import type { Metadata } from "next";
import { getLatestNightlyRelease } from "@/lib/releases";
import { NightlyContent } from "./nightly-content";

export const metadata: Metadata = {
  title: "Lightcode Nightly — Latest pre-release builds",
  description:
    "Download the latest Lightcode nightly build. Pre-release installers with the newest changes, refreshed automatically from CI.",
};

export default async function NightlyPage() {
  const release = await getLatestNightlyRelease();
  return <NightlyContent release={release} />;
}
