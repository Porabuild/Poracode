import { getProviderUtilityRank } from "./providerManifest";
import { lookupProviderRegistration } from "./providerRegistry";
import {
  hasModel,
  type UtilityTaskCandidateAgent,
  type UtilityTaskCandidateOptions,
  type UtilityTaskDefaults,
} from "@/shared/utilityTaskConfig";

export type {
  UtilityTaskCandidateAgent,
  UtilityTaskCandidateOptions,
  UtilityTaskConfigAgent,
  UtilityTaskDefaults,
  UtilityTaskModel,
  ResolveUtilityTaskOptions,
} from "@/shared/utilityTaskConfig";
export { getMiniModelId, resolveUtilityTaskConfig } from "@/shared/utilityTaskConfig";

export function sortByAutoPreference<T extends { kind: string }>(items: readonly T[]): T[] {
  return [...items].sort(
    (left, right) => getProviderUtilityRank(left.kind) - getProviderUtilityRank(right.kind),
  );
}

function getUtilityTaskDefaultsHint(
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

/** Create one feature-owned defaults registry with provider-base fallback. */
export function createUtilityTaskRegistry() {
  const registry = new Map<string, UtilityTaskDefaults>();
  return {
    register(kind: string, defaults: UtilityTaskDefaults) {
      registry.set(kind, defaults);
    },
    get(kind: string): UtilityTaskDefaults | undefined {
      return lookupProviderRegistration(registry, kind);
    },
    getHint(): string | undefined {
      return getUtilityTaskDefaultsHint(registry.values());
    },
  };
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
  options: UtilityTaskCandidateOptions = {},
): T[] {
  const available = agentStatuses.filter(
    (agent) =>
      agent.installed !== false &&
      agent.authState !== "missing" &&
      // An install whose probe reached no verdict carries no model catalog;
      // admitting it would only resolve to an empty model and a failed run.
      agent.capabilities.models.length > 0 &&
      (!options.requireOneShot || agent.capabilities.supportsOneShot === true),
  );
  if (provider === "auto") {
    const withPreferred = available.filter((agent) =>
      hasPreferredUtilityTaskModel(agent, getDefaults),
    );
    return sortByAutoPreference(withPreferred.length > 0 ? withPreferred : available);
  }
  return available.filter((agent) => agent.kind === provider);
}
