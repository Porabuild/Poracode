import type { AgentCapability, AgentKind } from "@/shared/contracts";
import { capabilitiesForPresentation, filterHiddenModels } from "@/shared/agentSelection";
import type { AgentAdapter } from "@/supervisor/agents/base";
import { resolveSubagentExecution } from "./types";
import type { SpawnableAgentExecution } from "./types";

export interface CrossagentVisibilitySettings {
  disabledAgents: readonly string[];
  hiddenModels: Readonly<Record<string, readonly string[] | undefined>>;
}

export function isCrossagentProviderEnabled(
  kind: AgentKind,
  settings: CrossagentVisibilitySettings,
): boolean {
  return !settings.disabledAgents.includes(kind);
}

/**
 * Apply the same provider/model visibility settings used by the composer.
 * Structured children use the optional `<kind>-acp` visibility surface when
 * one exists (Cursor is the current example); every other provider uses its
 * normal kind key.
 */
export function filterCrossagentCapabilities(
  kind: AgentKind,
  execution: SpawnableAgentExecution,
  capabilities: AgentCapability,
  settings: CrossagentVisibilitySettings,
): AgentCapability {
  const structuredKey = `${kind}-acp`;
  const visibilityKey =
    execution === "structured" && settings.hiddenModels[structuredKey] !== undefined
      ? structuredKey
      : kind;
  return filterHiddenModels(capabilities, settings.hiddenModels[visibilityKey]);
}

/** Resolve the exact settings-filtered capability surface accepted at spawn time. */
export function visibleCrossagentCapabilitiesForAdapter(
  adapter: AgentAdapter,
  cachedCapabilities: AgentCapability | undefined,
  settings: CrossagentVisibilitySettings,
): AgentCapability | null {
  if (!isCrossagentProviderEnabled(adapter.kind, settings)) return null;
  const execution = resolveSubagentExecution(adapter);
  if (!execution) return null;
  const base = cachedCapabilities ?? adapter.capabilities;
  const presented = execution === "structured" ? capabilitiesForPresentation(base, "gui") : base;
  return filterCrossagentCapabilities(adapter.kind, execution, presented, settings);
}
