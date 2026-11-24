import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { ReactNode, Ref } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Project } from "@/shared/contracts";
import type { PoracodeBridge } from "@/shared/ipc";
import {
  defaultMemorySettings,
  type MemoryCommandPayload,
  type RemoteMemoryCatalogCommand,
} from "@/shared/memory";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { MemorySettings } from "./parts/MemorySettings";
import { installBrowserClientRuntime, resetClientRuntimeForTest } from "@/renderer/clientRuntime";
import { resetAdaptiveLayoutForTest } from "@/renderer/adaptiveLayout";

const statusesState = {
  agentStatuses: [] as AgentStatus[],
  wslAgentStatuses: [] as AgentStatus[],
  inFirstLaunchDiscovery: false,
};

const appState = {
  projects: [] as Project[],
  openSchedules: vi.fn<() => void>(),
};

const bridgeState = {
  remote: false,
  memoryCommand: vi.fn<(command: MemoryCommandPayload) => Promise<unknown>>(async (command) =>
    command.action === "list" ? [] : undefined,
  ),
};

const sharedSettingsState = {
  disabledAgents: [] as string[],
  hiddenModels: {},
  memory: defaultMemorySettings,
};

vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: (selector: (state: typeof statusesState) => unknown) =>
    selector(statusesState),
}));

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: (selector: (state: typeof appState) => unknown) => selector(appState),
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: typeof sharedSettingsState) => unknown) =>
    selector(sharedSettingsState),
}));

vi.mock("@/renderer/components/layout/PageLayout", () => ({
  PageLayout: (props: {
    sidebar: ReactNode;
    content: ReactNode;
    compactHome?: boolean;
    compactTitle?: string;
    onCompactBack?: () => void;
  }) => (
    <div data-compact-home={props.compactHome || undefined} data-compact-title={props.compactTitle}>
      <aside>{props.sidebar}</aside>
      <main>{props.content}</main>
      {props.onCompactBack ? (
        <button type="button" onClick={props.onCompactBack}>
          Mobile back
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock("@/renderer/components/common", () => ({
  Button: (props: {
    children: ReactNode;
    onPress?: () => void;
    ref?: Ref<HTMLButtonElement>;
    "aria-label"?: string;
    isDisabled?: boolean;
  }) => (
    <button
      type="button"
      aria-label={props["aria-label"]}
      disabled={props.isDisabled}
      onClick={props.onPress}
      ref={props.ref}
    >
      {props.children}
    </button>
  ),
  PixelLoader: () => <span />,
  ToggleSwitch: () => <span />,
  TuxIcon: () => <span />,
  Select: (props: {
    options?: { id: string; label: string; isDisabled?: boolean }[];
    onChange?: (id: string) => void;
  }) => (
    <span data-testid="machine-select">
      {props.options?.map((option) => (
        <button
          key={option.id}
          type="button"
          disabled={option.isDisabled}
          onClick={() => props.onChange?.(option.id)}
        >
          {option.label}
        </button>
      ))}
    </span>
  ),
  SidebarButton: (props: {
    icon?: ReactNode;
    label: string;
    onPress?: () => void;
    suffix?: ReactNode;
  }) => (
    <>
      <button type="button" onClick={props.onPress}>
        {props.icon}
        {props.label}
        {props.suffix}
      </button>
    </>
  ),
}));

vi.mock("@/renderer/components/providers/ProviderIcon", () => ({
  ProviderIcon: () => <span />,
}));

vi.mock("@/renderer/views/MainView/parts/AppShell/AppShell", () => ({
  useSidebar: () => ({
    isCollapsed: false,
    collapse: () => undefined,
    expand: () => undefined,
  }),
}));

vi.mock("@/renderer/bridge", () => ({
  isDevApp: () => false,
  isRemoteSession: () => bridgeState.remote,
  isWindows: () => false,
  readBridge: () => ({
    openExternal: vi.fn<() => Promise<void>>(async () => undefined),
    memoryCommand: bridgeState.memoryCommand,
  }),
}));

vi.mock("./parts/GeneralSettings", () => ({
  GeneralSettings: () => <div data-settings-anchor="general.language">General</div>,
}));

vi.mock("./parts/ImportSettings", () => ({
  ImportSettings: (props: { connectionKey?: string }) => (
    <div data-testid="import-host" data-import-host={props.connectionKey ?? "local"}>
      Import sessions
    </div>
  ),
}));
vi.mock("./parts/SkillsSettings", () => ({
  SkillsSettings: (props: { connectionKey?: string; hostPlatform?: string }) => (
    <div
      data-testid="skills-host"
      data-skills-host={props.connectionKey ?? "local"}
      data-skills-platform={props.hostPlatform ?? ""}
    >
      Skills
    </div>
  ),
}));
vi.mock("./parts/PluginsSettings", () => ({
  PluginsSettings: (props: { connectionKey?: string }) => (
    <div data-testid="plugin-host" data-plugin-host={props.connectionKey ?? "local"} />
  ),
}));
vi.mock("./parts/CrewsSettings", () => ({
  CrewsSettings: (props: { machineKey?: string }) => (
    <div data-testid="crews-host" data-crews-machine={props.machineKey ?? "local"}>
      Crews
    </div>
  ),
}));

const profileMounts = vi.hoisted(() => ({ count: 0 }));
vi.mock("./parts/ProfileSettings", async () => {
  const { useEffect } = await import("react");
  return {
    ProfileSettings: () => {
      useEffect(() => {
        profileMounts.count += 1;
      }, []);
      return <div>Profile content</div>;
    },
  };
});

vi.mock("./parts/AppearanceSettings", () => ({
  AppearanceSettings: () => <div data-settings-anchor="appearance.mode">Appearance</div>,
}));

vi.mock("./parts/TerminalSettings", () => ({
  TerminalSettings: () => <div>Terminal</div>,
}));

vi.mock("./parts/ThreadSettings", () => ({
  ThreadSettings: () => <div>Threads</div>,
}));

vi.mock("./parts/GitSettings", () => ({
  GitSettings: () => <div>Git</div>,
}));

vi.mock("./parts/NotificationSettings", () => ({
  NotificationSettings: () => <div>Notifications</div>,
}));

vi.mock("./parts/AISettings", () => ({
  AISettings: (props: { connectionKey?: string }) => (
    <div data-testid="ai-host" data-ai-host={props.connectionKey ?? "local"}>
      AI Helpers
    </div>
  ),
}));

vi.mock("./parts/AcpRegistrySettings", () => ({
  AcpRegistrySettings: () => <div>Agent Registry Settings</div>,
}));

vi.mock("./parts/AgentsGeneralSettings", () => ({
  AgentsGeneralSettings: () => <div>Agents General Settings</div>,
}));

vi.mock("./parts/SearchSettings", () => ({
  SearchSettings: () => <div>Search</div>,
}));

vi.mock("./parts/ShortcutsSettings", () => ({
  ShortcutsSettings: () => <div>Shortcuts</div>,
}));

vi.mock("./parts/UsageSettings", () => ({
  UsageSettings: () => <div>Provider Usage</div>,
}));

vi.mock("./parts/ArchivedThreadsSettings", () => ({
  ArchivedThreadsSettings: () => <div>Archived</div>,
}));

vi.mock("./parts/McpServersSettings", () => ({
  McpServersSettings: ({ connectionKey, local }: { connectionKey?: string; local: boolean }) => (
    <span>
      {connectionKey
        ? `MCP settings for ${connectionKey}`
        : local
          ? "Local MCP settings"
          : "Offline MCP settings"}
    </span>
  ),
}));

vi.mock("./parts/AboutSettings", () => ({
  AboutSettings: () => <div>About</div>,
}));

vi.mock("./parts/DevSettings", () => ({
  DevSettings: () => <div>Dev</div>,
}));

vi.mock("./parts/SingleAgentSettings", () => ({
  AgentSettingsEmpty: () => <div>No agents installed.</div>,
  SingleAgentSettings: (props: { agentKind: string }) => <div>Agent {props.agentKind}</div>,
}));

import { SettingsOverlay, settingsSectionProductProperties } from "./SettingsOverlay";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useMachineSelectionStore } from "@/renderer/state/machineSelectionStore";
import { useWslDistroListStore } from "@/renderer/state/machines";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRecord, RemoteServerRuntime } from "@/renderer/state/remoteServers/types";
import { useSettingsHostStore } from "@/renderer/state/settingsHostStore";
import { __resetBrowserBridgeForTest } from "@/renderer/state/remoteServers/browserBridge";

const baseCapabilities = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: [],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal" as const,
  presentationMode: "terminal" as const,
  settingDefs: [],
};

function makeStatus(kind: AgentStatus["kind"], input: Partial<AgentStatus> = {}): AgentStatus {
  return {
    kind,
    label: kind,
    installed: true,
    authState: "authenticated",
    capabilities: baseCapabilities,
    ...input,
  };
}

describe("SettingsOverlay", () => {
  afterEach(() => {
    cleanup();
    resetClientRuntimeForTest();
    vi.unstubAllGlobals();
    resetAdaptiveLayoutForTest();
    appState.projects = [];
    useWslDistroListStore.setState({ distros: [], loadedFor: null });
    useMachineSelectionStore.setState({ selectedMachineId: "local" });
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  });

  it("keeps a directly opened Profile available while a saved desktop is offline", () => {
    installBrowserClientRuntime({} as PoracodeBridge);
    bridgeState.remote = true;
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "offline",
          label: "Studio",
          endpoint: "https://desktop.example.test",
          accessToken: "token",
          scopes: [],
        },
      ],
      runtime: { offline: { status: "offline", projects: [], threads: [] } },
    });
    usePanelStore.getState().openSettingsSection("profile");
    render(<SettingsOverlay onClose={() => undefined} />);
    expect(screen.getByText("Profile content")).toBeInTheDocument();
    expect(screen.queryByText("No remote environments connected yet.")).toBeNull();
  });

  beforeEach(() => {
    statusesState.agentStatuses = [];
    statusesState.wslAgentStatuses = [];
    appState.projects = [];
    appState.openSchedules.mockReset();
    bridgeState.remote = false;
    bridgeState.memoryCommand.mockClear();
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    useSettingsHostStore.setState({ desktopId: null });
    __resetBrowserBridgeForTest();
    usePanelStore.setState({ settingsSection: null, settingsAnchor: null });
  });

  it("offers a host picker on Plugins so a paired machine's packages can be managed", () => {
    useRemoteServersStore.setState({
      servers: [
        {
          connectionId: "studio-connection",
          desktopId: "studio-desktop",
          label: "Studio",
          endpoint: "https://studio.example.test",
          accessToken: "token",
          scopes: ["session:read", "session:operate"],
        },
      ],
      runtime: {
        "studio-connection": { status: "online", projects: [], threads: [] },
      },
    });
    usePanelStore.getState().openSettingsSection("plugins");
    render(<SettingsOverlay onClose={() => undefined} />);

    expect(screen.getByTestId("machine-select")).toBeInTheDocument();
    expect(screen.getByTestId("plugin-host")).toHaveAttribute("data-plugin-host", "local");

    fireEvent.click(screen.getByRole("button", { name: "Studio" }));

    expect(screen.getByTestId("plugin-host")).toHaveAttribute(
      "data-plugin-host",
      "studio-connection",
    );
  });

  it("offers a host picker on desktop Memory settings to inspect a paired host", () => {
    useRemoteServersStore.setState({
      servers: [
        {
          connectionId: "studio-connection",
          desktopId: "studio-desktop",
          label: "Studio",
          endpoint: "https://studio.example.test",
          accessToken: "token",
          scopes: ["session:read", "session:operate"],
          memoryCatalogAvailable: true,
        },
      ],
      runtime: {
        "studio-connection": { status: "online", projects: [], threads: [] },
      },
    });
    usePanelStore.getState().openSettingsSection("memory");
    render(<SettingsOverlay onClose={() => undefined} />);

    expect(screen.getByRole("button", { name: "Studio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dream now" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Studio" }));

    expect(screen.queryByRole("button", { name: "Dream now" })).toBeNull();
  });

  it("opens memory list management in a dialog and opens an editor modal to add a memory", async () => {
    usePanelStore.getState().openSettingsSection("memory");
    render(<SettingsOverlay onClose={() => undefined} />);

    expect(screen.getByRole("button", { name: "Dream now" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Memories" })).toBeNull();
    expect(bridgeState.memoryCommand).not.toHaveBeenCalledWith({ action: "list" });

    fireEvent.click(screen.getByRole("button", { name: "Manage memories" }));
    const dialog = await screen.findByRole("dialog", { name: "Memories" });
    expect(await within(dialog).findByText("No memories yet.")).toBeInTheDocument();
    expect(bridgeState.memoryCommand).toHaveBeenCalledWith({ action: "list" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    const addDialog = await screen.findByRole("dialog", { name: "Add a memory" });
    const textarea = within(addDialog).getByRole("textbox", { name: "Memory" });
    expect(textarea).toHaveFocus();
    fireEvent.keyDown(textarea, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add a memory" })).toBeNull());
    expect(screen.getByRole("dialog", { name: "Memories" })).toBeInTheDocument();
  });

  it("focuses the memory editor modal and returns focus to its row when editing is cancelled", async () => {
    bridgeState.memoryCommand
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ id: "memory-1", scope: "global", summary: "Always use bun" }]);
    usePanelStore.getState().openSettingsSection("memory");
    render(<SettingsOverlay onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage memories" }));

    const dialog = await screen.findByRole("dialog", { name: "Memories" });
    fireEvent.click(await within(dialog).findByRole("button", { name: "Edit" }));
    const editDialog = await screen.findByRole("dialog", { name: "Edit memory" });
    const editor = within(editDialog).getByRole("textbox", { name: "Memory" });
    expect(editor).toHaveFocus();
    fireEvent.keyDown(editor, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit memory" })).toBeNull());
    expect(within(dialog).getByRole("button", { name: "Edit" })).toHaveFocus();
  });

  it("filters the memory catalog by summary and body", async () => {
    bridgeState.memoryCommand.mockResolvedValueOnce(undefined).mockResolvedValueOnce([
      { id: "memory-1", scope: "global", summary: "Use bun", body: "Use bun for checks" },
      { id: "memory-2", scope: "project", summary: "Use SQLite", body: "Keep a local ledger" },
    ]);
    render(<MemorySettings />);
    fireEvent.click(screen.getByRole("button", { name: "Manage memories" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Memories" }));
    expect(await dialog.findByText("Use bun")).toBeInTheDocument();
    const search = dialog.getByRole("searchbox", { name: "Search memories" });
    fireEvent.change(search, { target: { value: "LEDGER" } });
    expect(dialog.getByText("Use SQLite")).toBeInTheDocument();
    expect(dialog.queryByText("Use bun")).toBeNull();
    fireEvent.change(search, { target: { value: "something else" } });
    expect(dialog.getByText("No results")).toBeInTheDocument();
  });

  it("manages a projected project's catalog on its owning connection", async () => {
    const projectId = "remote:owner-b:project:project-b";
    appState.projects = [
      {
        id: projectId,
        remoteServerId: "owner-b",
        remoteId: "project-b",
        name: "Remote project",
        location: { kind: "posix", path: "/remote/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const ownerConnections: string[] = [];
    const memoryCatalog = vi.fn<(command: RemoteMemoryCatalogCommand) => Promise<unknown>>(
      async (command) => ({
        action: command.action,
        result: command.action === "list" ? [] : undefined,
      }),
    );
    const client = { memoryCatalog } as unknown as RemoteDesktopClient;
    const previousWithClient = useRemoteServersStore.getState().withClient;
    useRemoteServersStore.setState({
      servers: ["owner-a", "owner-b"].map((id) => ({
        desktopId: id,
        label: id,
        endpoint: `https://${id}.test`,
        accessToken: "fixture",
        scopes: ["session:operate"],
        memoryCatalogAvailable: true,
      })),
      withClient: async (connectionKey, invoke) => {
        ownerConnections.push(connectionKey);
        return invoke(client);
      },
    });
    try {
      render(<MemorySettings projectId={projectId} />);
      fireEvent.click(screen.getByRole("button", { name: "Manage memories" }));
      const dialog = await screen.findByRole("dialog", { name: "Memories" });
      expect(await within(dialog).findByText("No memories yet.")).toBeInTheDocument();
      expect(ownerConnections).toEqual(["owner-b", "owner-b"]);
      expect(memoryCatalog).toHaveBeenNthCalledWith(1, {
        action: "status",
        projectId: "project-b",
      });
      expect(memoryCatalog).toHaveBeenNthCalledWith(2, { action: "list", projectId: "project-b" });
      expect(bridgeState.memoryCommand).not.toHaveBeenCalled();
    } finally {
      useRemoteServersStore.setState({ withClient: previousWithClient });
    }
  });

  it("keeps catalog commands off a connection whose older host omitted the capability", () => {
    bridgeState.remote = true;
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "legacy-host",
          label: "Legacy host",
          endpoint: "https://legacy.example.test",
          accessToken: "fixture",
          scopes: ["session:operate"],
        },
      ],
      runtime: { "legacy-host": { status: "online", projects: [], threads: [] } },
    });
    render(<MemorySettings />);
    expect(screen.queryByRole("button", { name: "Manage memories" })).toBeNull();
    expect(
      screen.getByText("Memory catalog management is unavailable on this connection."),
    ).toBeInTheDocument();
    expect(bridgeState.memoryCommand).not.toHaveBeenCalled();
  });

  it("scrolls to an initially requested setting anchor and consumes the request", async () => {
    const scrollIntoView = vi.fn<(options?: ScrollIntoViewOptions | boolean) => void>();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    usePanelStore.getState().openSettingsSection("general", "general.language");
    render(<SettingsOverlay onClose={() => undefined} />);
    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" }),
    );
    expect(within(screen.getByRole("main")).getByText("General")).toHaveClass(
      "poracode-setting-highlight",
    );
    expect(usePanelStore.getState().settingsSection).toBeNull();
    expect(usePanelStore.getState().activeSettingsSection).toBe("general");
    expect(usePanelStore.getState().settingsAnchor).toBeNull();
  });

  it("repeats a same-section setting request while the overlay is open", async () => {
    const scrollIntoView = vi.fn<(options?: ScrollIntoViewOptions | boolean) => void>();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    render(<SettingsOverlay onClose={() => undefined} />);
    act(() => usePanelStore.getState().openSettingsSection("appearance", "appearance.mode"));
    await waitFor(() =>
      expect(within(screen.getByRole("main")).getByText("Appearance")).toHaveClass(
        "poracode-setting-highlight",
      ),
    );
    scrollIntoView.mockClear();
    act(() => usePanelStore.getState().openSettingsSection("appearance", "appearance.mode"));
    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" }),
    );
  });
  it("ports the nightly mobile settings index and keeps its drill-down local", () => {
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

    const { container } = render(<SettingsOverlay onClose={() => undefined} />);
    const layout = container.querySelector("[data-compact-title]");
    const main = screen.getByRole("main");
    expect(layout).not.toHaveAttribute("data-compact-home");
    expect(layout).toHaveAttribute("data-compact-title", "Settings");
    expect(
      within(main).getByText("Stored on this device; the desktop keeps its own values."),
    ).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: /Desktop Settings/ })).toBeInTheDocument();

    fireEvent.click(within(main).getByRole("button", { name: /Appearance/ }));
    expect(layout).toHaveAttribute("data-compact-title", "Appearance");
    expect(within(main).getByText("Appearance")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mobile back" }));
    expect(layout).toHaveAttribute("data-compact-title", "Settings");
    expect(within(main).getByRole("button", { name: /Desktop Settings/ })).toBeInTheDocument();
  });

  it("returns direct compact settings pages to the main page", () => {
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
    const onClose = vi.fn<() => void>();
    usePanelStore.setState({ settingsSection: "remoteServers" });

    const { container } = render(<SettingsOverlay onClose={onClose} />);
    expect(container.querySelector("[data-compact-title]")).toHaveAttribute(
      "data-compact-title",
      "Connections",
    );

    fireEvent.click(screen.getByRole("button", { name: "Mobile back" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Desktop Settings/ })).not.toBeInTheDocument();
  });

  it("uses the compact page history when returning from Usage settings", () => {
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
    const onClose = vi.fn<() => void>();
    const onBack = vi.fn<() => void>();
    usePanelStore.setState({ settingsSection: "usage" });

    render(<SettingsOverlay onClose={onClose} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Mobile back" }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ports the nightly Desktop Settings index and returns detail pages to it", () => {
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

    const { container } = render(<SettingsOverlay onClose={() => undefined} />);
    const layout = container.querySelector("[data-compact-title]");
    const main = screen.getByRole("main");

    fireEvent.click(within(main).getByRole("button", { name: /Desktop Settings/ }));
    expect(layout).toHaveAttribute("data-compact-title", "Desktop Settings");
    expect(
      within(main).getByText("Edits the paired desktop and syncs back to it."),
    ).toBeInTheDocument();
    expect(
      within(main)
        .getAllByRole("button")
        .map((button) => button.textContent?.replace(/\s+/gu, " ").trim()),
    ).toEqual([
      "ProfileIdentity and usage stats",
      "Provider UsageTracking and display",
      "SchedulesScheduled tasks on this desktop",
      "AI HelpersTitle, commit, and conflict models",
      "MemoryShared notes across providers",
      "MCP ServersConfigured MCP servers",
      "AgentsEnabled agents, model visibility and order",
      "CrewsSaved crews for the model picker",
      "Import sessions",
      "Archived ThreadsRestore or delete",
    ]);

    fireEvent.click(within(main).getByRole("button", { name: /AI Helpers/ }));
    expect(layout).toHaveAttribute("data-compact-title", "AI Helpers");
    fireEvent.click(screen.getByRole("button", { name: "Mobile back" }));
    expect(layout).toHaveAttribute("data-compact-title", "Desktop Settings");
  });

  it("opens remote Desktop Settings with its machine selector in the PWA", () => {
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
    bridgeState.remote = true;
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Studio",
          endpoint: "https://desktop.example.test",
          accessToken: "token",
          scopes: ["projects:manage"],
        },
      ],
      runtime: {
        "desktop-1": {
          status: "online",
          projects: [],
          threads: [],
        },
      },
    });

    const { container } = render(<SettingsOverlay onClose={() => undefined} />);
    const main = screen.getByRole("main");
    const desktopSettings = within(main).getByRole("button", { name: /Desktop Settings/ });
    expect(desktopSettings).toBeEnabled();
    // Crews and Git are host settings, so they live with the paired host's pages.
    expect(within(main).queryByRole("button", { name: /^Crews/ })).toBeNull();
    expect(within(main).queryByRole("button", { name: /^Git/ })).toBeNull();
    expect(desktopSettings).toHaveTextContent("Schedules, AI, agents, crews, and Git");
    expect(within(main).getByRole("button", { name: /^General/ })).toHaveTextContent(
      "Language and sidebar shortcuts",
    );

    fireEvent.click(desktopSettings);

    expect(within(main).getByRole("button", { name: "Connections" })).toHaveTextContent("Studio");
    expect(within(main).getByRole("button", { name: /^Crews/ })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: /^Git/ })).toHaveTextContent(
      "Pull request defaults",
    );
    fireEvent.click(within(main).getByRole("button", { name: "Import sessions" }));
    expect(container.querySelector("[data-compact-title]")).toHaveAttribute(
      "data-compact-title",
      "Import",
    );
    expect(within(main).getByText("Import sessions")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mobile back" }));
    expect(within(main).getByRole("button", { name: "Import sessions" })).toBeInTheDocument();
    fireEvent.click(within(main).getByRole("button", { name: /^Archived Threads/ }));
    expect(container.querySelector("[data-compact-title]")).toHaveAttribute(
      "data-compact-title",
      "Archived Threads",
    );
    expect(within(main).getByText("Archived")).toBeInTheDocument();
  });

  it("scopes a PWA's host-backed pages with the host bar and remounts them per host", () => {
    installBrowserClientRuntime({} as PoracodeBridge);
    bridgeState.remote = true;
    profileMounts.count = 0;
    const host = (desktopId: string, label: string) => ({
      desktopId,
      label,
      endpoint: `https://${desktopId}.example.test`,
      accessToken: "token",
      scopes: [],
    });
    useRemoteServersStore.setState({
      servers: [host("pc", "PC"), host("mac", "Mac")],
      runtime: {
        pc: { status: "online", projects: [], threads: [] },
        mac: { status: "online", projects: [], threads: [] },
      },
    });
    usePanelStore.getState().openSettingsSection("profile");
    render(<SettingsOverlay onClose={() => undefined} />);
    expect(screen.getByText("Profile content")).toBeInTheDocument();
    expect(screen.getByTestId("machine-select")).toBeInTheDocument();
    expect(profileMounts.count).toBe(1);

    act(() => useSettingsHostStore.getState().choose("mac"));
    expect(profileMounts.count).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: /^Appearance/ }));
    expect(screen.queryByTestId("machine-select")).toBeNull();
  });

  it("keeps the archive machine picker outside the settings scroll area", () => {
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "mac",
          label: "Studio Mac",
          endpoint: "https://mac.example.test",
          accessToken: "token",
          scopes: [],
        },
      ],
    });
    usePanelStore.getState().openSettingsSection("archived");
    render(<SettingsOverlay onClose={() => undefined} />);

    const scrollArea = screen.getByText("Archived").closest("[data-settings-scroll-area]");
    expect(scrollArea).toHaveClass("pb-20");
    expect(scrollArea).not.toContainElement(screen.getByTestId("machine-select"));
    expect(screen.getByRole("main")).toContainElement(screen.getByTestId("machine-select"));
  });

  it("switches MCP settings to a paired host from the bottom machine selector", () => {
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "remote-id",
          connectionId: "paired",
          label: "Studio Mac",
          endpoint: "https://mac.example.test",
          accessToken: "token",
          scopes: ["projects:manage"],
        },
      ],
      runtime: { paired: { status: "online", projects: [], threads: [] } },
    });
    usePanelStore.getState().openSettingsSection("mcpServers");
    render(<SettingsOverlay onClose={() => undefined} />);

    const scrollArea = screen
      .getByText("Local MCP settings")
      .closest("[data-settings-scroll-area]");
    const selector = screen.getByTestId("machine-select");
    expect(scrollArea).toHaveClass("pb-20");
    expect(scrollArea).not.toContainElement(selector);
    fireEvent.click(within(selector).getByRole("button", { name: "Studio Mac" }));
    expect(screen.getByText("MCP settings for paired")).toBeInTheDocument();
  });

  it("shows the floating machine selector for Agent Registry when multiple machines host projects", () => {
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "mac",
          label: "Studio Mac",
          endpoint: "https://mac.example.test",
          accessToken: "token",
          scopes: [],
        },
      ],
    });
    appState.projects = [
      {
        id: "mac-project",
        name: "Mac project",
        location: { kind: "posix", path: "/repo", remoteServerId: "mac" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    usePanelStore.getState().openSettingsSection("acpRegistry");
    render(<SettingsOverlay onClose={() => undefined} />);

    const main = screen.getByRole("main");
    expect(within(main).getByText("Agent Registry Settings")).toBeInTheDocument();
    expect(within(main).getByTestId("machine-select")).toBeInTheDocument();
    expect(
      screen.getByText("Agent Registry Settings").closest(".min-h-0.flex-1"),
    ).not.toContainElement(screen.getByTestId("machine-select"));
  });

  it("leaves a paired machine with no projects out of the Agent Registry selector", () => {
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "mac",
          label: "Studio Mac",
          endpoint: "https://mac.example.test",
          accessToken: "token",
          scopes: [],
        },
      ],
    });
    usePanelStore.getState().openSettingsSection("acpRegistry");
    render(<SettingsOverlay onClose={() => undefined} />);

    expect(screen.getByText("Agent Registry Settings")).toBeInTheDocument();
    expect(screen.queryByTestId("machine-select")).toBeNull();
  });

  it("reserves scope-bar room on Agents only when a second machine hosts a project", () => {
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "mac",
          label: "Studio Mac",
          endpoint: "https://mac.example.test",
          accessToken: "token",
          scopes: [],
        },
      ],
    });
    usePanelStore.getState().openSettingsSection("agentsGeneral");
    const { rerender } = render(<SettingsOverlay onClose={() => undefined} />);

    const scrollArea = screen
      .getByText("Agents General Settings")
      .closest("[data-settings-scroll-area]");
    expect(scrollArea).toHaveClass("pb-8");
    expect(scrollArea).not.toHaveClass("pb-20");

    act(() => {
      appState.projects = [
        {
          id: "mac-project",
          name: "Mac project",
          location: { kind: "posix", path: "/repo", remoteServerId: "mac" },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ];
    });
    rerender(<SettingsOverlay onClose={() => undefined} />);

    expect(scrollArea).toHaveClass("pb-20");
    expect(scrollArea).not.toHaveClass("pb-8");
  });

  it("opens Schedules from the compact Desktop Settings index", () => {
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
    const onClose = vi.fn<() => void>();

    render(<SettingsOverlay onClose={onClose} />);
    const main = screen.getByRole("main");
    fireEvent.click(within(main).getByRole("button", { name: /Desktop Settings/ }));
    fireEvent.click(within(main).getByRole("button", { name: /Schedules/ }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(appState.openSchedules).toHaveBeenCalledTimes(1);
  });

  it("uses bounded analytics properties for regular and agent settings", () => {
    expect(settingsSectionProductProperties("general")).toEqual({
      key: "settings:general",
      properties: { settings_section: "general", settings_scope: "application" },
    });
    expect(settingsSectionProductProperties("agents:claude:private-profile")).toEqual({
      key: "settings:agent:claude",
      properties: {
        provider: "claude",
        settings_section: "agent",
        settings_scope: "application",
      },
    });
  });

  it("groups sidebar sections under labeled headers", () => {
    const { container } = render(<SettingsOverlay onClose={() => undefined} />);

    const headers = [...container.querySelectorAll("aside p")].map((el) => el.textContent);
    expect(headers).toEqual(["Personal", "Workspace", "Agents", "Remote", "About"]);

    const labels = screen.getAllByRole("button").map((button) => button.textContent);
    expect(labels.indexOf("Notifications")).toBeLessThan(labels.indexOf("Terminal"));
    expect(labels.indexOf("Archived Threads")).toBeLessThan(labels.indexOf("Agents"));
    expect(labels.indexOf("Provider Usage")).toBeGreaterThan(labels.indexOf("MCP Servers"));
    expect(labels.indexOf("Changelog")).toBeGreaterThan(labels.indexOf("Remote Environments"));
  });

  it("hides groups whose sections are all desktop-only on remote sessions", () => {
    bridgeState.remote = true;
    const { container } = render(<SettingsOverlay onClose={() => undefined} />);

    const headers = [...container.querySelectorAll("aside p")].map((el) => el.textContent);
    expect(headers).toEqual(["Personal", "Workspace", "Agents", "About"]);
    expect(screen.getByRole("button", { name: "Models" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Audio" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remote Access" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Browser" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archived Threads" }));
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("keeps WSL-only installed agents reachable from the sidebar", () => {
    statusesState.wslAgentStatuses = [
      makeStatus("gemini", {
        label: "Gemini",
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
    ];

    render(<SettingsOverlay onClose={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Agents" }));

    const geminiButton = screen.getByRole("button", { name: "Gemini" });
    expect(geminiButton).toBeInTheDocument();
    fireEvent.click(geminiButton);
    expect(screen.getByText("Agent gemini")).toBeInTheDocument();
  });

  it("nests agents subsections before installed agents", () => {
    statusesState.agentStatuses = [
      makeStatus("claude", {
        label: "Claude Code",
        envKind: "posix",
      }),
    ];

    render(<SettingsOverlay onClose={() => undefined} />);

    // Subsections are only visible once Agents is selected.
    expect(screen.queryByRole("button", { name: "Agent Registry" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Agents" }));

    const buttons = screen
      .getAllByRole("button")
      .map((button) => button.textContent)
      .filter(Boolean);
    expect(buttons.slice(buttons.indexOf("Agents") + 1, buttons.indexOf("Claude Code"))).toEqual([
      "General",
      "Agent Registry",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Agent Registry" }));
    expect(screen.getByText("Agent Registry Settings")).toBeInTheDocument();
  });

  it("groups Claude profile providers under Claude Code in the agents sidebar", () => {
    statusesState.agentStatuses = [
      makeStatus("claude", {
        label: "Claude Code",
        envKind: "posix",
      }),
      makeStatus("codex", {
        label: "Codex",
        envKind: "posix",
      }),
      makeStatus("claude:home", {
        label: "Claude Home",
        envKind: "posix",
      }),
    ];

    render(<SettingsOverlay onClose={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Agents" }));

    const buttons = screen
      .getAllByRole("button")
      .map((button) => button.textContent)
      .filter(Boolean);
    expect(buttons.slice(buttons.indexOf("Claude Code"), buttons.indexOf("Codex") + 1)).toEqual([
      "Claude Code",
      "Home",
      "Codex",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(screen.getByText("Agent claude:home")).toBeInTheDocument();
  });

  it("opens Agents on General and toggles closed on a second click", () => {
    statusesState.agentStatuses = [
      makeStatus("claude", {
        label: "Claude Code",
        envKind: "posix",
      }),
    ];

    render(<SettingsOverlay onClose={() => undefined} />);

    const agentsButton = screen.getByRole("button", { name: "Agents" });
    fireEvent.click(agentsButton);
    expect(
      within(screen.getByRole("main")).getByText("Agents General Settings"),
    ).toBeInTheDocument();

    fireEvent.click(agentsButton);
    expect(within(screen.getByRole("main")).getByText("General")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agent Registry" })).not.toBeInTheDocument();
  });

  it("routes split general sections from the sidebar", () => {
    render(<SettingsOverlay onClose={() => undefined} />);

    expect(screen.queryByRole("button", { name: "Schedules" })).not.toBeInTheDocument();

    for (const section of ["Appearance", "Terminal", "Threads", "Git", "Shortcuts"]) {
      fireEvent.click(screen.getByRole("button", { name: section }));
      expect(within(screen.getByRole("main")).getByText(section)).toBeInTheDocument();
    }
  });

  it("owns normal settings scrolling at the overlay level", () => {
    const { container } = render(<SettingsOverlay onClose={() => undefined} />);
    const firstScroller = container.querySelector<HTMLElement>("[data-settings-scroll-area]");
    expect(firstScroller).not.toBeNull();
    firstScroller!.scrollTop = 240;

    fireEvent.click(screen.getByRole("button", { name: "Provider Usage" }));

    const nextScroller = container.querySelector<HTMLElement>("[data-settings-scroll-area]");
    expect(nextScroller).not.toBeNull();
    expect(nextScroller).not.toBe(firstScroller);
    expect(nextScroller!.scrollTop).toBe(0);
    expect(within(screen.getByRole("main")).getByText("Provider Usage")).toBeInTheDocument();
  });

  it("marks agents that need attention in the sidebar", () => {
    statusesState.agentStatuses = [
      makeStatus("acp-generic:factory-droid", {
        label: "Factory Droid",
        authState: "missing",
        envKind: "windows",
      }),
    ];

    render(<SettingsOverlay onClose={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Agents" }));

    const factoryButton = screen.getByRole("button", { name: "Factory Droid" });
    expect(factoryButton.querySelector(".text-warning")).not.toBeNull();
  });

  it("keeps the refresh action out of the settings sidebar", () => {
    render(<SettingsOverlay onClose={() => undefined} />);
    expect(
      screen.queryByRole("button", { name: "Refresh detected agents" }),
    ).not.toBeInTheDocument();
  });

  it("searches across individual settings, not just sections", () => {
    render(<SettingsOverlay onClose={() => undefined} />);

    // "sleep" matches no section label, but a setting under General.
    fireEvent.change(screen.getByPlaceholderText("Search settings"), {
      target: { value: "sleep" },
    });

    expect(screen.getByText("Prevent system sleep")).toBeInTheDocument();
    // The section list is replaced — unrelated sections are gone.
    expect(screen.queryByRole("button", { name: "Audio" })).not.toBeInTheDocument();
  });

  it("surfaces the description snippet when only the description matches", () => {
    render(<SettingsOverlay onClose={() => undefined} />);

    fireEvent.change(screen.getByPlaceholderText("Search settings"), {
      target: { value: "awake" },
    });

    expect(
      screen.getByText(/Keep the system awake while any selected condition applies/),
    ).toBeInTheDocument();
  });

  it("navigates to the section when a setting result is clicked", () => {
    render(<SettingsOverlay onClose={() => undefined} />);

    fireEvent.change(screen.getByPlaceholderText("Search settings"), {
      target: { value: "sleep" },
    });
    fireEvent.click(screen.getByText("Prevent system sleep"));

    expect(within(screen.getByRole("main")).getByText("General")).toBeInTheDocument();
  });

  it("restores the section list when the query is cleared", () => {
    render(<SettingsOverlay onClose={() => undefined} />);
    const input = screen.getByPlaceholderText("Search settings");

    fireEvent.change(input, { target: { value: "sleep" } });
    expect(screen.queryByRole("button", { name: "Audio" })).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Audio" })).toBeInTheDocument();
  });

  it("exposes the remote machine selector and passes connectionKey for Skills, AI Helpers, and Import", () => {
    useRemoteServersStore.setState({
      servers: [
        {
          connectionId: "remote-mac",
          desktopId: "remote-mac",
          label: "Mac Studio",
          endpoint: "https://mac.example",
          accessToken: "tok",
          scopes: ["session:read", "session:operate", "projects:manage"],
          platform: "darwin",
        },
      ],
      runtime: {
        "remote-mac": {
          status: "online",
          projects: [],
          threads: [],
          agentStatuses: { windows: [], wsl: [], updatedAt: "2026-11-24T00:00:00.000Z" },
        },
      },
    });

    render(<SettingsOverlay onClose={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Skills" }));
    expect(screen.getByTestId("skills-host")).toHaveAttribute("data-skills-host", "local");
    fireEvent.click(
      within(screen.getByTestId("machine-select")).getByRole("button", { name: "Mac Studio" }),
    );
    expect(screen.getByTestId("skills-host")).toHaveAttribute("data-skills-host", "remote-mac");
    expect(screen.getByTestId("skills-host")).toHaveAttribute("data-skills-platform", "darwin");

    fireEvent.click(screen.getByRole("button", { name: "AI Helpers" }));
    expect(screen.getByTestId("ai-host")).toHaveAttribute("data-ai-host", "remote-mac");

    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.getByTestId("import-host")).toHaveAttribute("data-import-host", "remote-mac");
  });

  it("excludes WSL distros and remote machines without active projects from the Crews env selector", () => {
    const paired = (desktopId: string, label: string): RemoteServerRecord => ({
      connectionId: desktopId,
      desktopId,
      label,
      endpoint: `https://${desktopId}.example`,
      accessToken: "tok",
      scopes: ["session:read", "session:operate"],
      platform: "darwin",
    });
    const online: RemoteServerRuntime = {
      status: "online",
      projects: [],
      threads: [],
      agentStatuses: { windows: [], wsl: [], updatedAt: "2026-11-24T00:00:00.000Z" },
    };
    useWslDistroListStore.setState({
      distros: ["Ubuntu", "docker-desktop", "Debian"],
      loadedFor: "local",
    });
    useRemoteServersStore.setState({
      servers: [paired("mac", "MacBook"), paired("studio", "Studio")],
      runtime: { mac: online, studio: online },
    });
    appState.projects = [
      {
        id: "mac-project",
        name: "Mac project",
        createdAt: "2026-11-24T00:00:00.000Z",
        remoteServerId: "mac",
        location: { kind: "posix", path: "/Users/me/repo", remoteServerId: "mac" },
      },
      // Disabled WSL project must not add Ubuntu to the selector.
      {
        id: "ubuntu-disabled",
        name: "Ubuntu disabled",
        disabled: true,
        createdAt: "2026-11-24T00:00:00.000Z",
        location: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/me/repo",
          uncPath: "\\\\wsl$\\Ubuntu\\home\\me\\repo",
        },
      },
    ];

    render(<SettingsOverlay onClose={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Crews" }));
    const select = screen.getByTestId("machine-select");
    const labels = within(select)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(labels).toEqual(["Local", "MacBook"]);

    fireEvent.click(within(select).getByRole("button", { name: "MacBook" }));
    expect(screen.getByTestId("crews-host")).toHaveAttribute("data-crews-machine", "remote:mac");
  });

  it("hides the Crews env selector when no non-local environment has an active project", () => {
    useWslDistroListStore.setState({
      distros: ["Ubuntu", "docker-desktop"],
      loadedFor: "local",
    });

    render(<SettingsOverlay onClose={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Crews" }));
    expect(screen.getByTestId("crews-host")).toHaveAttribute("data-crews-machine", "local");
    expect(screen.queryByTestId("machine-select")).not.toBeInTheDocument();
  });
});
