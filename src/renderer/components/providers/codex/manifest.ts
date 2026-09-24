import { parseCodexProfileInstanceConfig } from "@/shared/contracts";
import { msg } from "@lingui/core/macro";
import type { RendererProviderManifest } from "../providerManifest";
import { formatFileCitationMarkdown } from "./fileCitationMarkdown";

export default {
  kind: "codex",
  label: msg`Codex`,
  order: 20,
  utilityOrder: 10,
  profileUsageLabel: (instance) => {
    if (!parseCodexProfileInstanceConfig(instance.config).homeDir) return undefined;
    return `Codex ${instance.displayName ?? instance.id}`;
  },
  formatTranscriptMarkdown: formatFileCitationMarkdown,
} satisfies RendererProviderManifest;
