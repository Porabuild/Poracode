import type { SharedSettings } from "@/shared/settings";
import type { SettingsMutationResult } from "@/shared/settingsTransactions";

export interface BackendSettingsNotifications {
  onChanged(settings: SharedSettings, change?: SettingsMutationResult): void;
  reportError?(error: unknown): void;
}

/** Diagnostics must not change the result of a durable settings operation. */
export function reportSettingsError(error: unknown, reportError?: (error: unknown) => void): void {
  try {
    if (reportError) reportError(error);
    else console.warn("[settings] settings operation failed", error);
  } catch (reportingError) {
    console.warn("[settings] error reporting failed", reportingError, "Original error:", error);
  }
}

/** Called only after commit; a disconnected client cannot turn a saved edit into a failure. */
export function notifySettingsChanged(
  settings: SharedSettings,
  options: BackendSettingsNotifications,
  change?: SettingsMutationResult,
): void {
  try {
    options.onChanged(settings, change);
  } catch (error) {
    reportSettingsError(error, options.reportError);
  }
}
