import { dirname } from "node:path";
import {
  applyAgentSecretSetting,
  applyCreateProfile,
  applyProfileEnvironment,
  mergeManagedSharedSettings,
  readSharedSettingsFile,
  writeSharedSettingsFile,
} from "@/main/sharedSettingsFile";
import {
  removeCrossagentRoutingOverride,
  removeCrossagentSelectionUsageEntry,
  retagCrossagentSelectionUsageEntry,
} from "@/shared/crossagentRanking";
import type {
  BackendServicePayload,
  BackendServiceResult,
  BackendSettingsProcedureName,
} from "@/shared/backendHostProtocol";
import type { SharedSettings } from "@/shared/settings";
import {
  notifySettingsChanged,
  type BackendSettingsNotifications,
} from "./BackendSettingsNotifications";

type SettingsHandlers = {
  [Name in BackendSettingsProcedureName]: (
    payload: BackendServicePayload<Name>,
  ) => BackendServiceResult<Name>;
};

/** Desktop settings mutations execute beside the backend's other settings writers.
 * Full-snapshot conflict checks and the supervisor registry writer remain separate work. */
export function createBackendSettingsHandlers(
  options: BackendSettingsNotifications & {
    settingsPath(): string;
  },
): SettingsHandlers {
  function apply<T>(
    update: (current: SharedSettings, baseDir: string) => { settings: SharedSettings; result: T },
  ): T {
    const path = options.settingsPath();
    const next = update(readSharedSettingsFile(path), dirname(path));
    writeSharedSettingsFile(path, next.settings);
    notifySettingsChanged(next.settings, options);
    return next.result;
  }
  return {
    getSharedSettings: () => readSharedSettingsFile(options.settingsPath()),
    setSharedSettings: (settings) =>
      apply((current) => ({
        settings: mergeManagedSharedSettings(current, settings),
        result: undefined,
      })),
    setAgentSecretSetting: (payload) =>
      apply((settings, baseDir) => {
        const { settings: next, storedValue } = applyAgentSecretSetting(settings, payload, baseDir);
        return { settings: next, result: { storedValue } };
      }),
    removeCrossagentRoutingOverride: ({ tags }) =>
      apply((current) => {
        const overrides = removeCrossagentRoutingOverride(current.crossagentRoutingOverrides, tags);
        return {
          settings: { ...current, crossagentRoutingOverrides: overrides },
          result: overrides,
        };
      }),
    removeCrossagentMemoryEntry: ({ entry }) =>
      apply((current) => {
        const usage = removeCrossagentSelectionUsageEntry(current.crossagentSelectionUsage, entry);
        return { settings: { ...current, crossagentSelectionUsage: usage }, result: usage };
      }),
    updateCrossagentMemoryEntryTags: ({ entry, tags }) =>
      apply((current) => {
        const usage = retagCrossagentSelectionUsageEntry(
          current.crossagentSelectionUsage,
          entry,
          tags,
        );
        return { settings: { ...current, crossagentSelectionUsage: usage }, result: usage };
      }),
    setProfileEnvironment: (payload) =>
      apply((settings, baseDir) => {
        const { settings: next, instance } = applyProfileEnvironment(settings, payload, baseDir);
        return { settings: next, result: instance };
      }),
    createProfile: (payload) =>
      apply((settings, baseDir) => {
        const { settings: next, instance } = applyCreateProfile(settings, payload, baseDir);
        return { settings: next, result: instance };
      }),
  };
}
