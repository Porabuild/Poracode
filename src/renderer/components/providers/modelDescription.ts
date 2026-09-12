import type { MessageDescriptor } from "@lingui/core";
import { lookupProviderRegistration } from "./providerRegistry";

export interface ModelDescriptionHint {
  /** Compact provider-owned numeric/rate hint rendered beside the model name. */
  hint: string;
  /** Localized explanation of the hint's units and ordering. */
  explanation: MessageDescriptor;
}
type ModelDescriptionFormatter = (description: string) => ModelDescriptionHint | undefined;
const formatters = new Map<string, ModelDescriptionFormatter>();

/** Decode provider-native descriptions without adding vendor formats to the shared picker. */
export function registerModelDescriptionFormatter(
  kind: string,
  formatter: ModelDescriptionFormatter,
) {
  formatters.set(kind, formatter);
}
export function formatProviderModelDescription(kind: string, description: string | undefined) {
  return description ? lookupProviderRegistration(formatters, kind)?.(description) : undefined;
}
