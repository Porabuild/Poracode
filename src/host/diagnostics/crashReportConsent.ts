import { createSharedSettingsFileReader } from "@/host/sharedSettingsFile";
import {
  isCrashReportsDisabledByEnv,
  telemetryConsentFromPrivacy,
} from "@/shared/telemetryConsent";

/**
 * Live crash-report consent for Node processes (main, supervisor). Reads the
 * shared settings file through the fingerprint-cached reader, so a Settings
 * toggle takes effect on the next event without a restart, and environment
 * hard-off switches always win. Any read problem fails closed.
 */
export function createCrashReportConsentGate(
  settingsPath: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): () => boolean {
  if (!settingsPath || isCrashReportsDisabledByEnv(env)) return () => false;
  const readSettings = createSharedSettingsFileReader(settingsPath);
  return () => {
    try {
      return telemetryConsentFromPrivacy(readSettings().privacy).crashReports;
    } catch {
      return false;
    }
  };
}
