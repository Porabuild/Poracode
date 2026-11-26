import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const bridge = vi.hoisted(() => ({
  openExternal: vi.fn<(url: string) => Promise<void>>(),
  telemetryHardDisabled: false,
}));

vi.mock("@/renderer/bridge", () => ({
  hasBridge: () => false,
  readBridge: () => bridge,
}));

import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { PrivacySettings } from "./PrivacySettings";

describe("PrivacySettings", () => {
  beforeEach(() => {
    localStorage.clear();
    bridge.telemetryHardDisabled = false;
    // Real store actions: the production setPrivacySetting must flip
    // consentDecided and persist, which this suite now covers end to end.
    useSharedSettings.setState({
      privacy: {
        productAnalytics: false,
        crashReports: false,
        nativeCrashDumps: false,
        consentDecided: false,
      },
      sharedSettingsHydrated: true,
    });
  });

  it("uses the short page description and records a decision when analytics is toggled", () => {
    render(<PrivacySettings />);

    expect(screen.getByText("Choose what the desktop app sends.")).toBeInTheDocument();
    expect(
      screen.getByText("Send feature-use events and a random installation ID to PostHog."),
    ).toBeInTheDocument();
    const analytics = screen.getByRole("switch", { name: "Product analytics" });
    expect(analytics).not.toBeChecked();

    fireEvent.click(analytics);
    expect(useSharedSettings.getState().privacy).toEqual({
      productAnalytics: true,
      crashReports: false,
      nativeCrashDumps: false,
      consentDecided: true,
    });
  });

  it("keeps native dumps off and disabled until ordinary crash reports are on", () => {
    render(<PrivacySettings />);

    const description = document.getElementById("privacy-native-crash-dumps-description");
    expect(description?.textContent).toBe("Turn on crash reports to include native dumps.");
    const dumps = screen.getByRole("switch", { name: "Include native crash dumps" });
    expect(dumps).not.toBeChecked();
    expect(dumps).toBeDisabled();
    expect(dumps).toHaveAttribute("aria-describedby", "privacy-native-crash-dumps-description");

    fireEvent.click(screen.getByRole("switch", { name: "Crash reports" }));
    expect(dumps).toBeEnabled();
    expect(description?.textContent).toBe(
      "Sends memory snapshots to Sentry that may contain sensitive data.",
    );
    expect(useSharedSettings.getState().privacy).toEqual({
      productAnalytics: false,
      crashReports: true,
      nativeCrashDumps: false,
      consentDecided: true,
    });

    fireEvent.click(dumps);
    expect(useSharedSettings.getState().privacy).toEqual({
      productAnalytics: false,
      crashReports: true,
      nativeCrashDumps: true,
      consentDecided: true,
    });
  });

  it("clears raw consent when crash reports turn off and needs a fresh opt-in", () => {
    useSharedSettings.setState({
      privacy: {
        productAnalytics: false,
        crashReports: true,
        nativeCrashDumps: true,
        consentDecided: true,
      },
    });
    render(<PrivacySettings />);

    const crashReports = screen.getByRole("switch", { name: "Crash reports" });
    const dumps = screen.getByRole("switch", { name: "Include native crash dumps" });
    expect(dumps).toBeChecked();

    fireEvent.click(crashReports);
    expect(useSharedSettings.getState().privacy).toEqual({
      productAnalytics: false,
      crashReports: false,
      nativeCrashDumps: false,
      consentDecided: true,
    });
    expect(dumps).toBeDisabled();

    fireEvent.click(crashReports);
    expect(useSharedSettings.getState().privacy).toEqual({
      productAnalytics: false,
      crashReports: true,
      nativeCrashDumps: false,
      consentDecided: true,
    });
    expect(dumps).not.toBeChecked();
  });

  it("rejects a raw-dump enable while ordinary crash reports are off", () => {
    useSharedSettings.getState().setPrivacySetting("nativeCrashDumps", true);

    expect(useSharedSettings.getState().privacy).toEqual({
      productAnalytics: false,
      crashReports: false,
      nativeCrashDumps: false,
      consentDecided: false,
    });
  });

  it("disables every switch when the environment hard-off is active", () => {
    bridge.telemetryHardDisabled = true;
    useSharedSettings.setState({
      privacy: {
        productAnalytics: true,
        crashReports: true,
        nativeCrashDumps: true,
        consentDecided: true,
      },
    });
    render(<PrivacySettings />);

    expect(
      screen.getByText("An environment variable on this machine keeps telemetry off."),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Product analytics" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Crash reports" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Include native crash dumps" })).toBeDisabled();
  });
});
