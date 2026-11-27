import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PORACODE_TELEMETRY_DOC_URL } from "@/shared/communityLinks";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const bridge = vi.hoisted(() => ({
  openExternal: vi.fn<(url: string) => Promise<void>>(),
  browser: false,
  remote: false,
  telemetryHardDisabled: false,
}));

vi.mock("@/renderer/bridge", () => ({
  hasBridge: () => false,
  isRemoteSession: () => bridge.remote,
  readBridge: () => ({
    openExternal: bridge.openExternal,
    telemetryHardDisabled: bridge.telemetryHardDisabled,
  }),
}));

vi.mock("@/renderer/clientRuntime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/renderer/clientRuntime")>();
  return { ...actual, isBrowserClientRuntime: () => bridge.browser };
});

import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { TelemetryConsentPrompt, WelcomeTelemetryChoices } from "./TelemetryConsentPrompt";

function seedPrivacy(privacy: {
  productAnalytics: boolean;
  crashReports: boolean;
  nativeCrashDumps?: boolean;
  consentDecided: boolean;
}) {
  useSharedSettings.setState({
    privacy: { ...privacy, nativeCrashDumps: privacy.nativeCrashDumps ?? false },
    sharedSettingsHydrated: true,
  });
}

describe("TelemetryConsentPrompt", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("poracode-welcome-seen-v16", "true");
    bridge.browser = false;
    bridge.remote = false;
    bridge.telemetryHardDisabled = false;
    bridge.openExternal.mockClear();
    seedPrivacy({ productAnalytics: false, crashReports: false, consentDecided: false });
  });

  it("leaves the rest of the app interactive and does not steal focus", () => {
    const { rerender } = render(<button type="button">Keep working</button>);
    const keepWorking = screen.getByRole("button", { name: "Keep working" });
    keepWorking.focus();

    rerender(
      <>
        <button type="button">Keep working</button>
        <TelemetryConsentPrompt />
      </>,
    );

    const prompt = screen.getByRole("dialog", { name: "Help improve Poracode?" });
    expect(prompt).toHaveAttribute("aria-modal", "false");
    expect(screen.getAllByRole("switch")).toHaveLength(3);
    expect(
      screen.getByText("Send feature-use events and a random installation ID to PostHog."),
    ).toBeInTheDocument();
    expect(screen.getByText("Send scrubbed crash diagnostics to Sentry.")).toBeInTheDocument();
    expect(keepWorking.closest('[aria-hidden="true"], [inert]')).toBeNull();
    expect(document.activeElement).toBe(keepWorking);
  });

  it("dismisses on Escape without recording consent", () => {
    render(<TelemetryConsentPrompt />);
    const close = screen.getByRole("button", { name: "Close" });
    close.focus();
    fireEvent.keyDown(close, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(useSharedSettings.getState().privacy).toEqual({
      productAnalytics: false,
      crashReports: false,
      nativeCrashDumps: false,
      consentDecided: false,
    });
  });

  it("closing postpones the decision without recording consent", () => {
    const first = render(<TelemetryConsentPrompt />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(useSharedSettings.getState().privacy).toEqual({
      productAnalytics: false,
      crashReports: false,
      nativeCrashDumps: false,
      consentDecided: false,
    });

    first.unmount();
    render(<TelemetryConsentPrompt />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("accepts both ordinary streams and records the decision", () => {
    render(<TelemetryConsentPrompt />);
    fireEvent.click(screen.getByRole("button", { name: "Accept analytics and crash reports" }));
    expect(useSharedSettings.getState().privacy).toEqual({
      productAnalytics: true,
      crashReports: true,
      nativeCrashDumps: false,
      consentDecided: true,
    });
  });

  it("excludes native crash dumps from the bulk opt-in even when selected", () => {
    render(<TelemetryConsentPrompt />);
    fireEvent.click(screen.getByRole("switch", { name: "Crash reports" }));
    fireEvent.click(screen.getByRole("switch", { name: "Include native crash dumps" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept analytics and crash reports" }));
    expect(useSharedSettings.getState().privacy).toEqual({
      productAnalytics: true,
      crashReports: true,
      nativeCrashDumps: false,
      consentDecided: true,
    });
  });

  it("Save choices keeps the switch states", () => {
    render(<TelemetryConsentPrompt />);
    fireEvent.click(screen.getByRole("switch", { name: "Product analytics" }));
    fireEvent.click(screen.getByRole("button", { name: "Save choices" }));
    expect(useSharedSettings.getState().privacy).toEqual({
      productAnalytics: true,
      crashReports: false,
      nativeCrashDumps: false,
      consentDecided: true,
    });
  });

  it("requires crash reports and a fresh opt-in to save native crash dumps", () => {
    render(<TelemetryConsentPrompt />);
    const crashReports = screen.getByRole("switch", { name: "Crash reports" });
    const nativeCrashDumps = screen.getByRole("switch", { name: "Include native crash dumps" });
    expect(nativeCrashDumps).toBeDisabled();
    expect(nativeCrashDumps).not.toBeChecked();
    expect(nativeCrashDumps).toHaveAccessibleDescription(
      "Turn on crash reports to include native dumps.",
    );

    fireEvent.click(crashReports);
    expect(nativeCrashDumps).toBeEnabled();
    expect(nativeCrashDumps).toHaveAccessibleDescription(
      "Sends memory snapshots to Sentry that may contain sensitive data.",
    );
    fireEvent.click(nativeCrashDumps);
    expect(nativeCrashDumps).toBeChecked();

    fireEvent.click(crashReports);
    expect(nativeCrashDumps).toBeDisabled();
    expect(nativeCrashDumps).not.toBeChecked();
    fireEvent.click(crashReports);
    expect(nativeCrashDumps).not.toBeChecked();
    fireEvent.click(nativeCrashDumps);

    fireEvent.click(screen.getByRole("button", { name: "Save choices" }));
    expect(useSharedSettings.getState().privacy).toEqual({
      productAnalytics: false,
      crashReports: true,
      nativeCrashDumps: true,
      consentDecided: true,
    });
  });

  it("seeds stored choices and turns all three off with No thanks", () => {
    seedPrivacy({
      productAnalytics: false,
      crashReports: true,
      nativeCrashDumps: true,
      consentDecided: false,
    });
    render(<TelemetryConsentPrompt />);
    expect(screen.getByRole("switch", { name: "Crash reports" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Include native crash dumps" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
    expect(useSharedSettings.getState().privacy).toEqual({
      productAnalytics: false,
      crashReports: false,
      nativeCrashDumps: false,
      consentDecided: true,
    });
  });

  it("reuses the telemetry doc link on the first-launch welcome", () => {
    render(
      <WelcomeTelemetryChoices
        productAnalytics={false}
        crashReports={false}
        nativeCrashDumps={false}
        onProductAnalyticsChange={() => {}}
        onCrashReportsChange={() => {}}
        onNativeCrashDumpsChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "See exactly what is collected" }));
    expect(bridge.openExternal).toHaveBeenCalledWith(PORACODE_TELEMETRY_DOC_URL);
  });

  it("stays hidden once decided, in browser and remote sessions, and under the env hard-off", () => {
    const { unmount } = render(<TelemetryConsentPrompt />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    unmount();

    seedPrivacy({ productAnalytics: true, crashReports: true, consentDecided: true });
    const decided = render(<TelemetryConsentPrompt />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    decided.unmount();

    seedPrivacy({ productAnalytics: false, crashReports: false, consentDecided: false });
    bridge.browser = true;
    const browser = render(<TelemetryConsentPrompt />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    browser.unmount();

    bridge.browser = false;
    bridge.remote = true;
    const remote = render(<TelemetryConsentPrompt />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    remote.unmount();

    bridge.remote = false;
    bridge.telemetryHardDisabled = true;
    render(<TelemetryConsentPrompt />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
