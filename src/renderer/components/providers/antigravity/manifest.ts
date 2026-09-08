import { msg } from "@lingui/core/macro";
import type { RendererProviderManifest } from "../providerManifest";
import { formatTaskNotificationMarkdown } from "./taskNotificationMarkdown";

export default {
  kind: "antigravity",
  label: msg`Antigravity`,
  order: 50,
  formatTranscriptMarkdown: formatTaskNotificationMarkdown,
} satisfies RendererProviderManifest;
