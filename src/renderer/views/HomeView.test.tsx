import { fireEvent, screen } from "@testing-library/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { beforeEach, describe, expect, it } from "vitest";
import type { AgentStatus, Project, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { HomeView } from "./HomeView";

describe("HomeView", () => {
  beforeEach(() => {
    localStorage.clear();
    useSharedSettings.setState({ homeScopeEnabled: true });
    useAppStore.setState((state) => ({
      ...state,
      projects: [makeProject()],
      threads: [],
      view: { kind: "home" },
    }));
    useAgentStatusesStore.setState({
      agentStatuses: [],
      wslAgentStatuses: [],
      windowsLoaded: false,
      wslLoaded: false,
      inFirstLaunchDiscovery: false,
      discoveryScope: undefined,
      discoveredAgents: [],
    });
    useRemoteServersStore.setState({ servers: [], runtime: {} });
  });

  it("does not show archived threads in recent threads", () => {
    useAppStore.setState({
      threads: [
        makeThread({ id: "active", title: "Keep me visible", archived: false }),
        makeThread({ id: "archived", title: "Archived thread", archived: true }),
      ],
    });

    render(<HomeView />);

    expect(screen.getByText("Keep me visible")).toBeInTheDocument();
    expect(screen.queryByText("Archived thread")).not.toBeInTheDocument();
  });

  it("uses the installed ACP agent icon in recent threads", () => {
    useAgentStatusesStore.setState({
      agentStatuses: [
        makeAgentStatus({
          kind: "acp-generic:factory-droid",
          label: "Factory Droid",
          icon: "https://example.com/factory-droid.svg",
        }),
      ],
    });
    useAppStore.setState({
      threads: [
        makeThread({
          title: "ACP thread",
          agentKind: "acp-generic:factory-droid",
        }),
      ],
    });

    const { container } = render(<HomeView />);

    expect(screen.getByText("ACP thread")).toBeInTheDocument();
    expect(container.querySelector(".poracode-provider-icon--external")).toBeInTheDocument();
    expect(container.querySelector(".poracode-provider-icon__generic")).not.toBeInTheDocument();
  });

  it("filters recent threads to the selected workspace and clears on second click", () => {
    useAppStore.setState({
      projects: [makeProject(), makeProject({ id: "project-2", name: "side-app" })],
      threads: [
        makeThread({ id: "t1", title: "First project thread", projectId: "project-1" }),
        makeThread({ id: "t2", title: "Second project thread", projectId: "project-2" }),
      ],
    });

    render(<HomeView />);

    expect(screen.getByText("First project thread")).toBeInTheDocument();
    expect(screen.getByText("Second project thread")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "side-app" }));

    expect(screen.queryByText("First project thread")).not.toBeInTheDocument();
    expect(screen.getByText("Second project thread")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "side-app" }));

    expect(screen.getByText("First project thread")).toBeInTheDocument();
    expect(screen.getByText("Second project thread")).toBeInTheDocument();
  });

  it("opens a draft from the workspace row's new-thread button", () => {
    render(<HomeView />);

    fireEvent.click(screen.getByRole("button", { name: "New thread in todo-app" }));

    expect(useAppStore.getState().view).toEqual({ kind: "draft", projectId: "project-1" });
  });

  it("marks WSL and remote workspaces and their thread tags", () => {
    useRemoteServersStore.setState({
      servers: [{ desktopId: "desktop-1", label: "Poracode on MacBook 16" }],
      runtime: {},
    } as never);
    useAppStore.setState({
      projects: [
        makeProject({
          id: "wsl-1",
          name: "Ubuntu Repo",
          location: {
            kind: "wsl",
            distro: "Ubuntu",
            linuxPath: "/home/me/repo",
            uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
          },
        }),
        makeProject({
          id: "remote-1",
          name: "Mac Repo",
          location: { kind: "posix", path: "/repo", remoteServerId: "desktop-1" },
        }),
      ],
      threads: [
        makeThread({ id: "w1", title: "WSL thread", projectId: "wsl-1" }),
        makeThread({ id: "r1", title: "Remote thread", projectId: "remote-1" }),
      ],
    });

    render(<HomeView />);

    // Only the workspace select buttons carry aria-pressed.
    const workspaceRows = screen.getAllByRole("button", { pressed: false });
    const wslRow = workspaceRows.find((row) => row.textContent?.includes("Ubuntu Repo"));
    expect(wslRow).toHaveTextContent("WSL");
    const remoteRow = workspaceRows.find((row) => row.textContent?.includes("Mac Repo"));
    expect(remoteRow).toHaveTextContent("MacBook 16");

    const wslThread = screen.getByText("WSL thread").closest("button");
    expect(wslThread).toHaveTextContent("WSL");
    const remoteThread = screen.getByText("Remote thread").closest("button");
    expect(remoteThread).toHaveTextContent("MacBook 16");
  });
});

function makeProject(overrides?: Partial<Project>): Project {
  return {
    id: "project-1",
    name: "todo-app",
    location: { kind: "windows", path: "C:\\repo" },
    createdAt: "2026-05-26T00:00:00.000Z",
    ...overrides,
  };
}

function makeThread(overrides: Partial<Thread>): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Thread",
    agentKind: "codex",
    config: { model: "gpt-5" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z",
    ...overrides,
  };
}

function makeAgentStatus(overrides: Partial<AgentStatus>): AgentStatus {
  return {
    kind: "codex",
    label: "Codex",
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [{ id: "gpt-5", label: "GPT-5" }],
      efforts: [],
      modelEfforts: {},
      modes: ["agent"],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      settingDefs: [],
    },
    ...overrides,
  };
}
