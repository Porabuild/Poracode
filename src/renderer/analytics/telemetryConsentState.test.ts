// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({ telemetryHardDisabled: false }));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  getTelemetryConsent,
  isCrashReportsConsented,
  isProductAnalyticsConsented,
} from "./telemetryConsentState";

describe("renderer telemetry consent state", () => {
  beforeEach(() => {
    bridge.telemetryHardDisabled = false;
    useSharedSettings.setState({
      privacy: { productAnalytics: false, crashReports: false, consentDecided: false },
      sharedSettingsHydrated: false,
    });
  });

  it("fails closed before shared settings hydrate", () => {
    useSharedSettings.setState({
      privacy: { productAnalytics: true, crashReports: true, consentDecided: true },
      sharedSettingsHydrated: false,
    });
    expect(isProductAnalyticsConsented()).toBe(false);
    expect(isCrashReportsConsented()).toBe(false);
  });

  it("follows the stored opt-in after hydration", () => {
    useSharedSettings.setState({
      privacy: { productAnalytics: true, crashReports: false, consentDecided: true },
      sharedSettingsHydrated: true,
    });
    expect(getTelemetryConsent()).toEqual({
      productAnalytics: true,
      crashReports: false,
      consentDecided: true,
    });
    expect(isProductAnalyticsConsented()).toBe(true);
    expect(isCrashReportsConsented()).toBe(false);
  });

  it("lets the environment hard-off win over a stored opt-in", () => {
    bridge.telemetryHardDisabled = true;
    useSharedSettings.setState({
      privacy: { productAnalytics: true, crashReports: true, consentDecided: true },
      sharedSettingsHydrated: true,
    });
    expect(isProductAnalyticsConsented()).toBe(false);
    expect(isCrashReportsConsented()).toBe(false);
  });
});
