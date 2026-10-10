import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useUsageScopeStore } from "@/renderer/state/usageScopeStore";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useHostUsageStore } from "@/renderer/state/hostUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { fetchHostUsage } from "@/renderer/components/providers/hostUsage";
import { UsagePanelHeaderActions } from "./parts/UsagePanelHeaderActions";
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
    useRemoteServersStore: create(() => ({ servers: [], runtime: {} })),
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
vi.mock("@/renderer/components/providers/hostUsage", () => ({
  fetchHostUsage: vi.fn<typeof fetchHostUsage>(),
}));
vi.mock("@dnd-kit/react/sortable", () => ({
  useSortable: () => ({ ref: () => {}, handleRef: () => {}, isDragging: false }),
  isSortable: () => true,
}));
const drag = vi.hoisted(() => ({ end: undefined as ((event: unknown) => void) | undefined }));
vi.mock("@dnd-kit/react", () => ({
  DragDropProvider: (props: { children: ReactNode; onDragEnd: (event: unknown) => void }) => {
    drag.end = props.onDragEnd;
    return <div>{props.children}</div>;
  },
  KeyboardSensor: {},
  PointerSensor: { configure: () => ({}) },
}));

describe("usage panel host ownership", () => {
  beforeEach(() => {
    session.remote = false;
    useHostUsageStore.setState({ hosts: {} });
    useSharedSettings.setState((state) => ({
      usage: {
        ...state.usage,
        providerOrder: [],
        collapsedProviders: [],
        disabledProviders: [],
        showEstimatedCost: true,
      },
    }));
    useRemoteServersStore.setState({
      runtime: {
        a: { status: "online", projects: [], threads: [] },
        b: { status: "online", projects: [], threads: [] },
      },
    });
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
    expect(fetchHostUsage).toHaveBeenCalledWith("a");
    await act(async () => {
      useUsageScopeStore.getState().setDesktopId("b");
    });
    expect(fetchHostUsage).toHaveBeenCalledWith("b");
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
    expect(fetchHostUsage).toHaveBeenCalledWith("a", true, { force: true });
    await act(async () => {
      useUsageScopeStore.getState().requestRefresh();
    });
    expect(fetchHostUsage).toHaveBeenLastCalledWith("a", true, { force: true });
    expect(bridge.refreshProviderUsage).not.toHaveBeenCalled();
  });

  it("does not fall back to device data when a selected remote was removed", () => {
    useUsageScopeStore.setState({ desktopId: "retired" });
    render(<UsagePanel />);
    expect(screen.getByText("This host is no longer configured.")).toBeTruthy();
    expect(bridge.getProviderUsage).not.toHaveBeenCalled();
  });

  it("keeps local usage reachable after removal of the final remote", async () => {
    useUsageScopeStore.setState({ desktopId: "a" });
    render(<UsagePanel />);
    await act(async () => {
      useRemoteServersStore.setState({ servers: [], runtime: {} });
    });
    expect(fetchHostUsage).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getByRole("button", { name: "Current host" }));
    expect(screen.queryByText("This host is no longer configured.")).toBeNull();
    expect(bridge.getProviderUsage).toHaveBeenCalled();
  });
  it.each([false, true])(
    "retains card meters, credits, cost, current grouping, collapse and ordering (compact=%s)",
    async (compact) => {
      session.compact = compact;
      useUsageScopeStore.setState({ desktopId: "a", preferredProviderId: "provider" });
      const store = useHostUsageStore.getState();
      store.complete("a", store.begin("a"), [
        {
          providerId: "provider",
          authenticatedAs: "remote-account",
          status: "ok",
          fetchedAt: Date.now(),
          windows: [
            {
              id: "weekly",
              label: "Weekly",
              usedPercent: 42,
              resetsAt: Date.now() + 24 * 60 * 60_000,
            },
          ],
          credits: { balance: 19, label: "Fixture credits" },
          cost: { amount: 12.34, currency: "USD", period: "30d", estimated: false },
        },
        { providerId: "other", status: "ok", windows: [], fetchedAt: Date.now() },
        { providerId: "third", status: "ok", windows: [], fetchedAt: Date.now() },
      ]);
      render(<UsagePanel />);
      expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("42");
      expect(screen.getByText("Fixture credits")).toBeTruthy();
      expect(screen.getByText(/% by reset/)).toBeTruthy();
      expect(screen.getByText(/12.34/)).toBeTruthy();
      expect(screen.getByText("remote-account")).toBeTruthy();
      expect(screen.getByRole("region", { name: "Current" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Reorder provider" })).toBeNull();
      expect(screen.getByRole("button", { name: "Reorder other" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Sign (in|out)/ })).toBeNull();
      expect(screen.queryByPlaceholderText(/API key/)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Refresh provider" }));
      expect(fetchHostUsage).toHaveBeenLastCalledWith("a", true, {
        providerIds: ["provider"],
        force: true,
      });
      fireEvent.click(screen.getAllByRole("button", { name: "Collapse provider" })[0]!);
      expect(useSharedSettings.getState().usage.collapsedProviders).toContain("provider");
      expect(screen.queryByRole("progressbar")).toBeNull();
      expect(screen.getAllByRole("button", { name: "Expand provider" })).toHaveLength(2);
      act(() =>
        drag.end?.({ canceled: false, operation: { source: { initialIndex: 0, index: 1 } } }),
      );
      expect(useSharedSettings.getState().usage.providerOrder).toEqual([
        "provider",
        "third",
        "other",
      ]);
      expect(useProviderUsageStore.getState().snapshots.provider?.authenticatedAs).toBe(
        "device-account",
      );
    },
  );
  it("renders cost-only and credit-only remote cards without falsely reporting no windows", () => {
    useUsageScopeStore.setState({ desktopId: "a" });
    const store = useHostUsageStore.getState();
    store.complete("a", store.begin("a"), [
      {
        providerId: "cost-only",
        status: "ok",
        windows: [],
        fetchedAt: Date.now(),
        cost: { amount: 9.87, currency: "USD", period: "cycle", estimated: false },
      },
      {
        providerId: "credit-only",
        status: "ok",
        windows: [],
        fetchedAt: Date.now(),
        credits: { balance: 12, label: "Only credits" },
      },
    ]);
    render(<UsagePanel />);
    expect(screen.getByText(/9.87/)).toBeTruthy();
    expect(screen.getByText("Only credits")).toBeTruthy();
    expect(screen.queryByText("No windows reported")).toBeNull();
  });

  it("keeps header refresh idle during reads, shows real collection pending, and denies a viewer", () => {
    useUsageScopeStore.setState({ desktopId: "a" });
    render(<UsagePanelHeaderActions dragControlClass="" />);
    const store = useHostUsageStore.getState();
    act(() => {
      store.begin("a");
    });
    expect(screen.getByTitle("Refresh").hasAttribute("disabled")).toBe(false);
    expect(screen.getByTitle("Refresh").querySelector(".animate-spin")).toBeNull();
    act(() => {
      store.begin("a", true);
    });
    expect(screen.getByTitle("Refresh").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTitle("Refresh").querySelector(".animate-spin")).toBeTruthy();
    act(() => {
      store.invalidate("a");
      useRemoteServersStore.setState((state) => ({
        servers: state.servers.map((server) => ({ ...server, scopes: ["session:read"] })),
      }));
    });
    expect(screen.getByTitle("Refresh").hasAttribute("disabled")).toBe(true);
  });
});
