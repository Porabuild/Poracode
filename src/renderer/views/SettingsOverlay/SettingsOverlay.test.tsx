import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Project } from "@/shared/contracts";
import type { PoracodeBridge } from "@/shared/ipc";
import { installBrowserClientRuntime, resetClientRuntimeForTest } from "@/renderer/clientRuntime";
import { resetAdaptiveLayoutForTest } from "@/renderer/adaptiveLayout";

const statusesState = {
  agentStatuses: [] as AgentStatus[],
  wslAgentStatuses: [] as AgentStatus[],
  inFirstLaunchDiscovery: false,
};

const refreshAgentDiscoveryMock = vi.fn<(distros: string[]) => void>();
vi.mock("@/renderer/actions/agentDiscoveryActions", () => ({
  refreshAgentDiscovery: (distros: string[]) => refreshAgentDiscoveryMock(distros),
}));

const appState = {
  projects: [] as Project[],
  openSchedules: vi.fn<() => void>(),
};

const bridgeState = {
  remote: false,
};

vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: (selector: (state: typeof statusesState) => unknown) =>
    selector(statusesState),
}));

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: (selector: (state: typeof appState) => unknown) => selector(appState),
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: { disabledAgents: string[] }) => unknown) =>
    selector({ disabledAgents: [] }),
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
  PixelLoader: () => <span />,
  TuxIcon: () => <span />,
  Select: () => <span data-testid="machine-select" />,
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
  }),
}));

vi.mock("./parts/GeneralSettings", () => ({
  GeneralSettings: () => <div data-settings-anchor="general.language">General</div>,
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
  AISettings: () => <div>AI Helpers</div>,
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
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
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
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    useSettingsHostStore.setState({ desktopId: null });
    __resetBrowserBridgeForTest();
    refreshAgentDiscoveryMock.mockReset();
    usePanelStore.setState({ settingsSection: null, settingsAnchor: null });
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
      "AgentsEnabled agents, model visibility and order",
      "CrewsSaved crews for the model picker",
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

    render(<SettingsOverlay onClose={() => undefined} />);
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

  it("starts app-owned discovery with the project WSL environments", () => {
    appState.projects = [
      {
        id: "project-1",
        name: "demo",
        disabled: false,
        createdAt: new Date(0).toISOString(),
        location: { kind: "wsl", distro: "Ubuntu", linuxPath: "/home/demo/project", uncPath: "" },
      },
    ];
    render(<SettingsOverlay onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh detected agents" }));
    expect(refreshAgentDiscoveryMock).toHaveBeenCalledExactlyOnceWith(["Ubuntu"]);
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
      screen.getByText(/Keep the system awake while any agent is working/),
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
});
