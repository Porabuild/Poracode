import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { act, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useGlobalTerminalStore } from "@/renderer/state/globalTerminalStore";
import { resetDevTerminalStore, useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useWorkspaceStore } from "@/renderer/state/workspaceStore";
import { useAppStore } from "@/renderer/state/appStore";
import { SidebarHeaderControls } from "./SidebarHeaderControls";

const { capabilities } = vi.hoisted(() => ({
  capabilities: { localBackend: false, nativeAppUpdates: false },
}));

vi.mock("@/renderer/views/MainView/parts/CreateProject/CreateProjectMenu", () => ({
  CreateProjectMenu: (props: { children: ReactNode }) => props.children,
}));

vi.mock("@/renderer/clientRuntime", () => ({
  isBrowserClientRuntime: () => true,
  hasClientCapability: (name: string) =>
    (name === "localBackend" && capabilities.localBackend) ||
    (name === "nativeAppUpdates" && capabilities.nativeAppUpdates),
  hasAnyClientBridge: () =>
    Boolean(
      (window as { poracode?: unknown }).poracode ??
      (window as { poracodeHost?: unknown }).poracodeHost,
    ),
  hasElectronHostBridge: () => Boolean((window as { poracodeHost?: unknown }).poracodeHost),
}));

describe("SidebarHeaderControls", () => {
  beforeEach(() => {
    capabilities.localBackend = false;
    capabilities.nativeAppUpdates = false;
    resetDevTerminalStore();
    useGlobalTerminalStore.setState({ tabs: [], activeTabId: null });
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        media: query,
        matches: query === "(max-width: 767px)",
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
      })),
    );
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    useSharedSettings.setState({ workspaces: [] });
    useWorkspaceStore.setState({ activeWorkspaceId: null, compactWorkspaceFilter: null });
    useAppStore.setState({ projects: [], threads: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the disconnected mobile status when no remote server is available", () => {
    const { container } = render(
      <AppProvider>
        <SidebarHeaderControls />
      </AppProvider>,
    );

    expect(container.querySelector(".lucide-wifi-off")).not.toBeNull();
    expect(container.querySelector(".lucide-wifi")).toBeNull();
  });

  it("keeps the mobile header clear while the remote server is connected", () => {
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Desktop",
          endpoint: "http://desktop.test",
          accessToken: "test-token",
        },
      ],
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    } as never);

    const { container } = render(
      <AppProvider>
        <SidebarHeaderControls />
      </AppProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("toggles a project-independent terminal from the desktop header", () => {
    capabilities.localBackend = true;
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        media: query,
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    );
    const { getByRole } = render(<SidebarHeaderControls />);
    const button = getByRole("button", { name: "Terminal" });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(useGlobalTerminalStore.getState().activeTabId).toMatch(/^shell:/);
    act(() => useDevTerminalStore.getState().closePanel());
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("gates the check-for-updates button on nativeAppUpdates", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        media: query,
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    );
    const { queryByRole, getByRole, rerender } = render(<SidebarHeaderControls />);
    expect(queryByRole("button", { name: "Check for updates" })).toBeNull();

    capabilities.nativeAppUpdates = true;
    rerender(<SidebarHeaderControls />);
    expect(getByRole("button", { name: "Check for updates" })).toBeInTheDocument();
  });

  it("keeps the mobile workspace filter trigger available even when the selected workspace has no projects", async () => {
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Desktop",
          endpoint: "http://desktop.test",
          accessToken: "test-token",
        },
      ],
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    } as never);
    useSharedSettings.setState({
      workspaces: [
        { id: "w1", name: "Work", createdAt: "2026-01-01T00:00:00.000Z", icon: "briefcase" },
        { id: "w2", name: "Empty", createdAt: "2026-01-01T00:00:00.000Z", icon: "rocket" },
      ],
    });
    useWorkspaceStore.setState({ compactWorkspaceFilter: "w2" });
    useAppStore.setState({
      projects: [
        {
          id: "p1",
          name: "Alpha",
          workspaceId: "w1",
          location: { kind: "posix", path: "/alpha" },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const { getByRole, findByRole } = render(
      <AppProvider>
        <SidebarHeaderControls />
      </AppProvider>,
    );

    const filterTrigger = getByRole("button", { name: "Filter threads" });
    expect(filterTrigger).toHaveClass("text-accent");
    fireEvent.click(filterTrigger);

    const dialog = await findByRole("dialog", { name: "Filter threads" });
    expect(dialog).toBeInTheDocument();
    fireEvent.click(getByRole("button", { name: "All workspaces" }));
    expect(useWorkspaceStore.getState().compactWorkspaceFilter).toBeNull();
  });
});
