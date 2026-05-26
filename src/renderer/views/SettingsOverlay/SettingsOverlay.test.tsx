import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  GeneralSettings: () => <div>General</div>,
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

vi.mock("./parts/SearchSettings", () => ({
  SearchSettings: () => <div>Search</div>,
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

    expect(screen.getByRole("button", { name: "Gemini" })).toBeInTheDocument();
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

    render(<SettingsOverlay onClose={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Refresh detected agents" }));

    expect(beginFirstLaunchDiscoveryMock).toHaveBeenCalledWith({
      kind: "all",
      wslDistros: ["Ubuntu"],
    });
    expect(resetDiscoveredAgentsMock).not.toHaveBeenCalled();
    expect(refreshAgentStatusesMock).toHaveBeenCalledWith(["Ubuntu"]);
    expect(screen.getByText("Discovering coding agents…")).toBeInTheDocument();

    resolveRefresh?.();

    await waitFor(
      () => {
        expect(screen.queryByText("Discovering coding agents…")).not.toBeInTheDocument();
      },
      { timeout: 2500 },
    );
    expect(resetDiscoveredAgentsMock).toHaveBeenCalledTimes(1);
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
});
