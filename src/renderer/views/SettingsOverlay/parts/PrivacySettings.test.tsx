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
      privacy: { productAnalytics: false, crashReports: false, consentDecided: false },
      sharedSettingsHydrated: true,
    });
  });

  it("starts opted out and records a decision when a switch is toggled", () => {
    render(<PrivacySettings />);

    expect(
      screen.getByText("Poracode sends nothing unless you turn it on.", { exact: false }),
    ).toBeInTheDocument();
    const analytics = screen.getByRole("switch", { name: "Anonymous product analytics" });
    expect(analytics).not.toBeChecked();

    fireEvent.click(analytics);
    expect(useSharedSettings.getState().privacy).toEqual({
      productAnalytics: true,
      crashReports: false,
      consentDecided: true,
    });
  });

  it("disables both switches when the environment hard-off is active", () => {
    bridge.telemetryHardDisabled = true;
    useSharedSettings.setState({
      privacy: { productAnalytics: true, crashReports: true, consentDecided: true },
    });
    render(<PrivacySettings />);

    expect(
      screen.getByText("An environment variable on this machine keeps both options off."),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Anonymous product analytics" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Crash reports" })).toBeDisabled();
  });
});
