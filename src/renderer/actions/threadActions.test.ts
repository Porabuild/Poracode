import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import type { Project, RemoteThreadCommand, Thread, Workspace } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useWorkspaceStore } from "@/renderer/state/workspaceStore";
import { useWorktreeDeleteStore } from "@/renderer/state/worktreeDeleteStore";
import {
  archiveThread,
  deleteThread,
  openNewThread,
  openThread,
  reopenPaneThreadsIfInactive,
  reopenStoredThread,
  setThreadRuntimeReopenEnabled,
  switchToAdjacentThread,
  toggleMarkThreadDone,
  toggleStarThread,
  unloadStoredThread,
} from "./threadActions";

const { bridge } = vi.hoisted(() => ({
  bridge: {
    closeThread: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    appendUsageEvents: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  },
}));
const { hasHydratedThreadRuntimeItems, hydrateThreadRuntimeItems } = vi.hoisted(() => ({
  hasHydratedThreadRuntimeItems: vi.fn<(threadId: string) => boolean>().mockReturnValue(false),
  hydrateThreadRuntimeItems: vi.fn<(threadId: string) => Promise<void>>().mockResolvedValue(),
}));
const { deleteWorktreeGroup } = vi.hoisted(() => ({
  deleteWorktreeGroup:
    vi.fn<(projectId: string, worktreePath: string, threadIds: string[]) => void>(),
}));
const { refreshServer, sendThreadCommand, toast } = vi.hoisted(() => ({
  refreshServer: vi.fn<(desktopId: string) => Promise<void>>(),
  sendThreadCommand: vi.fn<(desktopId: string, command: RemoteThreadCommand) => Promise<void>>(),
  toast: { danger: vi.fn<(message: string) => void>() },
}));

vi.mock("@heroui/react", () => ({ toast }));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("@/renderer/actions/worktreeActions", () => ({
  deleteWorktreeGroup,
}));

vi.mock("@/renderer/state/chatRuntimePersister", () => ({
  hasHydratedThreadRuntimeItems,
  hydrateThreadRuntimeItems,
}));

describe("threadActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setThreadRuntimeReopenEnabled(true);
    localStorage.clear();
    hasHydratedThreadRuntimeItems.mockReturnValue(false);
    hydrateThreadRuntimeItems.mockResolvedValue(undefined);
    deleteWorktreeGroup.mockReset();
    refreshServer.mockReset().mockResolvedValue(undefined);
    sendThreadCommand.mockReset().mockResolvedValue(undefined);
    toast.danger.mockReset();
    useRemoteServersStore.setState({ refreshServer, sendThreadCommand });
    useAppStore.setState((state) => ({
      ...state,
      projects: [],
      threads: [],
      view: { kind: "home" },
      pendingActiveThreadId: null,
      pendingComposerFocusThreadId: null,
      pendingThreadLaunches: {},
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeCompletedTurnsByThread: {},
    }));
    useDevTerminalStore.setState({
      isOpen: false,
      activeProjectId: null,
      activeWorktreePath: null,
      tabs: [],
      activeTabId: null,
      focusRequestId: 0,
      tabActivity: {},
    });
    useWorktreeDeleteStore.setState({ dialog: null });
    useSharedSettings.setState({
      homeScopeEnabled: false,
      newThreadMode: "page",
      workspaces: [],
    });
    useWorkspaceStore.setState({ activeWorkspaceId: null, lastProjectIdByWorkspace: {} });
  });

  it("does not restart an inactive thread before startup snapshots reconcile", async () => {
    const thread = makeThread({ status: "inactive" });
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));
    setThreadRuntimeReopenEnabled(false);

    openThread(thread.id);

    await waitFor(() => {
      expect(useAppStore.getState().view).toEqual({ kind: "thread", panes: [thread.id] });
    });
    expect(useAppStore.getState().pendingThreadLaunches[thread.id]).toBeUndefined();

    setThreadRuntimeReopenEnabled(true);
    reopenPaneThreadsIfInactive();
    expect(useAppStore.getState().pendingThreadLaunches[thread.id]).toBeDefined();
  });

  it("discards the replaced draft when starting a sidebar draft for another project", () => {
    const firstProject = useAppStore.getState().addProject({ kind: "posix", path: "/repo-a" });
    const secondProject = useAppStore.getState().addProject({ kind: "posix", path: "/repo-b" });
    useAppStore.setState((state) => ({
      ...state,
      view: { kind: "draft", projectId: firstProject.id },
      draftContents: {
        [firstProject.id]: {
          segments: [{ kind: "text", content: "old draft" }],
          attachments: [],
        },
      },
      draftContentDiscardRequests: {},
    }));

    openNewThread(secondProject.id);

    expect(useAppStore.getState().view).toEqual({
      kind: "draft",
      projectId: secondProject.id,
    });
    expect(useAppStore.getState().draftContents[firstProject.id]).toBeUndefined();
    expect(useAppStore.getState().consumeDraftContentDiscard(firstProject.id)).toBe(true);
  });

  it("keeps visible draft panes when starting a sidebar draft as a panel", () => {
    useSharedSettings.setState({ newThreadMode: "panel" });
    const firstProject = useAppStore.getState().addProject({ kind: "posix", path: "/repo-a" });
    const secondProject = useAppStore.getState().addProject({ kind: "posix", path: "/repo-b" });
    const thread = makeThread({ id: "thread-visible", projectId: firstProject.id });
    const draftPaneId = `draft:${firstProject.id}`;
    useAppStore.setState((state) => ({
      ...state,
      threads: [thread],
      view: { kind: "thread", panes: [thread.id, draftPaneId] },
      draftContentDiscardRequests: {},
    }));

    openNewThread(secondProject.id);

    const view = useAppStore.getState().view;
    expect(view.kind).toBe("thread");
    expect(view.kind === "thread" && view.panes).toContain(draftPaneId);
    expect(useAppStore.getState().draftContentDiscardRequests[firstProject.id]).toBeUndefined();
  });

  it("starts an untargeted new thread in the active workspace's last project", async () => {
    const { alpha } = configureTwoWorkspaceProjects();
    useWorkspaceStore.setState({
      activeWorkspaceId: "workspace-alpha",
      lastProjectIdByWorkspace: { "workspace-alpha": alpha.id },
    });

    openNewThread();

    await waitFor(() => {
      expect(useAppStore.getState().view).toEqual({ kind: "draft", projectId: alpha.id });
    });
  });

  it("ignores a remembered project that the active workspace hides", async () => {
    const { alpha, beta } = configureTwoWorkspaceProjects();
    // Remembered while another workspace was active: the fresh draft must land
    // in a project this workspace actually shows.
    useWorkspaceStore.setState({
      activeWorkspaceId: "workspace-beta",
      lastProjectIdByWorkspace: { "workspace-beta": alpha.id },
    });

    openNewThread();

    await waitFor(() => {
      expect(useAppStore.getState().view).toEqual({ kind: "draft", projectId: beta.id });
    });
  });

  it("leaves the on-screen project behind when it belongs to another workspace", async () => {
    const { alpha, beta } = configureTwoWorkspaceProjects();
    useWorkspaceStore.setState({ activeWorkspaceId: "workspace-beta" });
    useAppStore.setState((state) => ({ ...state, view: { kind: "draft", projectId: alpha.id } }));

    openNewThread();

    await waitFor(() => {
      expect(useAppStore.getState().view).toEqual({ kind: "draft", projectId: beta.id });
    });
  });

  it("hydrates a persisted GUI thread before opening the pane", async () => {
    let resolveHydration: () => void = () => undefined;
    const hydration = new Promise<void>((resolve) => {
      resolveHydration = resolve;
    });
    hydrateThreadRuntimeItems.mockReturnValueOnce(hydration);
    const thread = makeThread({ presentationMode: "gui", status: "idle" });
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));

    openThread(thread.id);

    expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id);
    expect(useAppStore.getState().view).toEqual({ kind: "home" });

    resolveHydration();
    await hydration;
    await Promise.resolve();
    await Promise.resolve();

    expect(useAppStore.getState().view).toEqual({
      kind: "thread",
      panes: [thread.id],
    });
    expect(useAppStore.getState().pendingComposerFocusThreadId).toBe(thread.id);
  });

  it("allows a thread open to opt out of composer focus", async () => {
    const thread = makeThread({ status: "idle" });
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));

    openThread(thread.id, { focusComposer: false });

    await waitFor(() => {
      expect(useAppStore.getState().view).toEqual({ kind: "thread", panes: [thread.id] });
    });
    expect(useAppStore.getState().pendingComposerFocusThreadId).toBeNull();
  });

  it("switches to the thread project's workspace when requested", async () => {
    const { thread, threadWorkspace } = configureCrossWorkspaceThread();

    openThread(thread.id, { switchWorkspace: true });

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe(threadWorkspace.id);
    await waitFor(() => {
      expect(useAppStore.getState().view).toEqual({ kind: "thread", panes: [thread.id] });
    });
  });

  it("keeps the active workspace for ordinary thread navigation", async () => {
    const { currentWorkspace, thread } = configureCrossWorkspaceThread();

    openThread(thread.id);

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe(currentWorkspace.id);
    await waitFor(() => {
      expect(useAppStore.getState().view).toEqual({ kind: "thread", panes: [thread.id] });
    });
  });

  it("does not let an older GUI hydration override a newer thread open", async () => {
    let resolveFirstHydration: () => void = () => undefined;
    const firstHydration = new Promise<void>((resolve) => {
      resolveFirstHydration = resolve;
    });
    hydrateThreadRuntimeItems.mockReturnValueOnce(firstHydration);
    const firstThread = makeThread({
      id: "thread-gui",
      presentationMode: "gui",
      status: "idle",
    });
    const secondThread = makeThread({ id: "thread-terminal" });
    useAppStore.setState((state) => ({ ...state, threads: [firstThread, secondThread] }));

    openThread(firstThread.id);
    openThread(secondThread.id);

    // The newer (terminal) open applies on the next animation frame — deferred
    // so the sidebar highlight paints before the heavy pane mount.
    await waitFor(() => {
      expect(useAppStore.getState().view).toEqual({
        kind: "thread",
        panes: [secondThread.id],
      });
    });

    resolveFirstHydration();
    await firstHydration;
    await Promise.resolve();

    expect(useAppStore.getState().view).toEqual({
      kind: "thread",
      panes: [secondThread.id],
    });
  });

  it("hydrates GUI siblings before opening a grouped thread layout", async () => {
    const firstThread = makeThread({
      id: "thread-group-a",
      groupId: "group-1",
      presentationMode: "gui",
    });
    const secondThread = makeThread({
      id: "thread-group-b",
      groupId: "group-1",
      presentationMode: "gui",
    });
    useAppStore.setState((state) => ({ ...state, threads: [firstThread, secondThread] }));

    openThread(firstThread.id);

    expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(firstThread.id);
    expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(secondThread.id);
    expect(useAppStore.getState().view).toEqual({ kind: "home" });

    await waitFor(() => {
      expect(useAppStore.getState().view).toEqual({
        kind: "thread",
        panes: [firstThread.id, secondThread.id],
        activeGroupId: "group-1",
      });
    });
  });

  it("opens an experiment candidate without hydrating or mounting its siblings", async () => {
    const firstThread = makeThread({
      id: "thread-experiment-a",
      groupId: "experiment-1",
      presentationMode: "gui",
    });
    const secondThread = makeThread({
      id: "thread-experiment-b",
      groupId: "experiment-1",
      presentationMode: "gui",
    });
    useAppStore.setState((state) => ({ ...state, threads: [firstThread, secondThread] }));

    openThread(firstThread.id, { standalone: true });

    await waitFor(() => {
      expect(useAppStore.getState().view).toEqual({
        kind: "thread",
        panes: [firstThread.id],
      });
    });
    expect(hydrateThreadRuntimeItems).toHaveBeenCalledTimes(1);
    expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(firstThread.id);
  });

  it("queues terminal reconnects as launching when reopening", () => {
    const thread = makeThread({
      status: "inactive",
      sessionRef: {
        providerSessionId: "session-1",
        discoveredAt: "2026-03-22T00:00:00.000Z",
      },
    });
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));

    reopenStoredThread(thread.id);

    const reopened = useAppStore.getState().threads[0];
    expect(reopened?.status).toBe("launching");
    expect(reopened?.attention).toBe("none");
    expect(useAppStore.getState().pendingThreadLaunches[thread.id]).toBe("");
  });

  it("queues inactive GUI reconnects without marking them launching", () => {
    const thread = makeThread({
      presentationMode: "gui",
      status: "inactive",
      sessionRef: {
        providerSessionId: "session-1",
        discoveredAt: "2026-03-22T00:00:00.000Z",
      },
    });
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));

    reopenStoredThread(thread.id);

    const reopened = useAppStore.getState().threads[0];
    expect(reopened?.status).toBe("idle");
    expect(reopened?.attention).toBe("none");
    expect(useAppStore.getState().pendingThreadLaunches[thread.id]).toBe("");
  });

  it("queues the same empty-prompt reopen for inactive remote threads as local", () => {
    const thread = makeThread({
      presentationMode: "gui",
      status: "inactive",
      remoteServerId: "desktop-1",
      remoteId: "rt-1",
      sessionRef: {
        providerSessionId: "session-1",
        discoveredAt: "2026-03-22T00:00:00.000Z",
      },
    });
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));

    reopenStoredThread(thread.id);

    // Transport split is in performInitialThreadLaunch (remote client vs bridge).
    expect(useAppStore.getState().threads[0]?.status).toBe("idle");
    expect(useAppStore.getState().pendingThreadLaunches[thread.id]).toBe("");
  });

  it("reopens an inactive remote thread after history hydrates on open", async () => {
    const previousOpenRemoteThread = useRemoteServersStore.getState().openRemoteThread;
    const openRemoteThread = vi
      .fn<(desktopId: string, threadId: string) => Promise<boolean>>()
      .mockImplementation(async () => {
        // Simulate history applying inactive status (same as openRemoteThread).
        useAppStore.getState().updateThreadRuntime("thread-1", {
          status: "inactive",
          attention: "none",
          canResumeWithConfig: true,
          sessionRef: {
            providerSessionId: "session-1",
            discoveredAt: "2026-03-22T00:00:00.000Z",
          },
        });
        return true;
      });
    useRemoteServersStore.setState({ openRemoteThread });
    try {
      const thread = makeThread({
        presentationMode: "gui",
        status: "inactive",
        remoteServerId: "desktop-1",
        remoteId: "rt-1",
        canResumeWithConfig: true,
        sessionRef: {
          providerSessionId: "session-1",
          discoveredAt: "2026-03-22T00:00:00.000Z",
        },
      });
      useAppStore.setState((state) => ({ ...state, threads: [thread] }));

      openThread(thread.id);

      await waitFor(() => {
        expect(openRemoteThread).toHaveBeenCalledWith("desktop-1", "rt-1");
      });
      await waitFor(() => {
        expect(useAppStore.getState().pendingThreadLaunches[thread.id]).toBe("");
      });
      expect(useAppStore.getState().threads[0]?.status).toBe("idle");
    } finally {
      useRemoteServersStore.setState({ openRemoteThread: previousOpenRemoteThread });
    }
  });

  it("does not reopen when the remote open was superseded or failed", async () => {
    const previousOpenRemoteThread = useRemoteServersStore.getState().openRemoteThread;
    // openRemoteThread resolves false when it never applied a snapshot.
    const openRemoteThread = vi
      .fn<(desktopId: string, threadId: string) => Promise<boolean>>()
      .mockResolvedValue(false);
    useRemoteServersStore.setState({ openRemoteThread });
    try {
      const thread = makeThread({
        presentationMode: "gui",
        status: "inactive",
        remoteServerId: "desktop-1",
        remoteId: "rt-1",
        canResumeWithConfig: true,
        sessionRef: {
          providerSessionId: "session-1",
          discoveredAt: "2026-03-22T00:00:00.000Z",
        },
      });
      useAppStore.setState((state) => ({ ...state, threads: [thread] }));

      openThread(thread.id);

      await waitFor(() => {
        expect(openRemoteThread).toHaveBeenCalledWith("desktop-1", "rt-1");
      });
      // Flush the .then gate (microtasks) before asserting nothing was queued.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(useAppStore.getState().pendingThreadLaunches[thread.id]).toBeUndefined();
      expect(useAppStore.getState().threads[0]?.status).toBe("inactive");
    } finally {
      useRemoteServersStore.setState({ openRemoteThread: previousOpenRemoteThread });
    }
  });

  it("closes a live CLI thread when marking done even before a session ref is known", async () => {
    const project = useAppStore.getState().addProject({
      kind: "posix",
      path: "/repo",
    });
    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "gpt-5.4" },
      prompt: "hello",
    });
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "working",
      attention: "working",
      canResumeWithConfig: false,
    });

    toggleMarkThreadDone(thread.id);

    expect(bridge.closeThread).toHaveBeenCalledWith({ threadId: thread.id });
    expect(useAppStore.getState().threads[0]?.done).toBe(true);

    await Promise.resolve();

    expect(useAppStore.getState().threads[0]?.status).toBe("inactive");
  });

  it("applies a remote sidebar mutation only after the host accepts it", async () => {
    let resolveCommand: () => void = () => undefined;
    sendThreadCommand.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCommand = resolve;
        }),
    );
    const thread = makeThread({
      remoteServerId: "remote-server",
      remoteId: "remote-thread",
    });
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));

    archiveThread(thread.id);

    expect(useAppStore.getState().threads[0]?.archived).toBe(false);
    expect(sendThreadCommand).toHaveBeenCalledWith("remote-server", {
      kind: "archive",
      threadId: "remote-thread",
    });

    resolveCommand();
    await waitFor(() => expect(useAppStore.getState().threads[0]?.archived).toBe(true));
  });

  it("unloads a remote thread through the central bridge before refreshing its host", async () => {
    const thread = makeThread({
      status: "working",
      remoteServerId: "remote-server",
      remoteId: "remote-thread",
    });
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));

    await unloadStoredThread(thread.id);

    expect(bridge.closeThread).toHaveBeenCalledWith({ threadId: thread.id });
    expect(refreshServer).toHaveBeenCalledWith("remote-server");
    expect(useAppStore.getState().threads[0]?.status).toBe("inactive");
  });

  it("keeps remote sidebar state and surfaces the error when a command fails", async () => {
    sendThreadCommand.mockRejectedValue(new Error("remote server offline"));
    const thread = makeThread({
      remoteServerId: "remote-server",
      remoteId: "remote-thread",
    });
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));

    toggleStarThread(thread.id);
    deleteThread(thread.id);

    await waitFor(() => expect(toast.danger).toHaveBeenCalledTimes(2));
    expect(toast.danger).toHaveBeenCalledWith("remote server offline");
    expect(useAppStore.getState().threads).toEqual([thread]);
  });

  it("deletes a shared-worktree thread without prompting to remove the worktree", () => {
    const worktreePath = "/repo/.worktrees/feature";
    const firstThread = makeThread({
      id: "thread-a",
      worktreePath,
      worktreeBranch: "poracode/feature",
    });
    const secondThread = makeThread({
      id: "thread-b",
      worktreePath,
      worktreeBranch: "poracode/feature",
    });
    useAppStore.setState((state) => ({ ...state, threads: [firstThread, secondThread] }));

    deleteThread(firstThread.id, worktreePath, firstThread.projectId);

    expect(useAppStore.getState().threads.map((thread) => thread.id)).toEqual(["thread-b"]);
    expect(bridge.closeThread).toHaveBeenCalledWith({ threadId: firstThread.id });
    expect(useWorktreeDeleteStore.getState().dialog).toBeNull();
  });

  it("prompts to remove the worktree when deleting the sole thread using it", () => {
    const worktreePath = "/repo/.worktrees/feature";
    const thread = makeThread({
      worktreePath,
      worktreeBranch: "poracode/feature",
    });
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));

    deleteThread(thread.id, worktreePath, thread.projectId);

    expect(useAppStore.getState().threads).toHaveLength(1);
    expect(bridge.closeThread).not.toHaveBeenCalled();
    expect(useWorktreeDeleteStore.getState().dialog).toEqual({
      kind: "single-thread",
      threadId: thread.id,
      projectId: thread.projectId,
      worktreePath,
      worktreeBranch: "poracode/feature",
    });
  });

  it("routes local worktree deletion through the group action", () => {
    localStorage.setItem("poracode-delete-worktree-pref", "thread-and-worktree");
    const worktreePath = "/repo/.worktrees/feature";
    const project = useAppStore.getState().addProject({
      kind: "posix",
      path: "/repo",
    });
    const thread = makeThread({
      projectId: project.id,
      worktreePath,
      worktreeBranch: "poracode/feature",
    });
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));

    deleteThread(thread.id, worktreePath, project.id);

    expect(deleteWorktreeGroup).toHaveBeenCalledWith(project.id, worktreePath, [thread.id]);
    expect(bridge.closeThread).not.toHaveBeenCalled();
  });

  it("routes remote worktree deletion through the remote-aware group action", () => {
    localStorage.setItem("poracode-delete-worktree-pref", "thread-and-worktree");
    const worktreePath = "/repo/.worktrees/feature";
    const localProject = useAppStore.getState().addProject({
      kind: "posix",
      path: "/repo",
    });
    const project = {
      ...localProject,
      remoteServerId: "remote-server",
      remoteId: "remote-project",
    };
    const thread = makeThread({
      projectId: project.id,
      worktreePath,
      worktreeBranch: "poracode/feature",
      remoteServerId: project.remoteServerId,
      remoteId: "remote-thread",
    });
    useAppStore.setState((state) => ({ ...state, projects: [project], threads: [thread] }));

    deleteThread(thread.id, worktreePath, project.id);

    expect(deleteWorktreeGroup).toHaveBeenCalledWith(project.id, worktreePath, [thread.id]);
    expect(bridge.closeThread).not.toHaveBeenCalled();
  });

  it("closes worktree dev terminals when marking a worktree thread done", () => {
    const worktreePath = "/repo/.worktrees/feature";
    const project = useAppStore.getState().addProject({
      kind: "posix",
      path: "/repo",
    });
    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "gpt-5.4" },
      prompt: "hello",
      worktreePath,
    });
    useDevTerminalStore.setState({
      isOpen: true,
      activeProjectId: project.id,
      activeWorktreePath: worktreePath,
      tabs: [
        {
          id: "shell:worktree",
          projectId: project.id,
          worktreePath,
          title: "feature",
          createdAt: "2026-03-22T00:00:00.000Z",
          splitId: "shell:worktree-split",
        },
        {
          id: "shell:other",
          projectId: project.id,
          worktreePath: "/repo/.worktrees/other",
          title: "other",
          createdAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      activeTabId: "shell:worktree",
      tabActivity: {
        "shell:worktree": true,
        "shell:worktree-split": true,
        "shell:other": true,
      },
    });

    toggleMarkThreadDone(thread.id);

    const termState = useDevTerminalStore.getState();
    expect(termState.isOpen).toBe(false);
    expect(termState.activeProjectId).toBeNull();
    expect(termState.activeWorktreePath).toBeNull();
    expect(termState.tabs.map((tab) => tab.id)).toEqual(["shell:other"]);
    expect(termState.activeTabId).toBe("shell:other");
    expect(termState.tabActivity).toEqual({ "shell:other": true });
    expect(bridge.closeThread).toHaveBeenCalledWith({ threadId: thread.id });
    expect(bridge.closeThread).toHaveBeenCalledWith({ threadId: "shell:worktree" });
    expect(bridge.closeThread).toHaveBeenCalledWith({ threadId: "shell:worktree-split" });
  });

  it("keeps worktree dev terminals open when marking one of multiple worktree threads done", () => {
    const worktreePath = "/repo/.worktrees/feature";
    const project = useAppStore.getState().addProject({
      kind: "posix",
      path: "/repo",
    });
    const firstThread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "gpt-5.4" },
      prompt: "hello",
      worktreePath,
    });
    const secondThread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "gpt-5.4" },
      prompt: "hello",
      worktreePath,
    });
    useDevTerminalStore.setState({
      isOpen: true,
      activeProjectId: project.id,
      activeWorktreePath: worktreePath,
      tabs: [
        {
          id: "shell:worktree",
          projectId: project.id,
          worktreePath,
          title: "feature",
          createdAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      activeTabId: "shell:worktree",
      tabActivity: { "shell:worktree": true },
    });

    toggleMarkThreadDone(firstThread.id);

    const termState = useDevTerminalStore.getState();
    expect(termState.isOpen).toBe(true);
    expect(termState.activeProjectId).toBe(project.id);
    expect(termState.activeWorktreePath).toBe(worktreePath);
    expect(termState.tabs.map((tab) => tab.id)).toEqual(["shell:worktree"]);
    expect(bridge.closeThread).toHaveBeenCalledWith({ threadId: firstThread.id });
    expect(bridge.closeThread).not.toHaveBeenCalledWith({ threadId: "shell:worktree" });
    expect(
      useAppStore.getState().threads.find((thread) => thread.id === secondThread.id)?.done,
    ).toBe(false);
  });

  describe("switchToAdjacentThread", () => {
    beforeEach(() => {
      // Manual sort keeps the sidebar order equal to store order (modulo
      // starred-first), so navigation order is deterministic in the test.
      usePanelStore.setState({ threadSortMode: "manual" });
    });

    // openThread defers the pane swap by a frame (so the sidebar highlight
    // paints first), so these assertions wait for the swap to land.
    it("opens the next thread in sidebar order and wraps at the end", async () => {
      const threads = ["a", "b", "c"].map((id) => makeThread({ id }));
      useAppStore.setState((state) => ({ ...state, threads }));

      switchToAdjacentThread(threads[1]!, "next");
      await waitFor(() =>
        expect(useAppStore.getState().view).toEqual({ kind: "thread", panes: ["c"] }),
      );

      switchToAdjacentThread(threads[2]!, "next");
      await waitFor(() =>
        expect(useAppStore.getState().view).toEqual({
          kind: "thread",
          panes: ["a"],
          paneLayout: { kind: "leaf", paneId: "a", slotId: "c" },
        }),
      );
    });

    it("opens the previous thread and wraps at the start", async () => {
      const threads = ["a", "b", "c"].map((id) => makeThread({ id }));
      useAppStore.setState((state) => ({ ...state, threads }));

      switchToAdjacentThread(threads[1]!, "previous");
      await waitFor(() =>
        expect(useAppStore.getState().view).toEqual({ kind: "thread", panes: ["a"] }),
      );

      switchToAdjacentThread(threads[0]!, "previous");
      await waitFor(() =>
        expect(useAppStore.getState().view).toEqual({
          kind: "thread",
          panes: ["c"],
          paneLayout: { kind: "leaf", paneId: "c", slotId: "a" },
        }),
      );
    });

    it("stays within the current thread's project", async () => {
      const threads = [
        makeThread({ id: "a", projectId: "p1" }),
        makeThread({ id: "x", projectId: "p2" }),
        makeThread({ id: "b", projectId: "p1" }),
      ];
      useAppStore.setState((state) => ({ ...state, threads }));

      switchToAdjacentThread(threads[0]!, "next");
      await waitFor(() =>
        expect(useAppStore.getState().view).toEqual({ kind: "thread", panes: ["b"] }),
      );
    });

    it("does nothing when the project has a single thread", () => {
      const only = makeThread({ id: "only" });
      useAppStore.setState((state) => ({ ...state, threads: [only], view: { kind: "home" } }));

      switchToAdjacentThread(only, "next");
      expect(useAppStore.getState().view).toEqual({ kind: "home" });
    });
  });
});

function makeThread(input: Partial<Thread> = {}): Thread {
  const now = "2026-03-22T00:00:00.000Z";
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Persisted thread",
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

/** One project per workspace, so workspace scoping decides which one is picked. */
function configureTwoWorkspaceProjects(): { alpha: Project; beta: Project } {
  useSharedSettings.setState({
    workspaces: [
      {
        id: "workspace-alpha",
        name: "Alpha",
        createdAt: "2026-07-29T00:00:00.000Z",
        icon: "briefcase",
      },
      { id: "workspace-beta", name: "Beta", createdAt: "2026-07-29T00:00:00.000Z", icon: "rocket" },
    ],
  });
  const alpha = useAppStore
    .getState()
    .addProject({ kind: "posix", path: "/repo-alpha" }, undefined, "workspace-alpha");
  const beta = useAppStore
    .getState()
    .addProject({ kind: "posix", path: "/repo-beta" }, undefined, "workspace-beta");
  return { alpha, beta };
}

function configureCrossWorkspaceThread(): {
  currentWorkspace: Workspace;
  threadWorkspace: Workspace;
  thread: Thread;
} {
  const currentWorkspace: Workspace = {
    id: "workspace-current",
    name: "Current",
    createdAt: "2026-07-29T00:00:00.000Z",
    icon: "briefcase",
  };
  const threadWorkspace: Workspace = {
    id: "workspace-thread",
    name: "Thread workspace",
    createdAt: "2026-07-29T00:00:00.000Z",
    icon: "rocket",
  };
  useSharedSettings.setState({ workspaces: [currentWorkspace, threadWorkspace] });
  useWorkspaceStore.setState({ activeWorkspaceId: currentWorkspace.id });
  const project = useAppStore
    .getState()
    .addProject({ kind: "posix", path: "/repo" }, undefined, threadWorkspace.id);
  const thread = makeThread({ projectId: project.id });
  useAppStore.setState((state) => ({ ...state, threads: [thread] }));
  return { currentWorkspace, threadWorkspace, thread };
}
