import { isDeepStrictEqual } from "node:util";
import { isSensitiveAgentSetting, sensitiveAgentSettingKeys } from "@/shared/agentSecrets";
import { isAgentProfileDriver } from "@/shared/contracts/agentProfiles";
import type { SharedSettings } from "@/shared/settings";
import {
  settingsSubjectField,
  settingsSubjectId,
  type SettingsSubject,
} from "@/shared/settingsTransactions";
import type { SettingsMutationAuthorizer } from "./SettingsAuthority";

const OWNER_MANAGED_FIELDS = new Set<keyof SharedSettings>([
  "acpRegistryInstalledAgents",
  "acpRegistryAutoInstallOptOuts",
  "agentHookSupport",
  "crossagentSelectionUsage",
  "crossagentRoutingOverrides",
]);

function sensitiveAgentValuesEqual(
  previous: SharedSettings["agentSettings"] = {},
  next: SharedSettings["agentSettings"] = {},
): boolean {
  for (const kind of new Set([...Object.keys(previous), ...Object.keys(next)]))
    for (const key of sensitiveAgentSettingKeys(kind))
      if (!isDeepStrictEqual(previous[kind]?.[key], next[kind]?.[key])) return false;
  return true;
}

/** Ordinary settings intent cannot claim authority over runtime records or credentials.
 * Profile ownership is declared by its driver; undeclared instance types remain owner-managed. */
export const authorizeSettingsPreferences: SettingsMutationAuthorizer = (edits, previous, next) => {
  for (const { subject } of edits) {
    if (OWNER_MANAGED_FIELDS.has(settingsSubjectField(subject))) return false;
    if (subject.kind === "agent-setting" && isSensitiveAgentSetting(subject.agentKind, subject.key))
      return false;
  }
  for (const field of OWNER_MANAGED_FIELDS)
    if (!isDeepStrictEqual(previous[field], next[field])) return false;
  if (!sensitiveAgentValuesEqual(previous.agentSettings, next.agentSettings)) return false;
  for (const machine of new Set([
    ...Object.keys(previous.machineSettings),
    ...Object.keys(next.machineSettings),
  ]))
    if (
      !sensitiveAgentValuesEqual(
        previous.machineSettings[machine]?.agentSettings,
        next.machineSettings[machine]?.agentSettings,
      )
    )
      return false;

  for (const id of new Set([
    ...Object.keys(previous.agentInstances),
    ...Object.keys(next.agentInstances),
  ])) {
    const before = previous.agentInstances[id];
    const after = next.agentInstances[id];
    if (isDeepStrictEqual(before, after)) continue;
    // Intentional profile deletion removes its environment too. A retained
    // profile's environment belongs to the dedicated sealing command.
    if (!after) {
      if (!before || !isAgentProfileDriver(before.driver)) return false;
      continue;
    }
    if (!isAgentProfileDriver(after.driver) || after.id !== id) return false;
    if (!before) {
      if (after.environment !== undefined || after.authAcknowledged !== undefined) return false;
      continue;
    }
    if (before.driver !== after.driver || before.id !== after.id) return false;
    if (!isDeepStrictEqual(before.environment, after.environment)) return false;
    if (!isDeepStrictEqual(before.authAcknowledged, after.authAcknowledged)) return false;
  }
  return true;
};

/** Selected by a trusted command adapter, never by an actor/role from a request. */
export function authorizeSettingsCommandSubjects(
  subjects: readonly SettingsSubject[],
): SettingsMutationAuthorizer {
  const allowed = new Set(subjects.map(settingsSubjectId));
  return (edits) =>
    edits.length === allowed.size &&
    edits.every(({ subject }) => allowed.has(settingsSubjectId(subject)));
}
