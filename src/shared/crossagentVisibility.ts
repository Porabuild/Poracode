import type { AgentCapability, AgentKind } from "./contracts";
import { capabilitiesForPresentation, filterHiddenModels } from "./agentSelection";
import type { CrossagentExecution } from "./crossagentRanking";

export interface CrossagentVisibilitySettings {
  disabledAgents: readonly string[];
  hiddenModels: Readonly<Record<string, readonly string[] | undefined>>;
  /** Agent kinds paused from the Crossagents rotation (Crossagents-only). */
  crossagentPausedProviders?: readonly string[];
  /** Extra per-agent-kind model ids skipped by Crossagents only. */
  crossagentHiddenModels?: Readonly<Record<string, readonly string[] | undefined>>;
}

export function isCrossagentProviderEnabled(
  kind: AgentKind,
  settings: CrossagentVisibilitySettings,
): boolean {
  return (
    !settings.disabledAgents.includes(kind) &&
    !(settings.crossagentPausedProviders ?? []).includes(kind)
  );
}

/**
 * Settings key holding the *global* hidden-model list for one Crossagents
 * capability surface. Structured children use the optional `<kind>-acp`
 * visibility surface when one exists (Cursor is the current example); every
 * other provider uses its normal kind key.
 */
export function crossagentVisibilityKey(
  kind: AgentKind,
  execution: CrossagentExecution,
  hiddenModels: CrossagentVisibilitySettings["hiddenModels"],
): string {
  const structuredKey = `${kind}-acp`;
  return execution === "structured" && hiddenModels[structuredKey] !== undefined
    ? structuredKey
    : kind;
}

/** Apply only the global (composer-shared) visibility filter. */
export function globalVisibleCrossagentCapabilities(
  kind: AgentKind,
  execution: CrossagentExecution,
  capabilities: AgentCapability,
  settings: CrossagentVisibilitySettings,
): AgentCapability {
  const visibilityKey = crossagentVisibilityKey(kind, execution, settings.hiddenModels);
  return filterHiddenModels(capabilities, settings.hiddenModels[visibilityKey]);
}

/**
 * Apply the provider/model visibility settings the Crossagents roster and
 * spawn validation share: the global `hiddenModels` surface plus the
 * Crossagents-only additions (`crossagentPausedProviders` is checked by
 * `isCrossagentProviderEnabled`; `crossagentHiddenModels` narrows models
 * further, keyed by plain agent kind).
 */
export function filterCrossagentCapabilities(
  kind: AgentKind,
  execution: CrossagentExecution,
  capabilities: AgentCapability,
  settings: CrossagentVisibilitySettings,
): AgentCapability {
  const globallyVisible = globalVisibleCrossagentCapabilities(
    kind,
    execution,
    capabilities,
    settings,
  );
  const extraHidden = settings.crossagentHiddenModels?.[kind];
  if (!extraHidden || extraHidden.length === 0) return globallyVisible;
  const hidden = new Set(extraHidden);
  return { ...globallyVisible, models: globallyVisible.models.filter((m) => !hidden.has(m.id)) };
}

/** Present the capability surface one execution lane shows to Crossagents. */
export function presentedCrossagentCapabilities(
  execution: CrossagentExecution,
  capabilities: AgentCapability,
): AgentCapability {
  return execution === "structured"
    ? capabilitiesForPresentation(capabilities, "gui")
    : capabilities;
}
