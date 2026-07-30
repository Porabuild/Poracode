import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Project } from "@/shared/contracts";

const statusesState = {
  agentStatuses: [] as AgentStatus[],
  wslAgentStatuses: [] as AgentStatus[],
};

const resetDiscoveredAgentsMock = vi.fn<() => void>();
const beginFirstLaunchDiscoveryMock = vi.fn<(scope?: unknown) => void>();
const refreshAgentStatusesMock = vi.fn<(wslDistros?: string[]) => Promise<void>>();

const appState = {
  projects: [] as Project[],
};

vi.mock("@/renderer/state/agentStatusesStore", () => {
  const useAgentStatusesStore = (
    selector: (state: {
      agentStatuses: AgentStatus[];
      wslAgentStatuses: AgentStatus[];
      beginFirstLaunchDiscovery: (scope?: unknown) => void;
      resetDiscoveredAgents: () => void;
    }) => unknown,
  ) =>
    selector({
      ...statusesState,
      beginFirstLaunchDiscovery: beginFirstLaunchDiscoveryMock,
      resetDiscoveredAgents: resetDiscoveredAgentsMock,
    });
  useAgentStatusesStore.getState = () => ({
    beginFirstLaunchDiscovery: beginFirstLaunchDiscoveryMock,
    resetDiscoveredAgents: resetDiscoveredAgentsMock,
  });
  return { useAgentStatusesStore };
});

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: (selector: (state: typeof appState) => unknown) => selector(appState),
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: { disabledAgents: string[] }) => unknown) =>
    selector({ disabledAgents: [] }),
}));

vi.mock("@/renderer/components/layout/PageLayout", () => ({
  PageLayout: (props: { sidebar: ReactNode; content: ReactNode }) => (
    <div>
      <aside>{props.sidebar}</aside>
      <main>{props.content}</main>
    </div>
  ),
}));

vi.mock("@/renderer/components/common", () => ({
  PixelLoader: () => <span />,
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
  isRemoteSession: () => false,
  isWindows: () => false,
  readBridge: () => ({
    refreshAgentStatuses: refreshAgentStatusesMock,
  }),
}));

vi.mock("@/renderer/components/thread/AgentDiscoveryScreen", () => ({
  AgentDiscoveryScreen: (props: { onCancel?: () => void }) => (
    <div>
      Discovering coding agents…
      {props.onCancel ? (
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock("./parts/GeneralSettings", () => ({
  GeneralSettings: () => <div data-settings-anchor="general.language">General</div>,
}));

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
  AISettings: () => <div>AI</div>,
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
  UsageSettings: () => <div>Usage</div>,
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

import { SettingsOverlay } from "./SettingsOverlay";
import { usePanelStore } from "@/renderer/state/panelStore";

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
  beforeEach(() => {
    statusesState.agentStatuses = [];
    statusesState.wslAgentStatuses = [];
    appState.projects = [];
    beginFirstLaunchDiscoveryMock.mockReset();
    resetDiscoveredAgentsMock.mockReset();
    refreshAgentStatusesMock.mockReset();
    refreshAgentStatusesMock.mockResolvedValue(undefined);
    usePanelStore.setState({
      settingsOpen: false,
      settingsSection: null,
      settingsAnchor: null,
    });
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

    fireEvent.click(screen.getByRole("button", { name: "Usage" }));

    const nextScroller = container.querySelector<HTMLElement>("[data-settings-scroll-area]");
    expect(nextScroller).not.toBeNull();
    expect(nextScroller).not.toBe(firstScroller);
    expect(nextScroller!.scrollTop).toBe(0);
    expect(within(screen.getByRole("main")).getByText("Usage")).toBeInTheDocument();
  });

  it("scrolls to an initially requested setting anchor", async () => {
    const scrollIntoView = vi.fn<(options?: ScrollIntoViewOptions | boolean) => void>();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    usePanelStore.getState().openSettingsSection("general", "general.language");

    render(<SettingsOverlay onClose={() => undefined} />);

    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" }),
    );
    expect(within(screen.getByRole("main")).getByText("General")).toHaveClass(
      "poracode-setting-highlight",
    );
    expect(usePanelStore.getState().settingsSection).toBeNull();
    expect(usePanelStore.getState().settingsAnchor).toBeNull();
  });

  it("scrolls to a setting anchor requested while the overlay is open", async () => {
    const scrollIntoView = vi.fn<(options?: ScrollIntoViewOptions | boolean) => void>();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    render(<SettingsOverlay onClose={() => undefined} />);

    act(() => {
      usePanelStore.getState().openSettingsSection("appearance", "appearance.mode");
    });

    expect(within(screen.getByRole("main")).getByText("Appearance")).toBeInTheDocument();
    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" }),
    );
    expect(within(screen.getByRole("main")).getByText("Appearance")).toHaveClass(
      "poracode-setting-highlight",
    );
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

  it("refreshes agent probing from the agents sidebar and shows the discovery overlay", async () => {
    vi.useFakeTimers();
    statusesState.agentStatuses = [
      makeStatus("claude", {
        label: "Claude Code",
        envKind: "posix",
      }),
    ];
    appState.projects = [
      {
        id: "project-1",
        name: "demo",
        disabled: false,
        createdAt: new Date(0).toISOString(),
        location: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/demo/project",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
        },
      },
    ];

    let resolveRefresh: (() => void) | undefined;
    refreshAgentStatusesMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    try {
      render(<SettingsOverlay onClose={() => undefined} />);

      fireEvent.click(screen.getByRole("button", { name: "Refresh detected agents" }));

      expect(beginFirstLaunchDiscoveryMock).toHaveBeenCalledWith({
        kind: "all",
        wslDistros: ["Ubuntu"],
      });
      expect(resetDiscoveredAgentsMock).not.toHaveBeenCalled();
      expect(refreshAgentStatusesMock).toHaveBeenCalledWith(["Ubuntu"]);
      expect(screen.getByText("Discovering coding agents…")).toBeInTheDocument();

      await act(async () => {
        resolveRefresh?.();
        await vi.advanceTimersByTimeAsync(0);
      });

      await act(() => vi.advanceTimersByTimeAsync(999));
      expect(screen.getByText("Discovering coding agents…")).toBeInTheDocument();
      expect(resetDiscoveredAgentsMock).not.toHaveBeenCalled();

      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(screen.queryByText("Discovering coding agents…")).not.toBeInTheDocument();
      expect(resetDiscoveredAgentsMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels the visible agent refresh overlay", () => {
    refreshAgentStatusesMock.mockReturnValueOnce(new Promise<void>(() => undefined));

    render(<SettingsOverlay onClose={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Refresh detected agents" }));
    expect(screen.getByText("Discovering coding agents…")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Discovering coding agents…")).not.toBeInTheDocument();
    expect(resetDiscoveredAgentsMock).toHaveBeenCalledTimes(1);
  });

  it("searches across individual settings, not just sections", () => {
    render(<SettingsOverlay onClose={() => undefined} />);

    // "sleep" matches no section label, but a setting under General.
    fireEvent.change(screen.getByPlaceholderText("Search settings"), {
      target: { value: "sleep" },
    });

    expect(screen.getByText("Prevent sleep while working")).toBeInTheDocument();
    // The section list is replaced — unrelated sections are gone.
    expect(screen.queryByRole("button", { name: "Audio" })).not.toBeInTheDocument();
  });

  it("surfaces the description snippet when only the description matches", () => {
    render(<SettingsOverlay onClose={() => undefined} />);

    fireEvent.change(screen.getByPlaceholderText("Search settings"), {
      target: { value: "awake" },
    });

    expect(
      screen.getByText("Keep the system awake while any thread is actively working."),
    ).toBeInTheDocument();
  });

  it("navigates to the section when a setting result is clicked", () => {
    render(<SettingsOverlay onClose={() => undefined} />);

    fireEvent.change(screen.getByPlaceholderText("Search settings"), {
      target: { value: "sleep" },
    });
    fireEvent.click(screen.getByText("Prevent sleep while working"));

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
