import type { AgentCapability } from "@/shared/contracts";
import type { SessionConfigOptions } from "@/shared/contracts/sessionConfigOptions";
import { capabilitiesForSessionConfig } from "@/shared/sessionConfigCapabilities";
import { getProviderManifest } from "./providerManifest";

export function defaultFastEnabled(agentKind: string): boolean {
  return getProviderManifest(agentKind)?.defaultFastEnabled ?? true;
}

/**
 * Detection capabilities overlaid with the live session catalog, then the
 * provider's composer projection. The projection runs after the overlay so a
 * variant the session lists as its own model can fold back into its control.
 */
export function composerCapabilitiesForSession(
  agentKind: string,
  base: AgentCapability,
  options: SessionConfigOptions | null | undefined,
): AgentCapability {
  const overlaid = capabilitiesForSessionConfig(base, options);
  return getProviderManifest(agentKind)?.projectComposerCapabilities?.(overlaid) ?? overlaid;
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
