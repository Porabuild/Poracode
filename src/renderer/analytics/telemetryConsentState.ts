import { telemetryConsentFromPrivacy, type TelemetryConsent } from "@/shared/telemetryConsent";
import { readBridge } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

/**
 * Renderer-side view of the stored telemetry consent. Reads fail closed:
 * before shared settings hydrate (or if the store is unavailable) the
 * functions return the opt-in default, so no event can leave before the
 * user's saved choice is known.
 */
export function getTelemetryConsent(): TelemetryConsent {
  try {
    const state = useSharedSettings.getState();
    if (!state.sharedSettingsHydrated) return telemetryConsentFromPrivacy(undefined);
    return telemetryConsentFromPrivacy(state.privacy);
  } catch {
    return telemetryConsentFromPrivacy(undefined);
  }
}

/** Env hard-off wins over consent (see shared/telemetryConsent). */
export function isTelemetryHardDisabled(): boolean {
  try {
    return readBridge().telemetryHardDisabled === true;
  } catch {
    return false;
  }
}

export function isProductAnalyticsConsented(): boolean {
  return !isTelemetryHardDisabled() && getTelemetryConsent().productAnalytics;
}

export function isCrashReportsConsented(): boolean {
  return !isTelemetryHardDisabled() && getTelemetryConsent().crashReports;
}
