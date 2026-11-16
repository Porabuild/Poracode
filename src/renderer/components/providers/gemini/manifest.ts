import { parseGeminiProfileInstanceConfig } from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import { msg } from "@lingui/core/macro";
import type { RendererProviderManifest } from "../providerManifest";

export default {
  kind: "gemini",
  label: msg`Gemini`,
  order: 30,
  profileUsageLabel: (instance) => {
    if (!parseGeminiProfileInstanceConfig(instance.config).homeDir) return undefined;
    const profile = instance.displayName ?? instance.id;
    return i18n._(msg`Gemini ${profile}`);
  },
} satisfies RendererProviderManifest;
