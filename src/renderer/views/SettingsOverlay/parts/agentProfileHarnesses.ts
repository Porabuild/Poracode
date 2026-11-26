import type { AgentProfileHarnessOption } from "./AgentProfileDialog";
import { NATIVE_AGENT_REGISTRY_ENTRIES } from "./agentRegistryNative";

/**
 * Harnesses the shared Add profile dialog can create, read from the existing
 * native agent registry. A provider opts in with `profiles.addProfile`;
 * providers without it keep their own account/credential form.
 *
 * Called at render time, never at module scope: the registry imports every
 * provider panel, and several of those render `AgentProfileList`, so reading
 * the registry during module initialization would expose an unfinished module.
 */
export function agentProfileHarnesses(): readonly AgentProfileHarnessOption[] {
  return NATIVE_AGENT_REGISTRY_ENTRIES.flatMap((entry) => {
    const profiles = entry.profiles;
    const addProfile = profiles?.addProfile;
    if (!profiles || !addProfile) return [];
    return [
      {
        driver: profiles.driver,
        label: addProfile.label,
        support: profiles,
        ...(addProfile.order !== undefined ? { order: addProfile.order } : {}),
      },
    ];
  })
    .sort(
      (left, right) =>
        (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER),
    )
    .map((entry) => ({ driver: entry.driver, label: entry.label, support: entry.support }));
}
