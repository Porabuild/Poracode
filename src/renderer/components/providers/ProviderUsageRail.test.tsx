import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useHostUsageStore } from "@/renderer/state/hostUsageStore";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useUsageScopeStore } from "@/renderer/state/usageScopeStore";
import { openUsagePanelAtProvider } from "@/renderer/actions/panelActions";
import { useProviderUsageHydration } from "./useProviderUsageHydration";
import { ProviderUsageRail } from "./ProviderUsageRail";

const session = vi.hoisted(() => ({ remote: true }));
vi.mock("@/renderer/components/common/ResponsiveMenuSurface", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/components/common/ResponsiveMenuSurface")>()),
  useResponsiveMenu: () => ({ mobile: false, stackSubmenus: false }),
}));
vi.mock("@/renderer/bridge", () => ({ isRemoteSession: () => session.remote }));
vi.mock("@/renderer/actions/panelActions", () => ({
  openUsagePanel: vi.fn<() => void>(),
  openUsagePanelAtProvider: vi.fn<(providerId: string) => void>(),
}));
vi.mock("./useProviderUsageHydration", () => ({
  useProviderUsageHydration: vi.fn<(enabled?: boolean) => void>(),
}));
vi.mock("./hostUsage", () => ({
  fetchHostUsage: vi.fn<(connectionId: string) => Promise<void>>(),
}));
vi.mock("@/renderer/state/remoteServersStore", async () => {
  const { create } = await import("zustand");
  return {
    useRemoteServersStore: create(() => ({ servers: [], runtime: {} })),
    selectBrowserBridgeServer: () => undefined,
  };
});
vi.mock("@dnd-kit/react", () => ({
  DragDropProvider: ({ children }: { children: ReactNode }) => children,
  KeyboardSensor: {},
  PointerSensor: { configure: () => ({}) },
  useDraggable: () => ({ isDragging: false, ref: () => {} }),
}));
vi.mock("@dnd-kit/react/sortable", () => ({
  useSortable: () => ({ ref: () => {}, isDragging: false }),
  isSortable: () => false,
}));

function seed(connectionId: string, usedPercent: number, providerId = "codex") {
  const store = useHostUsageStore.getState();
  store.complete(connectionId, store.begin(connectionId), [
    {
      providerId,
      status: "ok",
      fetchedAt: Date.now(),
      windows: [{ id: "weekly", label: "Weekly", usedPercent }],
    },
  ]);
}

beforeEach(() => {
  const matchMedia = window.matchMedia;
  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    const list = matchMedia(query);
    Object.defineProperty(list, "matches", {
      value: query.includes("min-width"),
      configurable: true,
    });
    return list;
  });
  session.remote = true;
  useUsageScopeStore.setState({ desktopId: null });
  useHostUsageStore.setState({ hosts: {} });
  useProviderUsageStore.setState({
    snapshots: {
      codex: {
        providerId: "codex",
        status: "ok",
        fetchedAt: 1,
        windows: [{ id: "weekly", label: "Weekly", usedPercent: 99 }],
      },
    },
  });
  useSharedSettings.setState((state) => ({
    agentInstances: {},
    usage: {
      ...state.usage,
      showInSidebar: true,
      disabledProviders: [],
      sidebarHiddenProviders: [],
      providerOrder: [],
    },
  }));
  useRemoteServersStore.setState({
    servers: ["pc", "laptop"].map((id) => ({
      connectionId: id,
      desktopId: id,
      label: id === "pc" ? "Gaming PC" : "Laptop",
      endpoint: `https://${id}.test`,
      accessToken: "fixture",
      scopes: ["session:read", "session:operate"],
    })),
    runtime: {
      pc: { status: "online", projects: [], threads: [] },
      laptop: { status: "online", projects: [], threads: [] },
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("sidebar host usage", () => {
  it("shows the connected host's rings in the browser without opening Usage", () => {
    seed("pc", 30);
    render(<ProviderUsageRail orientation="column" />);
    const button = screen.getByRole("button", { name: "Codex usage — open usage panel" });
    const ring = button.querySelector("circle[stroke-dasharray]")!;
    expect(Number(ring.getAttribute("stroke-dasharray")!.split(" ")[0])).toBeCloseTo(
      2 * Math.PI * 11 * 0.3,
    );
    expect(useProviderUsageHydration).toHaveBeenCalledWith(false);
    fireEvent.click(button);
    expect(openUsagePanelAtProvider).toHaveBeenCalledExactlyOnceWith("codex");
  });

  it("shows the environment name when multiple environments are available", () => {
    seed("pc", 30);
    render(<ProviderUsageRail />);
    expect(screen.getByText("Gaming PC")).toBeVisible();
  });

  it("shows the connected host name even when it is the only remote", () => {
    useRemoteServersStore.setState((state) => ({ servers: state.servers.slice(0, 1) }));
    seed("pc", 30);
    render(<ProviderUsageRail />);
    expect(screen.getByText("Gaming PC")).toBeVisible();
  });

  it("omits the environment dropdown when only Local is available", () => {
    session.remote = false;
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    render(<ProviderUsageRail />);
    expect(screen.queryByRole("button", { name: "Connections" })).toBeNull();
  });

  it.each(["row", "column"] as const)(
    "shows the %s environment dropdown only while a remote is online on Local",
    (orientation) => {
      session.remote = false;
      useRemoteServersStore.setState({
        runtime: { pc: { status: "offline", projects: [], threads: [] } },
      });
      render(<ProviderUsageRail orientation={orientation} />);
      expect(screen.queryByRole("button", { name: "Connections" })).toBeNull();
      expect(screen.getByRole("button", { name: "Codex usage — open usage panel" })).toBeVisible();

      act(() => {
        useRemoteServersStore.setState({
          runtime: { pc: { status: "online", projects: [], threads: [] } },
        });
      });
      expect(screen.getByRole("button", { name: "Connections" })).toHaveAttribute("title", "Local");

      act(() => {
        useRemoteServersStore.setState({
          runtime: { pc: { status: "offline", projects: [], threads: [] } },
        });
      });
      expect(screen.queryByRole("button", { name: "Connections" })).toBeNull();
    },
  );

  it("switches environment through the name dropdown and keeps account data separate", async () => {
    seed("pc", 30);
    seed("laptop", 70, "gemini");
    render(<ProviderUsageRail orientation="column" />);
    fireEvent.click(screen.getByRole("button", { name: "Connections" }));
    const laptop = await screen.findByRole("option", { name: "Laptop" });
    fireEvent.click(laptop);
    expect(useUsageScopeStore.getState().desktopId).toBe("laptop");
    expect(screen.getByRole("button", { name: "Gemini usage — open usage panel" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Codex usage — open usage panel" })).toBeNull();
    expect(useProviderUsageStore.getState().snapshots.codex?.windows[0]?.usedPercent).toBe(99);
  });

  it("keeps environment switching available when the selected host has no usage", () => {
    render(<ProviderUsageRail />);
    expect(screen.getByText("Gaming PC")).toBeVisible();
    expect(screen.getByText("No data yet")).toBeVisible();
  });

  it("preserves the provider's existing right-click ring selection", async () => {
    seed("pc", 30, "antigravity");
    render(<ProviderUsageRail orientation="column" />);
    fireEvent.contextMenu(
      screen.getByRole("button", { name: "Antigravity usage — open usage panel" }),
      { clientX: 50, clientY: 50 },
    );
    const ring = await screen.findByRole("menuitem", { name: "Show Claude & GPT" });
    fireEvent.click(ring);
    expect(useSharedSettings.getState().usage.selectedRingGroups.antigravity).toBe("claude");
  });

  it("does not show another host's snapshots without read permission", () => {
    seed("pc", 30);
    useRemoteServersStore.setState((state) => ({
      servers: state.servers.map((server) => ({ ...server, scopes: [] })),
    }));
    render(<ProviderUsageRail orientation="column" />);
    expect(screen.queryByRole("button", { name: "Codex usage — open usage panel" })).toBeNull();
  });

  it("updates rings for the selected environment and can return to local Electron usage", () => {
    session.remote = false;
    useUsageScopeStore.setState({ desktopId: "pc" });
    seed("pc", 30);
    render(<ProviderUsageRail orientation="column" />);
    expect(screen.getByRole("button", { name: "Connections" })).toHaveAttribute(
      "title",
      "Gaming PC",
    );
    act(() => seed("pc", 60));
    const ring = screen
      .getByRole("button", { name: "Codex usage — open usage panel" })
      .querySelector("circle[stroke-dasharray]")!;
    expect(Number(ring.getAttribute("stroke-dasharray")!.split(" ")[0])).toBeCloseTo(
      2 * Math.PI * 11 * 0.6,
    );
    act(() => useUsageScopeStore.getState().setDesktopId(null));
    expect(screen.getByRole("button", { name: "Connections" })).toHaveAttribute("title", "Local");
    expect(useProviderUsageHydration).toHaveBeenLastCalledWith(true);
  });
});
