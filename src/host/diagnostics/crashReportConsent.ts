import { createSharedSettingsFileReader } from "@/host/sharedSettingsFile";
import {
  isCrashReportsDisabledByEnv,
  telemetryConsentFromPrivacy,
} from "@/shared/telemetryConsent";

/** Crash-report egress decisions read from one live settings snapshot. */
export interface CrashReportConsent {
  /** Scrubbed crash diagnostics may be sent. */
  crashReports: boolean;
  /** Native crash memory dumps may be attached to a native crash event. */
  nativeCrashDumps: boolean;
}

const DENIED_CRASH_REPORT_CONSENT: CrashReportConsent = {
  crashReports: false,
  nativeCrashDumps: false,
};

/**
 * Live crash-report consent for Node processes (main, supervisor). Reads the
 * shared settings file through the fingerprint-cached reader, so a Settings
 * toggle takes effect on the next event without a restart, and environment
 * hard-off switches always win. Any read problem fails closed to both streams
 * denied.
 *
 * Each call reads one snapshot and returns both decisions, so a caller that
 * needs ordinary reports and raw dumps for the same event cannot observe a
 * half-updated settings document. Callers must not cache the result across
 * events: consent is intentionally checked per event.
 */
export function createCrashReportConsentReader(
  settingsPath: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): () => CrashReportConsent {
  if (!settingsPath || isCrashReportsDisabledByEnv(env)) {
    return () => ({ ...DENIED_CRASH_REPORT_CONSENT });
  }
  const readSettings = createSharedSettingsFileReader(settingsPath);
  return () => {
    try {
      const consent = telemetryConsentFromPrivacy(readSettings().privacy);
      return {
        crashReports: consent.crashReports,
        nativeCrashDumps: consent.nativeCrashDumps,
      };
    } catch {
      return { ...DENIED_CRASH_REPORT_CONSENT };
    }
  };
}

/**
 * Boolean crash-report gate kept for the supervisor, whose Sentry client never
 * attaches native dumps. Shares the same live reader as
 * {@link createCrashReportConsentReader} so the two owners cannot drift.
 */
export function createCrashReportConsentGate(
  settingsPath: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): () => boolean {
  const readConsent = createCrashReportConsentReader(settingsPath, env);
  return () => readConsent().crashReports;
}
