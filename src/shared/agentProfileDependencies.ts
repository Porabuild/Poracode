import { agentProfileDriver } from "./contracts/agentProfiles";
import type { AgentInstanceConfigMap } from "./contracts/agentInstance";
import { msg } from "./messages";

function invalidDependencies(instances: AgentInstanceConfigMap) {
  return Object.values(instances).flatMap((instance) => {
    const driver = agentProfileDriver(instance.driver);
    return (driver?.dependencies?.(instance) ?? []).flatMap((dependencyId) => {
      const target = instances[dependencyId];
      return target &&
        target.id !== instance.id &&
        target.driver === instance.driver &&
        target.enabled !== false &&
        driver?.acceptsDependents?.(target)
        ? []
        : [{ profileId: instance.id, dependencyId }];
    });
  });
}

/** Existing unusable bindings remain repairable; a write may not introduce a
 * new dangling dependency by deleting, disabling or changing its owner. */
export function assertAgentProfileDependencies(
  previous: AgentInstanceConfigMap,
  next: AgentInstanceConfigMap,
): void {
  const existing = new Set(invalidDependencies(previous).map((item) => JSON.stringify(item)));
  const introduced = invalidDependencies(next).find((item) => !existing.has(JSON.stringify(item)));
  if (!introduced) return;
  const profile = next[introduced.profileId]?.displayName ?? introduced.profileId;
  const dependency = previous[introduced.dependencyId]?.displayName ?? introduced.dependencyId;
  throw new Error(msg("profile.dependencyUnavailable", { profile, dependency }));
}
