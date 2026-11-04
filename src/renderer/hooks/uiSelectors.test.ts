import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { dockPanelTab } from "@/renderer/actions/panelActions";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { EMPTY_BOTTOM_PANEL_DOCKS, usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { AgentStatus, BackgroundTask, Project, Thread } from "@/shared/contracts";
import {
  selectThreadIsWaitingForBackground,
  useIsProjectGitPanelActive,
  useIsProjectTerminalActive,
  useIsWorktreeFilesPanelActive,
  useIsWorktreeGitPanelActive,
  useDraftEnvironment,
  useIsWorktreeTerminalActive,
  useThreadAgentStatuses,
} from "./uiSelectors";

const worktreePath = "/repo/.poracode/worktrees/feature";

beforeEach(() => {
  useSharedSettings.setState({ terminalPosition: "bottom" });
  usePanelStore.setState({
    rightPanelTab: "usage",
    rightPanelSplit: null,
    bottomPanelDocks: EMPTY_BOTTOM_PANEL_DOCKS,
    gitReviewContext: null,
    gitReviewAsPanel: false,
    filesPanelContext: null,
    usagePanelOpen: true,
  });
  useDevTerminalStore.setState({
    isOpen: false,
    source: "project",
    activeProjectId: null,
    activeWorktreePath: null,
  });
  useAgentStatusesStore.setState({ agentStatuses: [], wslAgentStatuses: [] });
});

const agent = (kind: string, envKind: "windows" | "wsl", envDistro?: string): AgentStatus => ({
  kind,
  label: kind,
  installed: true,
  authState: "authenticated",
  envKind,
  ...(envDistro ? { envDistro } : {}),
  capabilities: {
    models: [],
    efforts: [],
    modelEfforts: {},
    modes: [],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "gui",
    settingDefs: [],
  },
});

function openGitPanel(scope: { projectId: string; worktreePath?: string }) {
  usePanelStore.setState({
    gitReviewContext: scope,
    gitReviewAsPanel: true,
  });
}

function openFilesPanel() {
  usePanelStore.setState({
    filesPanelContext: {
      projectId: "project-a",
      projectName: "Project A",
      worktreePath,
      rootLabel: "feature",
    },
  });
}

describe("sidebar panel-active selectors", () => {
  it("marks a git panel docked into the right-panel split as active", () => {
    openGitPanel({ projectId: "project-a", worktreePath });

    const eclipsed = renderHook(() => useIsWorktreeGitPanelActive(worktreePath));
    expect(eclipsed.result.current).toBe(false);

    usePanelStore.setState({ rightPanelSplit: { tab: "git", placement: "top" } });
    const split = renderHook(() => useIsWorktreeGitPanelActive(worktreePath));
    expect(split.result.current).toBe(true);
  });

  it("marks a bottom-docked git panel as active", () => {
    openGitPanel({ projectId: "project-a" });
    usePanelStore.setState({ bottomPanelDocks: { left: "git", right: null } });

    const { result } = renderHook(() => useIsProjectGitPanelActive("project-a"));
    expect(result.current).toBe(true);
  });

  it("ignores bottom docks while the terminal owns the right edge", () => {
    useSharedSettings.setState({ terminalPosition: "right" });
    openGitPanel({ projectId: "project-a" });
    usePanelStore.setState({ bottomPanelDocks: { left: "git", right: null } });

    const { result } = renderHook(() => useIsProjectGitPanelActive("project-a"));
    expect(result.current).toBe(false);
  });

  it("marks a split files panel as active without owning the active tab", () => {
    openFilesPanel();

    const eclipsed = renderHook(() => useIsWorktreeFilesPanelActive(worktreePath));
    expect(eclipsed.result.current).toBe(false);

    usePanelStore.setState({ rightPanelSplit: { tab: "files", placement: "bottom" } });
    const split = renderHook(() => useIsWorktreeFilesPanelActive(worktreePath));
    expect(split.result.current).toBe(true);
  });

  it("marks a bottom-docked files panel as active", () => {
    openFilesPanel();
    usePanelStore.setState({ bottomPanelDocks: { left: null, right: "files" } });

    const { result } = renderHook(() => useIsWorktreeFilesPanelActive(worktreePath));
    expect(result.current).toBe(true);
  });

  it("marks a split terminal as active with the terminal on the right edge", () => {
    useSharedSettings.setState({ terminalPosition: "right" });
    useDevTerminalStore.setState({
      isOpen: true,
      activeProjectId: "project-a",
      activeWorktreePath: worktreePath,
    });

    const eclipsed = renderHook(() => useIsWorktreeTerminalActive(worktreePath));
    expect(eclipsed.result.current).toBe(false);

    usePanelStore.setState({ rightPanelSplit: { tab: "terminal", placement: "top" } });
    const split = renderHook(() => useIsWorktreeTerminalActive(worktreePath));
    expect(split.result.current).toBe(true);
  });

  it("refuses to dock the terminal into the bottom row it already owns", () => {
    useDevTerminalStore.setState({
      isOpen: true,
      activeProjectId: "project-a",
      activeWorktreePath: worktreePath,
    });

    dockPanelTab("terminal", { zone: "bottom-panel", placement: "left" });
    expect(usePanelStore.getState().bottomPanelDocks).toEqual(EMPTY_BOTTOM_PANEL_DOCKS);
  });

  it.each([null, worktreePath])(
    "does not highlight the saved terminal scope while the global terminal is active (%s)",
    (activeWorktreePath) => {
      useDevTerminalStore.setState({
        isOpen: true,
        activeProjectId: "project-a",
        activeWorktreePath,
      });
      const { result } = renderHook(() => ({
        project: useIsProjectTerminalActive("project-a"),
        worktree: useIsWorktreeTerminalActive(worktreePath),
      }));
      expect(result.current).toEqual({
        project: activeWorktreePath === null,
        worktree: activeWorktreePath !== null,
      });

      act(() => useDevTerminalStore.getState().openGlobalPanel());
      expect(result.current).toEqual({ project: false, worktree: false });
    },
  );
});

describe("thread agent statuses", () => {
  it("uses the matching WSL distro inventory for a local WSL thread", () => {
    useAgentStatusesStore.setState({
      agentStatuses: [agent("windows-only", "windows")],
      wslAgentStatuses: [
        agent("ubuntu-agent", "wsl", "Ubuntu"),
        agent("debian-agent", "wsl", "Debian"),
      ],
    });

    const { result } = renderHook(() =>
      useThreadAgentStatuses({
        remoteServerId: undefined,
        projectLocation: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/repo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
        },
      }),
    );

    expect(result.current.map((status) => status.kind)).toEqual(["ubuntu-agent"]);
  });
});

describe("host-keyed agent statuses", () => {
  const originalRuntime = useRemoteServersStore.getState().runtime;
  const wslLocation = {
    kind: "wsl",
    distro: "Ubuntu",
    linuxPath: "/repo",
    uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
  } as const;

  function seedPairedHost(status: "online" | "connecting" = "online") {
    useRemoteServersStore.setState({
      runtime: {
        studio: {
          status,
          projects: [],
          threads: [],
          agentStatuses: {
            windows: [
              agent("host-native", "windows"),
              { ...agent("host-missing", "windows"), installed: false },
            ],
            wsl: [agent("host-ubuntu", "wsl", "Ubuntu"), agent("host-debian", "wsl", "Debian")],
            updatedAt: "2026-11-04T00:00:00.000Z",
          },
        },
      },
    });
  }

  beforeEach(() => {
    useRemoteServersStore.setState({ runtime: originalRuntime });
    useAgentStatusesStore.setState({
      agentStatuses: [agent("local-native", "windows")],
      wslAgentStatuses: [],
      windowsLoaded: true,
      wslLoaded: true,
    });
  });

  it("offers a paired host's installed agents for its WSL distro to a remote thread", () => {
    seedPairedHost();
    const { result } = renderHook(() =>
      useThreadAgentStatuses({ remoteServerId: "studio", projectLocation: wslLocation }),
    );
    expect(result.current.map((status) => status.kind)).toEqual(["host-ubuntu"]);
  });

  it("lists the managed host's agents, uninstalled included, in a local draft", () => {
    const project = {
      id: "p1",
      name: "Local",
      location: { kind: "windows", path: "C:/repo" },
      createdAt: "2026-11-04",
    } satisfies Project;
    const { result } = renderHook(() => useDraftEnvironment(project));
    expect(result.current.agentStatuses.map((status) => status.kind)).toEqual(["local-native"]);
    expect(result.current.isDetectingAgents).toBe(false);
    expect(result.current.pickFiles).toBeUndefined();
  });

  it("lists a paired host's installed agents and its connection state in a mirrored draft", () => {
    seedPairedHost("connecting");
    const project = {
      id: "remote:studio:project:p1",
      name: "Hosted",
      location: { kind: "windows", path: "C:/hosted" },
      remoteServerId: "studio",
      remoteId: "p1",
      createdAt: "2026-11-04",
    } satisfies Project;
    const { result } = renderHook(() => useDraftEnvironment(project));
    expect(result.current.agentStatuses.map((status) => status.kind)).toEqual(["host-native"]);
    expect(result.current.isDetectingAgents).toBe(true);
    expect(result.current.pickFiles).toBeTypeOf("function");
  });
});

describe("selectThreadIsWaitingForBackground", () => {
  const task: BackgroundTask = { taskId: "monitor", kind: "other", description: "Watch logs" };
  const state = (openTurn: boolean | undefined, tasks: BackgroundTask[] = [task]) => ({
    runtimeOpenTurnByThread: openTurn === undefined ? {} : { t1: openTurn },
    runtimeBackgroundTasksByThread: { t1: tasks },
  });
  const thread = (
    status: Thread["status"],
    attention: Thread["attention"] = "none",
  ): Pick<Thread, "id" | "status" | "attention"> => ({ id: "t1", status, attention });

  it("waits while the provider holds a closed turn working for listed tasks", () => {
    expect(selectThreadIsWaitingForBackground(state(false), thread("working"), false)).toBe(true);
  });

  it("does not treat a lingering task kind on a settled thread as waiting", () => {
    for (const status of ["idle", "finished"] as const) {
      expect(selectThreadIsWaitingForBackground(state(false), thread(status), false)).toBe(false);
    }
  });

  it("keeps pending foreground input out of the waiting state", () => {
    expect(selectThreadIsWaitingForBackground(state(false), thread("working"), true, true)).toBe(
      false,
    );
  });

  it("waits on known native-agent or workflow activity after the turn closed", () => {
    for (const status of ["working", "idle", "finished"] as const) {
      expect(selectThreadIsWaitingForBackground(state(false, []), thread(status), true)).toBe(true);
    }
  });

  it("never masks an open turn, attention, errors or inactive threads", () => {
    expect(selectThreadIsWaitingForBackground(state(true), thread("working"), true)).toBe(false);
    expect(selectThreadIsWaitingForBackground(state(undefined), thread("working"), true)).toBe(
      false,
    );
    for (const status of ["error", "inactive", "needs_reply", "needs_approval"] as const) {
      expect(selectThreadIsWaitingForBackground(state(false), thread(status), true)).toBe(false);
    }
    for (const attention of ["needs_reply", "needs_approval", "error"] as const) {
      expect(
        selectThreadIsWaitingForBackground(state(false), thread("working", attention), true),
      ).toBe(false);
    }
    expect(selectThreadIsWaitingForBackground(state(false), undefined, true)).toBe(false);
  });
});
