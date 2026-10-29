export interface UtilityTaskDefaults {
  label?: string;
  hint?: string;
  model: string;
  effort: string;
}

export interface UtilityTaskModel {
  id: string;
  label?: string;
}

export interface UtilityTaskCandidateAgent {
  kind: string;
  installed?: boolean;
  authState?: string;
  capabilities: {
    models: readonly UtilityTaskModel[];
    /** Whether the provider can run a non-interactive one-shot generation. */
    supportsOneShot?: boolean | undefined;
  };
}

export interface UtilityTaskCandidateOptions {
  /**
   * Drop providers that cannot run a one-shot generation. Used by the title /
   * commit-message sections, which shell out to a single non-interactive call;
   * interactive-only runtime-registered providers would always throw
   * "does not support one-shot generation". Conflict resolution launches a full
   * thread session instead, so it leaves this unset and keeps every provider.
   */
  requireOneShot?: boolean;
}

export interface UtilityTaskConfigAgent extends UtilityTaskCandidateAgent {
  capabilities: {
    models: readonly UtilityTaskModel[];
    efforts: readonly string[];
    modelEfforts: Record<string, string[]>;
    defaultEffort?: string | undefined;
  };
}

export interface ResolveUtilityTaskOptions {
  fallbackModelIds?: (
    agent: UtilityTaskConfigAgent,
    defaults: UtilityTaskDefaults | undefined,
  ) => readonly (string | undefined)[];
  fallbackEfforts?: (
    agent: UtilityTaskConfigAgent,
    defaults: UtilityTaskDefaults | undefined,
    availableEfforts: readonly string[],
  ) => readonly (string | undefined)[];
}

export function getMiniModelId(agent: UtilityTaskConfigAgent): string | undefined {
  return agent.capabilities.models.find(
    (model) => /\bmini\b/i.test(model.id) || /\bmini\b/i.test(model.label ?? ""),
  )?.id;
}

export function hasModel(agent: UtilityTaskCandidateAgent, modelId: string): boolean {
  return agent.capabilities.models.some((model) => model.id === modelId);
}

function findFallbackModel(
  agent: UtilityTaskConfigAgent,
  defaults: UtilityTaskDefaults | undefined,
  fallbackModelIds: readonly (string | undefined)[],
): string | undefined {
  for (const modelId of fallbackModelIds) {
    if (modelId && hasModel(agent, modelId)) return modelId;
  }
  if (defaults?.model && hasModel(agent, defaults.model)) return defaults.model;
  return undefined;
}

function findFallbackEffort(
  availableEfforts: readonly string[],
  fallbackEfforts: readonly (string | undefined)[],
): string | undefined {
  return fallbackEfforts.find(
    (effort): effort is string =>
      effort !== undefined && effort.length > 0 && availableEfforts.includes(effort),
  );
}

export function resolveUtilityTaskConfig(
  agent: UtilityTaskConfigAgent | undefined,
  model: string,
  effort: string,
  getDefaults: (kind: string) => UtilityTaskDefaults | undefined,
  options: ResolveUtilityTaskOptions = {},
): { model: string; effort: string; availableEfforts: string[] } {
  if (!agent) return { model: "", effort: "", availableEfforts: [] };

  const defaults = getDefaults(agent.kind);
  const nextModel = hasModel(agent, model)
    ? model
    : (findFallbackModel(agent, defaults, options.fallbackModelIds?.(agent, defaults) ?? []) ??
      agent.capabilities.models[0]?.id ??
      "");

  const modelEfforts = agent.capabilities.modelEfforts[nextModel];
  const availableEfforts = modelEfforts ?? [...agent.capabilities.efforts];
  if (availableEfforts.length === 0) return { model: nextModel, effort: "", availableEfforts };

  if (availableEfforts.includes(effort)) return { model: nextModel, effort, availableEfforts };

  const fallbackEffort = findFallbackEffort(
    availableEfforts,
    options.fallbackEfforts?.(agent, defaults, availableEfforts) ?? [
      defaults?.effort,
      agent.capabilities.defaultEffort,
      availableEfforts[0],
    ],
  );
  return { model: nextModel, effort: fallbackEffort ?? "", availableEfforts };
}
