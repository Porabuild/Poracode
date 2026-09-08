import { getProviderManifest } from "@/renderer/components/providers/providerManifest";

/**
 * Provider-supplied rewrite for transcript markdown that can still carry
 * provider-native blocks. Shared chat code only consumes the generic
 * `(text) => text` shape; providers own what they rewrite and why.
 */
export function resolveThreadTranscriptMarkdownFormatter(
  agentKind: string,
): ((text: string) => string) | undefined {
  return getProviderManifest(agentKind)?.formatTranscriptMarkdown;
}
