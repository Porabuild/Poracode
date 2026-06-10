import { baseAgentKind } from "@/shared/contracts";

export interface UtilityTaskDefaults {
  label?: string;
  hint?: string;
  model: string;
  effort: string;
}

interface UtilityTaskModel {
  id: string;
  label?: string;
}

export interface UtilityTaskCandidateAgent {
  kind: string;
  installed?: boolean;
  authState?: string;
  capabilities: {
    models: readonly UtilityTaskModel[];
  };
}

export interface UtilityTaskConfigAgent extends UtilityTaskCandidateAgent {
  capabilities: {
    models: readonly UtilityTaskModel[];
    efforts: readonly string[];
    modelEfforts: Record<string, string[]>;
    defaultEffort?: string | undefined;
  };
}

interface ResolveUtilityTaskOptions {
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

export const AUTO_PROVIDER_PREFERENCE_ORDER: readonly string[] = [
  "codex",
  "claude",
  "gemini",
  "antigravity",
  "commandcode",
  "opencode",
  "cursor",
  "copilot",
];

export function sortByAutoPreference<T extends { kind: string }>(items: readonly T[]): T[] {
  const rank = (kind: string) => {
    const idx = AUTO_PROVIDER_PREFERENCE_ORDER.indexOf(baseAgentKind(kind));
    return idx < 0 ? AUTO_PROVIDER_PREFERENCE_ORDER.length : idx;
  };
  return [...items].sort((a, b) => rank(a.kind) - rank(b.kind));
}

export function getUtilityTaskDefaultsHint(
  defaultsList: Iterable<UtilityTaskDefaults>,
): string | undefined {
  const entries = [...defaultsList]
    .flatMap((defaults) =>
      defaults.hint && defaults.label ? [`${defaults.label} -> ${defaults.hint}`] : [],
    )
    .sort()
    .join(", ");

  return entries ? `Defaults: ${entries}` : undefined;
}

export function getMiniModelId(agent: UtilityTaskConfigAgent): string | undefined {
  return agent.capabilities.models.find(
    (model) => /\bmini\b/i.test(model.id) || /\bmini\b/i.test(model.label ?? ""),
  )?.id;
}

function hasModel(agent: UtilityTaskCandidateAgent, modelId: string): boolean {
  return agent.capabilities.models.some((model) => model.id === modelId);
}

function hasPreferredUtilityTaskModel(
  agent: UtilityTaskCandidateAgent,
  getDefaults: (kind: string) => UtilityTaskDefaults | undefined,
): boolean {
  const defaults = getDefaults(agent.kind);
  if (!defaults?.model) return true;
  return hasModel(agent, defaults.model);
}

export function getUtilityTaskCandidates<T extends UtilityTaskCandidateAgent>(
  agentStatuses: readonly T[],
  provider: string,
  getDefaults: (kind: string) => UtilityTaskDefaults | undefined,
): T[] {
  const available = agentStatuses.filter(
    (agent) => agent.installed !== false && agent.authState !== "missing",
  );
  if (provider === "auto") {
    const withPreferred = available.filter((agent) =>
      hasPreferredUtilityTaskModel(agent, getDefaults),
    );
    return sortByAutoPreference(withPreferred.length > 0 ? withPreferred : available);
  }
  return available.filter((agent) => agent.kind === provider);
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
