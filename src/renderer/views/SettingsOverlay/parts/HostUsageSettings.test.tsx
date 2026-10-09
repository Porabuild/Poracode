import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useHostUsageStore } from "@/renderer/state/hostUsageStore";
import { fetchHostUsage } from "@/renderer/components/providers/hostUsage";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { HostUsageStatus, useHostUsageView } from "@/renderer/components/providers/HostUsageView";
import { HostUsageSettings } from "./HostUsageSettings";

vi.mock("@/renderer/state/remoteServersStore", async () => {
  const { create } = await import("zustand");
  return { useRemoteServersStore: create(() => ({ servers: [], runtime: {} })) };
});
vi.mock("@/renderer/components/providers/hostUsage", () => ({
  fetchHostUsage: vi.fn<typeof fetchHostUsage>(),
}));
vi.mock("@/renderer/components/common", () => ({
  Button: (props: {
    children: ReactNode;
    isDisabled?: boolean;
    onPress: () => void;
    "aria-label": string;
  }) => (
    <button
      type="button"
      aria-label={props["aria-label"]}
      disabled={props.isDisabled}
      onClick={props.onPress}
    >
      {props.children}
    </button>
  ),
}));
vi.mock("@/renderer/components/providers/ProviderUsageCircle", () => ({
  ProviderUsageCircle: () => <span />,
}));
const display = vi.hoisted(() => ({ providers: [] as readonly { id: string; label: string }[] }));
vi.mock("./UsageDisplaySettings", () => ({
  UsageDisplaySettings: (props: { providers: readonly { id: string; label: string }[] }) => {
    display.providers = props.providers;
    return null;
  },
}));
vi.mock("@dnd-kit/react/sortable", () => ({
  useSortable: () => ({ ref: () => {}, handleRef: () => {}, isDragging: false }),
}));
vi.mock("./SettingsForm", () => ({
  SettingsPage: (props: { children: ReactNode; actions: ReactNode }) => (
    <div>
      {props.actions}
      {props.children}
    </div>
  ),
}));

function Controller(props: { liveOnOpen?: boolean; refreshVersion?: number }) {
  const view = useHostUsageView("connection", props.refreshVersion, props.liveOnOpen);
  return <HostUsageStatus view={view} />;
}

describe("remote usage settings", () => {
  beforeEach(() => {
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "host",
          connectionId: "connection",
          endpoint: "https://host.test",
          label: "Host",
          accessToken: "fixture",
          scopes: ["session:read", "session:operate"],
        },
      ],
      runtime: { connection: { status: "online", projects: [], threads: [] } },
    });
    useHostUsageStore.setState({ hosts: {} });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function seed() {
    const store = useHostUsageStore.getState();
    store.complete("connection", store.begin("connection"), [
      {
        providerId: "provider:profile",
        authenticatedAs: "host-account",
        status: "ok",
        windows: [],
        fetchedAt: Date.now() - 300_000,
      },
    ]);
  }

  it("shows the owning account, explicit staleness and credential guidance, and refreshes the requested provider", () => {
    seed();
    render(<HostUsageSettings connectionId="connection" selector={<span>Host selector</span>} />);
    expect(screen.getByText("host-account")).toBeTruthy();
    expect(screen.getByText(/Usage is stale/)).toBeTruthy();
    expect(screen.getByText(/Credentials stay on the host/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Browser sign-in" })).toBeNull();
    expect(screen.queryByPlaceholderText(/API key/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Refresh provider:profile" }));
    expect(fetchHostUsage).toHaveBeenLastCalledWith("connection", true, {
      providerIds: ["provider:profile"],
      force: true,
    });
  });

  it("keeps last-known values visible offline and permits an explicit reconnect probe", () => {
    seed();
    useRemoteServersStore.setState({
      runtime: { connection: { status: "offline", projects: [], threads: [] } },
    });
    render(<HostUsageSettings connectionId="connection" selector={null} />);
    expect(screen.getByText(/Host offline/)).toBeTruthy();
    expect(screen.getByText("host-account")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Refresh$/ }));
    expect(fetchHostUsage).toHaveBeenLastCalledWith("connection", true, { force: true });
  });

  it("disables collection for a viewer and explains the permission", () => {
    const server = useRemoteServersStore.getState().servers[0]!;
    useRemoteServersStore.setState({ servers: [{ ...server, scopes: ["session:read"] }] });
    render(<HostUsageSettings connectionId="connection" selector={null} />);
    expect(screen.getByRole("button", { name: /^Refresh$/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/permission to refresh usage/)).toBeTruthy();
  });

  it("renders reported quota windows without an empty-window status", () => {
    const store = useHostUsageStore.getState();
    store.complete("connection", store.begin("connection"), [
      {
        providerId: "provider",
        status: "ok",
        windows: [{ id: "session-5h", label: "Session", usedPercent: 42 }],
        fetchedAt: Date.now(),
      },
    ]);
    render(<HostUsageSettings connectionId="connection" selector={null} />);
    expect(screen.queryByText("No windows reported")).toBeNull();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("42");
  });

  it("performs live refresh from the embedded panel and observes header refresh requests", () => {
    const { rerender } = render(<Controller liveOnOpen />);
    expect(fetchHostUsage).toHaveBeenCalledWith("connection", true, { force: true });
    rerender(<Controller refreshVersion={1} />);
    expect(fetchHostUsage).toHaveBeenLastCalledWith("connection", true, { force: true });
  });

  it.each(["offline", "error"] as const)(
    "retries an empty embedded %s host on explicit refresh",
    (status) => {
      useRemoteServersStore.setState({
        runtime: { connection: { status, projects: [], threads: [] } },
      });
      const { rerender } = render(<Controller />);
      expect(fetchHostUsage).not.toHaveBeenCalled();
      rerender(<Controller refreshVersion={1} />);
      expect(fetchHostUsage).toHaveBeenLastCalledWith("connection", true, { force: true });
    },
  );

  it("does not expose previously loaded data when the grant cannot read usage", () => {
    seed();
    const server = useRemoteServersStore.getState().servers[0]!;
    useRemoteServersStore.setState({ servers: [{ ...server, scopes: [] }] });
    render(<HostUsageSettings connectionId="connection" selector={null} />);
    expect(screen.queryByText("host-account")).toBeNull();
    expect(screen.getByText(/permission to read usage/)).toBeTruthy();
  });

  it("distinguishes a reachable host error from offline transport", () => {
    seed();
    useRemoteServersStore.setState({
      runtime: { connection: { status: "error", projects: [], threads: [] } },
    });
    render(<HostUsageSettings connectionId="connection" selector={null} />);
    expect(screen.getByText(/Could not load usage/)).toBeTruthy();
    expect(screen.queryByText(/Host offline/)).toBeNull();
  });
  it("starts with loading rather than an empty-data flash, and labels an empty offline host accurately", () => {
    const { unmount } = render(<HostUsageSettings connectionId="connection" selector={null} />);
    expect(screen.getByText("Loading usage…")).toBeTruthy();
    expect(screen.queryByText("No usage data yet.")).toBeNull();
    unmount();
    useRemoteServersStore.setState({
      runtime: { connection: { status: "offline", projects: [], threads: [] } },
    });
    render(<HostUsageSettings connectionId="connection" selector={null} />);
    expect(screen.getByText("Host offline. No cached usage is available.")).toBeTruthy();
    expect(screen.queryByText(/Showing last known/)).toBeNull();
  });

  it("keeps explicit refresh usable during cache reads and updates labels without polling", () => {
    vi.useFakeTimers();
    seed();
    render(<HostUsageSettings connectionId="connection" selector={null} />);
    const store = useHostUsageStore.getState();
    act(() => {
      store.begin("connection");
    });
    expect(screen.getByRole("button", { name: /^Refresh$/ }).hasAttribute("disabled")).toBe(false);
    expect(
      screen.getByRole("button", { name: /^Refresh$/ }).querySelector(".animate-spin"),
    ).toBeNull();
    act(() => {
      store.complete("connection", useHostUsageStore.getState().hosts.connection!.request, []);
    });
    vi.mocked(fetchHostUsage).mockClear();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(fetchHostUsage).not.toHaveBeenCalled();
    act(() => {
      store.begin("connection", true);
    });
    expect(screen.getByRole("button", { name: /^Refresh$/ }).hasAttribute("disabled")).toBe(true);
  });

  it("explains unsupported refresh as an update-host requirement", () => {
    seed();
    const store = useHostUsageStore.getState();
    store.fail("connection", store.begin("connection", true), true);
    render(<HostUsageSettings connectionId="connection" selector={null} />);
    expect(screen.getByText(/Update this host to refresh usage remotely/)).toBeTruthy();
  });
  it("keeps sidebar visibility choices available before any usage has been collected", () => {
    render(<HostUsageSettings connectionId="connection" selector={null} />);
    expect(display.providers.length).toBeGreaterThan(0);
    expect(display.providers.every((provider) => provider.label.length > 0)).toBe(true);
    expect(screen.getByText("Loading usage…")).toBeTruthy();
  });
});
