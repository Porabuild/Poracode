import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useUsageLoginStateStore } from "@/renderer/state/usageLoginStateStore";
import { DEFAULT_USAGE_DISABLED_PROVIDER_IDS } from "@/shared/settings";
import { UsageSettings } from "./UsageSettings";

const bridgeMock = vi.hoisted(() => ({
  getProviderUsage: vi.fn<() => Promise<{ snapshots: []; fromCache: boolean }>>(),
  refreshProviderUsage: vi.fn<() => Promise<{ snapshots: []; fromCache: boolean }>>(),
  getUsageLoginState: vi.fn<() => Promise<{ stored: Record<string, boolean> }>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => false,
  readBridge: () => bridgeMock,
}));

vi.mock("@/renderer/adaptiveLayout", () => ({
  useCompactLayout: () => false,
}));

vi.mock("@/renderer/components/providers/refreshProviderUsageSnapshot", () => ({
  refreshAndMergeProviderUsage: vi.fn<() => Promise<void>>(async () => undefined),
}));

vi.mock("@/renderer/components/providers/useProviderUsageRefresh", () => ({
  useProviderUsageRefresh: () => ({ refreshing: false, refresh: vi.fn<() => Promise<void>>() }),
}));

vi.mock("@/renderer/components/providers/useUsageProviderLogin", () => ({
  useUsageProviderLogin: () => ({
    supportsLogin: false,
    canSignIn: false,
    canBrowserSignIn: false,
    canApiKeySignIn: false,
    canSignOut: false,
    signingIn: false,
    signingOut: false,
    apiKey: "",
    setApiKey: vi.fn<(value: string) => void>(),
    handleSignIn: vi.fn<() => Promise<void>>(),
    handleSubmitApiKey: vi.fn<() => Promise<void>>(),
    handleSignOut: vi.fn<() => Promise<void>>(),
  }),
}));

describe("UsageSettings (current host)", () => {
  beforeEach(() => {
    bridgeMock.getProviderUsage.mockResolvedValue({ snapshots: [], fromCache: true });
    bridgeMock.refreshProviderUsage.mockResolvedValue({ snapshots: [], fromCache: false });
    bridgeMock.getUsageLoginState.mockResolvedValue({ stored: {} });
    useProviderUsageStore.setState({ snapshots: {} });
    useUsageLoginStateStore.setState({ stored: {} });
    useSharedSettings.setState((state) => ({
      agentInstances: {},
      usage: {
        ...state.usage,
        autoRefresh: true,
        refreshIntervalMinutes: 5,
        showInSidebar: true,
        showEstimatedCost: false,
        sidebarHiddenProviders: [],
        disabledProviders: [...DEFAULT_USAGE_DISABLED_PROVIDER_IDS],
        providerOrder: [],
        collapsedProviders: [],
      },
    }));
  });

  afterEach(cleanup);

  it("separates tracked providers from collapsed more providers and removes inline eye buttons", () => {
    useProviderUsageStore.getState().setSnapshots([
      {
        providerId: "claude",
        status: "ok",
        plan: "Team",
        windows: [{ id: "session-5h", label: "Session (5h)", usedPercent: 12 }],
        fetchedAt: Date.now(),
      },
    ]);

    render(<UsageSettings />);

    expect(screen.getByText("Tracked providers")).toBeTruthy();
    expect(screen.getByText("More providers")).toBeTruthy();
    // No 20 inline eye buttons or "Tracking off" rows cluttering the main list.
    expect(screen.queryByRole("button", { name: /circle in sidebar/ })).toBeNull();
    expect(screen.queryByText("Tracking off")).toBeNull();
    // Tracked Claude shows compact quota summary and can expand to full progress bars.
    expect(screen.getByText("12%")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand Claude" }));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("12");
  });

  it("moves providers between More providers and Tracked providers when tracking is toggled", () => {
    render(<UsageSettings />);

    // More providers starts collapsed; open it to find an untracked provider.
    expect(screen.queryByRole("switch", { name: "Track Devin usage" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /More providers/ }));

    fireEvent.change(screen.getByRole("textbox", { name: "Search more providers" }), {
      target: { value: "Devin" },
    });
    const trackDevin = screen.getByRole("switch", { name: "Track Devin usage" });
    fireEvent.click(trackDevin);

    expect(useSharedSettings.getState().usage.disabledProviders).not.toContain("devin");

    // Disabling tracking on a tracked provider moves it back into More providers.
    act(() => {
      fireEvent.click(screen.getByRole("switch", { name: "Track Claude usage" }));
    });
    expect(useSharedSettings.getState().usage.disabledProviders).toContain("claude");
  });

  it("opens More providers automatically when no providers are tracked", () => {
    useSharedSettings.setState((state) => ({
      usage: {
        ...state.usage,
        disabledProviders: ["claude", "codex", ...DEFAULT_USAGE_DISABLED_PROVIDER_IDS],
      },
    }));

    render(<UsageSettings />);

    expect(
      screen.getByText(
        "No providers are being tracked. Enable providers below to monitor quotas and cost.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Track Claude usage" })).toBeTruthy();
  });
});
