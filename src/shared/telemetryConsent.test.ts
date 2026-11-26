import { describe, expect, it } from "vitest";
import {
  DEFAULT_TELEMETRY_CONSENT,
  isCrashReportsDisabledByEnv,
  isProductAnalyticsDisabledByEnv,
  isTelemetryHardDisabledByEnv,
  telemetryConsentFromPrivacy,
  type TelemetryConsent,
} from "./telemetryConsent";

const optedIn: TelemetryConsent = {
  productAnalytics: true,
  crashReports: true,
  nativeCrashDumps: true,
  consentDecided: true,
};

describe("telemetry consent", () => {
  it("defaults to opt-in: undecided means nothing is sent", () => {
    expect(DEFAULT_TELEMETRY_CONSENT).toEqual({
      productAnalytics: false,
      crashReports: false,
      nativeCrashDumps: false,
      consentDecided: false,
    });
    expect(telemetryConsentFromPrivacy(undefined)).toEqual(DEFAULT_TELEMETRY_CONSENT);
    expect(telemetryConsentFromPrivacy(null)).toEqual(DEFAULT_TELEMETRY_CONSENT);
    expect(telemetryConsentFromPrivacy({ productAnalytics: "yes" })).toEqual(
      DEFAULT_TELEMETRY_CONSENT,
    );
  });

  it("preserves an explicit opt-in from a stored settings value", () => {
    expect(telemetryConsentFromPrivacy(optedIn)).toEqual(optedIn);
  });

  it("fails raw native dumps closed unless they and crash reports are on", () => {
    expect(
      telemetryConsentFromPrivacy({
        productAnalytics: false,
        crashReports: true,
        consentDecided: true,
      }).nativeCrashDumps,
    ).toBe(false);
    expect(
      telemetryConsentFromPrivacy({
        productAnalytics: false,
        crashReports: false,
        nativeCrashDumps: true,
        consentDecided: true,
      }).nativeCrashDumps,
    ).toBe(false);
    expect(
      telemetryConsentFromPrivacy({
        productAnalytics: false,
        crashReports: true,
        nativeCrashDumps: true,
        consentDecided: true,
      }).nativeCrashDumps,
    ).toBe(true);
  });

  it("lets environment hard-off switches win over an opt-in", () => {
    for (const env of [
      { PORACODE_TELEMETRY_ENABLED: "0" },
      { PORACODE_TELEMETRY_ENABLED: "false" },
      { DO_NOT_TRACK: "1" },
      { CI: "true" },
    ]) {
      expect(isTelemetryHardDisabledByEnv(env)).toBe(true);
    }
    expect(isProductAnalyticsDisabledByEnv({ POSTHOG_ENABLED: "0" })).toBe(true);
    expect(isCrashReportsDisabledByEnv({ PORACODE_CRASH_REPORTS_ENABLED: "0" })).toBe(true);
    expect(isCrashReportsDisabledByEnv({ SENTRY_DSN: "off" })).toBe(true);
    // An empty SENTRY_DSN means "unset" and keeps the build DSN fallback.
    expect(isCrashReportsDisabledByEnv({ SENTRY_DSN: "" })).toBe(false);
  });
});
