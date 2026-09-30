import { msg } from "@lingui/core/macro";
import type { RendererProviderManifest } from "../providerManifest";
import { formatFileCitationMarkdown } from "./fileCitationMarkdown";

export default {
  kind: "codex",
  label: msg`Codex`,
  sessionImport: { label: msg`Codex CLI`, fallbackModel: "gpt-5.5" },
  order: 20,
  utilityOrder: 10,
  formatTranscriptMarkdown: formatFileCitationMarkdown,
} satisfies RendererProviderManifest;
