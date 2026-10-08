import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useUsageScopeStore } from "@/renderer/state/usageScopeStore";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { UsagePanel } from "./UsagePanel";

const session = vi.hoisted(() => ({ remote: false, compact: false }));
const bridge = vi.hoisted(() => ({
  getProviderUsage: vi.fn<() => Promise<{ snapshots: []; fromCache: boolean }>>(),
  refreshProviderUsage: vi.fn<() => Promise<{ snapshots: []; fromCache: boolean }>>(),
  getUsageLoginState: vi.fn<() => Promise<{ stored: Record<string, boolean> }>>(),
}));
vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => session.remote,
  readBridge: () => bridge,
}));
vi.mock("@/renderer/adaptiveLayout", () => ({ useCompactLayout: () => session.compact }));
vi.mock("@/renderer/state/remoteServersStore", async () => {
  const { create } = await import("zustand");
  return {
    useRemoteServersStore: create(() => ({ servers: [] })),
    selectBrowserBridgeServer: () => undefined,
  };
});
vi.mock("@/renderer/components/common/RemoteServerPicker", () => ({
  RemoteServerPicker: (props: { onChange: (id: string | null) => void }) => (
    <button type="button" onClick={() => props.onChange(null)}>
      Current host
    </button>
  ),
}));
vi.mock("@/renderer/hooks/useScrollFade", () => ({
  useScrollFade: () => ({ setScrollContainer: () => {}, scrollFadeStyle: {} }),
}));
vi.mock("@/renderer/components/layout/MobilePageHeaderActions", () => ({
  MobilePageHeaderActions: (props: { children: ReactNode }) => <div>{props.children}</div>,
}));
vi.mock("@/renderer/components/mobileComposer/MobileCircleButton", () => ({
  MobileCircleButton: () => <span />,
}));
vi.mock("./parts/UsageProviderCard", () => ({ UsageProviderCard: () => <span /> }));
vi.mock("@/renderer/views/SettingsOverlay/parts/HostUsageSettings", () => ({
  HostUsageSettings: (props: {
    connectionId: string;
    refreshVersion: number;
    liveOnOpen: boolean;
  }) => (
    <div
      data-testid="remote-usage"
      data-version={props.refreshVersion}
      data-live={String(props.liveOnOpen)}
    >
      {props.connectionId}
    </div>
  ),
}));

describe("usage panel host ownership", () => {
  beforeEach(() => {
    session.remote = false;
    session.compact = false;
    useUsageScopeStore.setState({ desktopId: null, refreshVersion: 0 });
    useRemoteServersStore.setState({
      servers: ["a", "b"].map((connectionId) => ({
        connectionId,
        desktopId: connectionId,
        label: connectionId,
        endpoint: `https://${connectionId}.test`,
        accessToken: "fixture",
        scopes: ["session:read", "session:operate"],
      })),
    });
    useProviderUsageStore.setState({
      snapshots: {
        provider: {
          providerId: "provider",
          status: "ok",
          windows: [],
          fetchedAt: 1,
          authenticatedAs: "device-account",
        },
      },
    });
    bridge.getProviderUsage.mockResolvedValue({ snapshots: [], fromCache: true });
    bridge.refreshProviderUsage.mockResolvedValue({ snapshots: [], fromCache: false });
    bridge.getUsageLoginState.mockResolvedValue({ stored: {} });
  });
  afterEach(cleanup);

  it("uses scoped remote data for host changes and preserves the device account store", async () => {
    useUsageScopeStore.setState({ desktopId: "a" });
    render(<UsagePanel />);
    expect(screen.getByTestId("remote-usage").textContent).toBe("a");
    await act(async () => {
      useUsageScopeStore.getState().setDesktopId("b");
    });
    expect(screen.getByTestId("remote-usage").textContent).toBe("b");
    expect(bridge.getProviderUsage).not.toHaveBeenCalled();
    expect(bridge.getUsageLoginState).not.toHaveBeenCalled();
    expect(useProviderUsageStore.getState().snapshots.provider?.authenticatedAs).toBe(
      "device-account",
    );
  });

  it("passes explicit browser refresh and compact live-open intent to the scoped view", async () => {
    session.remote = true;
    session.compact = true;
    render(<UsagePanel />);
    expect(screen.getByTestId("remote-usage").getAttribute("data-live")).toBe("true");
    await act(async () => {
      useUsageScopeStore.getState().requestRefresh();
    });
    expect(screen.getByTestId("remote-usage").getAttribute("data-version")).toBe("1");
    expect(bridge.refreshProviderUsage).not.toHaveBeenCalled();
  });

  it("does not fall back to device data when a selected remote was removed", () => {
    useUsageScopeStore.setState({ desktopId: "retired" });
    render(<UsagePanel />);
    expect(screen.getByTestId("remote-usage").textContent).toBe("retired");
    expect(bridge.getProviderUsage).not.toHaveBeenCalled();
  });

  it("keeps local usage reachable after removal of the final remote", async () => {
    useUsageScopeStore.setState({ desktopId: "a" });
    render(<UsagePanel />);
    await act(async () => {
      useRemoteServersStore.setState({ servers: [] });
    });
    expect(screen.getByTestId("remote-usage").textContent).toBe("a");
    fireEvent.click(screen.getByRole("button", { name: "Current host" }));
    expect(screen.queryByTestId("remote-usage")).toBeNull();
    expect(bridge.getProviderUsage).toHaveBeenCalled();
  });
});
