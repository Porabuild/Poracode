import { getProviderManifest } from "./providerManifest";

export function defaultFastEnabled(agentKind: string): boolean {
  return getProviderManifest(agentKind)?.defaultFastEnabled ?? true;
}

export function normalizeProviderModelConfig<
  T extends { model?: string | undefined; fast?: boolean | undefined },
>(
  agentKind: string,
  config: T,
  models: readonly { id: string }[],
): T & { fast?: boolean | undefined } {
  return getProviderManifest(agentKind)?.normalizeModelConfig?.(config, models) ?? config;
}

export function canonicalProviderModelId(
  agentKind: string,
  model: string,
  models: readonly { id: string }[],
): string {
  return normalizeProviderModelConfig(agentKind, { model }, models).model;
}
