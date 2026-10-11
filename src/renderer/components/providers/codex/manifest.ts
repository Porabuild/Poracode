import { parseCodexProfileInstanceConfig } from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
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
    const provider = "Codex";
    const profile = instance.displayName ?? instance.id;
    return i18n._(msg`${provider} ${profile}`);
  },
  formatTranscriptMarkdown: formatFileCitationMarkdown,
} satisfies RendererProviderManifest;
