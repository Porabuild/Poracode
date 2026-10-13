import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import type { Project, RemoteThreadCommand, Thread, Workspace } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { isDraftPaneId } from "@/shared/paneId";
import { normalizeStoredThreadStatus } from "@/renderer/state/slices/helpers";
import { useAppStore } from "@/renderer/state/appStore";
import * as runtimeInterestHydration from "@/renderer/state/runtimeInterestHydration";
import {
  forgetPendingCatalogEdit,
  projectPendingCatalogEdit,
} from "@/renderer/state/pendingCatalogEdits";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useWorkspaceStore } from "@/renderer/state/workspaceStore";
import { useWorktreeDeleteStore } from "@/renderer/state/worktreeDeleteStore";
import {
  archiveThread,
  acknowledgeThread,
  deleteThread,
  deleteThreadsAndOwnedWorktrees,
  requestDeleteThread,
  openNewThread,
  openThread,
  reopenPaneThreadsIfInactive,
  reopenStoredThread,
  setThreadRuntimeReopenEnabled,
  setThreadWorktree,
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
const { hydrateThreadRuntimeItems } = vi.hoisted(() => ({
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

vi.mock("@/renderer/state/chatRuntimePersister", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/renderer/state/chatRuntimePersister")>();
  return {
    ...actual,
    hydrateThreadRuntimeItems,
  };
});

describe("threadActions", () => {
  beforeEach(() => {
    for (const thread of useAppStore.getState().threads)
      forgetPendingCatalogEdit("thread", thread.id);
    vi.clearAllMocks();
    setThreadRuntimeReopenEnabled(true);
    localStorage.clear();
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
      connectingThreadIds: {},
      provisioningWorktreeThreadIds: {},
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

  it("prepares the first GUI chunk before replacing the pane or reconnecting the agent", async () => {
    let finishRead = () => {};
    hydrateThreadRuntimeItems.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishRead = resolve;
      }),
    );
    const thread = makeThread({
      presentationMode: "gui",
      status: "inactive",
      canResumeWithConfig: true,
    });
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));
    openThread(thread.id);
    expect(useAppStore.getState().pendingActiveThreadId).toBe(thread.id);
    await waitFor(() =>
      expect(hydrateThreadRuntimeItems).toHaveBeenCalledExactlyOnceWith(thread.id),
    );
    expect(useAppStore.getState().view).toEqual({ kind: "home" });
    expect(useAppStore.getState().pendingThreadLaunches[thread.id]).toBeUndefined();
    expect(useAppStore.getState().connectingThreadIds[thread.id]).toBeUndefined();
    finishRead();
    await waitFor(() =>
      expect(useAppStore.getState().view).toEqual({ kind: "thread", panes: [thread.id] }),
    );
    expect(hydrateThreadRuntimeItems).toHaveBeenCalledExactlyOnceWith(thread.id);
    expect(useAppStore.getState().pendingComposerFocusThreadId).toBe(thread.id);
    expect(useAppStore.getState().pendingThreadLaunches[thread.id]).toBeDefined();
    expect(useAppStore.getState().connectingThreadIds[thread.id]).toEqual(expect.any(String));
  });

  it("retires a prepared navigation after pane adoption without releasing the pane's reader", async () => {
    const thread = makeThread({ presentationMode: "gui", status: "idle" });
    useAppStore.setState({ threads: [thread] });
    openThread(thread.id);
    await waitFor(() =>
      expect(useAppStore.getState().view).toEqual({ kind: "thread", panes: [thread.id] }),
    );
    const reader = runtimeInterestHydration.adoptRuntimeThreadReader(thread.id);
    const release = vi.spyOn(reader, "release");
    const setPending = vi.spyOn(useAppStore.getState(), "setPendingActiveThread");
    try {
      openNewThread();
      expect(release).not.toHaveBeenCalled();
      expect(setPending).not.toHaveBeenCalled();
    } finally {
      setPending.mockRestore();
      release.mockRestore();
      reader.release();
    }
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

  it("does not let an older GUI open override a newer thread open", async () => {
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

    expect(useAppStore.getState().view).toEqual({
      kind: "thread",
      panes: [secondThread.id],
    });
  });

  it("releases a stalled first history read immediately when navigation leaves", async () => {
    let finishRead = () => {};
    const release = vi.fn<() => void>();
    const ready = new Promise<void>((resolve) => {
      finishRead = resolve;
    });
    const prepare = vi
      .spyOn(runtimeInterestHydration, "prepareRuntimeThreadReader")
      .mockReturnValueOnce({ ready, release });
    const thread = makeThread({ presentationMode: "gui", status: "idle" });
    useAppStore.setState({ threads: [thread] });
    try {
      openThread(thread.id);
      expect(useAppStore.getState().pendingActiveThreadId).toBe(thread.id);
      useAppStore.getState().openHome();
      expect(release).toHaveBeenCalledOnce();
      expect(useAppStore.getState().pendingActiveThreadId).toBeNull();
      finishRead();
      await ready;
      await Promise.resolve();
      expect(useAppStore.getState().view).toEqual({ kind: "home" });
    } finally {
      prepare.mockRestore();
    }
  });

  it("cancels a first history read when its target is removed", async () => {
    const release = vi.fn<() => void>();
    let finishRead = () => {};
    const ready = new Promise<void>((resolve) => {
      finishRead = resolve;
    });
    const prepare = vi
      .spyOn(runtimeInterestHydration, "prepareRuntimeThreadReader")
      .mockReturnValueOnce({ ready, release });
    const thread = makeThread({ presentationMode: "gui", status: "idle" });
    useAppStore.setState({ threads: [thread] });
    try {
      openThread(thread.id);
      useAppStore.setState({ threads: [] });
      expect(release).toHaveBeenCalledOnce();
      expect(useAppStore.getState().pendingActiveThreadId).toBeNull();
      finishRead();
      await ready;
      await Promise.resolve();
      expect(useAppStore.getState().view).toEqual({ kind: "home" });
    } finally {
      prepare.mockRestore();
    }
  });

  it("prepares the selected grouped GUI pane without waiting for its siblings", async () => {
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

    expect(hydrateThreadRuntimeItems).not.toHaveBeenCalled();
    expect(useAppStore.getState().view).toEqual({ kind: "home" });

    await waitFor(() => {
      expect(useAppStore.getState().view).toEqual({
        kind: "thread",
        panes: [firstThread.id, secondThread.id],
        activeGroupId: "group-1",
      });
    });
    expect(hydrateThreadRuntimeItems).toHaveBeenCalledExactlyOnceWith(firstThread.id);
  });

  it("prepares an experiment candidate without hydrating or mounting its siblings", async () => {
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
    expect(hydrateThreadRuntimeItems).toHaveBeenCalledExactlyOnceWith(firstThread.id);
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
    expect(useAppStore.getState().connectingThreadIds[thread.id]).toBeUndefined();
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
    expect(useAppStore.getState().connectingThreadIds[thread.id]).toEqual(expect.any(String));
    expect(useAppStore.getState().pendingThreadLaunches[thread.id]).toBe("");
  });

  it("does not enqueue another reconnect after a stale inactive row arrives during launch", () => {
    const thread = makeThread({
      presentationMode: "gui",
      status: "inactive",
      canResumeWithConfig: true,
    });
    useAppStore.setState({ threads: [thread] });
    reopenStoredThread(thread.id);
    const token = useAppStore.getState().connectingThreadIds[thread.id];
    useAppStore.getState().consumeThreadLaunch(thread.id);
    useAppStore.setState({ threads: [thread] });
    reopenStoredThread(thread.id);
    expect(useAppStore.getState().pendingThreadLaunches).toEqual({});
    expect(useAppStore.getState().connectingThreadIds[thread.id]).toBe(token);
  });

  it("does not relaunch a non-resumable inactive GUI thread", () => {
    const thread = makeThread({
      presentationMode: "gui",
      status: "inactive",
      canResumeWithConfig: false,
    });
    useAppStore.setState({ threads: [thread] });
    reopenStoredThread(thread.id);
    expect(useAppStore.getState().pendingThreadLaunches).toEqual({});
    expect(useAppStore.getState().connectingThreadIds).toEqual({});
    expect(useAppStore.getState().threads[0]?.status).toBe("inactive");
  });

  it("protects an interrupted pre-session GUI row while allowing an explicit fresh draft", () => {
    const project = useAppStore.getState().addProject({ kind: "posix", path: "/repo" });
    const thread = normalizeStoredThreadStatus(
      makeThread({
        projectId: project.id,
        presentationMode: "gui",
        status: "launching",
        canResumeWithConfig: false,
      }),
    );
    const history = { [thread.id]: ["original-message"] };
    const draft = {
      segments: [{ kind: "text" as const, content: "unsent follow up" }],
      attachments: [],
    };
    useAppStore.setState({
      threads: [thread],
      view: { kind: "thread", panes: [thread.id] },
      runtimeItemIdsByThread: history,
      threadDraftContents: { [thread.id]: draft },
    });
    reopenStoredThread(thread.id);
    expect(useAppStore.getState().pendingThreadLaunches).toEqual({});
    expect(useAppStore.getState().connectingThreadIds).toEqual({});
    expect(useAppStore.getState().threads[0]).toBe(thread);

    useSharedSettings.setState({ newThreadMode: "panel" });
    openNewThread(project.id);
    const view = useAppStore.getState().view;
    expect(view.kind).toBe("thread");
    if (view.kind !== "thread") throw new Error("Expected existing thread and fresh draft");
    expect(view.panes).toContain(thread.id);
    expect(view.panes.some(isDraftPaneId)).toBe(true);
    expect(useAppStore.getState().runtimeItemIdsByThread).toBe(history);
    expect(useAppStore.getState().threadDraftContents[thread.id]).toEqual(draft);
    expect(useAppStore.getState().threads[0]).toBe(thread);
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
    expect(useAppStore.getState().connectingThreadIds[thread.id]).toEqual(expect.any(String));
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

  it("paints a remote sidebar mutation while the host accepts it", async () => {
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

    expect(useAppStore.getState().threads[0]?.archived).toBe(true);
    expect(sendThreadCommand).toHaveBeenCalledWith("remote-server", {
      kind: "archive",
      threadId: "remote-thread",
    });

    resolveCommand();
    await waitFor(() => expect(useAppStore.getState().threads[0]?.archived).toBe(true));
    expect(useAppStore.getState().threads[0]?.archivedAt).toEqual(expect.any(String));
  });

  it("never overlays an acknowledged old completion on the next running turn", async () => {
    let accept!: () => void;
    sendThreadCommand.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          accept = resolve;
        }),
    );
    const thread = makeThread({
      status: "finished",
      remoteServerId: "remote-server",
      remoteId: "remote-thread",
    });
    useAppStore.setState({ threads: [thread] });
    acknowledgeThread(thread.id);
    expect(useAppStore.getState().threads[0]?.status).toBe("idle");
    accept();
    await Promise.resolve();
    const running = { ...thread, status: "working" as const };
    expect(projectPendingCatalogEdit("thread", running).status).toBe("working");
  });

  it("hides a deleted thread immediately, retaining its row and restoring the pane on refusal", async () => {
    let reject!: (error: Error) => void;
    sendThreadCommand.mockImplementationOnce(
      () =>
        new Promise((_resolve, refuse) => {
          reject = refuse;
        }),
    );
    const thread = makeThread({ remoteServerId: "remote-server", remoteId: "remote-thread" });
    const view = { kind: "thread" as const, panes: [thread.id] as [string] };
    useAppStore.setState({ threads: [thread], view });
    deleteThread(thread.id);
    expect(useAppStore.getState().threads[0]?.archived).toBe(true);
    expect(useAppStore.getState().view.kind).toBe("home");
    reject(new Error("refused"));
    await waitFor(() => expect(toast.danger).toHaveBeenCalledWith("refused"));
    expect(useAppStore.getState().threads).toEqual([thread]);
    expect(useAppStore.getState().view).toEqual(view);
  });

  it("retires the last done worktree's terminal tabs only after acceptance", async () => {
    let accept!: () => void;
    sendThreadCommand.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          accept = resolve;
        }),
    );
    const thread = makeThread({
      remoteServerId: "remote-server",
      remoteId: "remote-thread",
      worktreePath: "/repo/wt",
    });
    useAppStore.setState({ threads: [thread] });
    const tab = useDevTerminalStore
      .getState()
      .addTab(thread.projectId, "Project", thread.worktreePath);
    toggleMarkThreadDone(thread.id);
    expect(useAppStore.getState().threads[0]?.done).toBe(true);
    expect(useDevTerminalStore.getState().tabs.some((entry) => entry.id === tab.id)).toBe(true);
    accept();
    await waitFor(() =>
      expect(useDevTerminalStore.getState().tabs.some((entry) => entry.id === tab.id)).toBe(false),
    );
    expect(bridge.closeThread).toHaveBeenCalledWith({ threadId: tab.id });
  });

  it("tags a local thread with worktree metadata in the store", async () => {
    const thread = makeThread();
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));

    await setThreadWorktree(thread.id, "/repo/wt", "feature/x", { isNewWorktree: true });

    expect(sendThreadCommand).not.toHaveBeenCalled();
    expect(useAppStore.getState().threads[0]?.worktreePath).toBe("/repo/wt");
    expect(useAppStore.getState().threads[0]?.worktreeBranch).toBe("feature/x");
  });

  it("routes set-worktree through the host for remote threads before mirroring locally", async () => {
    const thread = makeThread({
      remoteServerId: "remote-server",
      remoteId: "remote-thread",
    });
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));

    await setThreadWorktree(thread.id, "/repo/wt", "feature/x", { isNewWorktree: true });

    expect(sendThreadCommand).toHaveBeenCalledWith("remote-server", {
      kind: "set-worktree",
      threadId: "remote-thread",
      worktreePath: "/repo/wt",
      worktreeBranch: "feature/x",
      isNewWorktree: true,
    });
    expect(useAppStore.getState().threads[0]?.worktreePath).toBe("/repo/wt");
    expect(useAppStore.getState().threads[0]?.worktreeBranch).toBe("feature/x");
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

  it("deletes a provisional remote thread locally before the host row exists", () => {
    const thread = makeThread({
      remoteServerId: "remote-server",
      remoteId: "remote-thread-pending",
    });
    useAppStore.setState({
      threads: [thread],
      provisioningWorktreeThreadIds: { [thread.id]: true },
    });

    deleteThread(thread.id);

    expect(useAppStore.getState().threads).toEqual([]);
    expect(sendThreadCommand).not.toHaveBeenCalled();
    expect(bridge.closeThread).not.toHaveBeenCalled();
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

  it("removes a worktree once when every linked thread is selected", () => {
    const worktreePath = "/repo/.worktrees/feature";
    const firstThread = makeThread({ id: "thread-a", worktreePath });
    const secondThread = makeThread({ id: "thread-b", worktreePath });
    const standalone = makeThread({ id: "thread-c" });
    useAppStore.setState({ threads: [firstThread, secondThread, standalone] });

    deleteThreadsAndOwnedWorktrees([firstThread, secondThread, standalone]);

    expect(deleteWorktreeGroup).toHaveBeenCalledExactlyOnceWith(
      firstThread.projectId,
      worktreePath,
      [firstThread.id, secondThread.id],
    );
    expect(useAppStore.getState().threads.map((thread) => thread.id)).toEqual([
      firstThread.id,
      secondThread.id,
    ]);
    expect(bridge.closeThread).toHaveBeenCalledWith({ threadId: standalone.id });
  });

  it("keeps a worktree when an unselected linked thread remains", () => {
    const worktreePath = "/repo/.worktrees/feature";
    const selected = makeThread({ id: "thread-a", worktreePath });
    const remaining = makeThread({ id: "thread-b", worktreePath });
    useAppStore.setState({ threads: [selected, remaining] });

    deleteThreadsAndOwnedWorktrees([selected]);

    expect(deleteWorktreeGroup).not.toHaveBeenCalled();
    expect(useAppStore.getState().threads).toEqual([remaining]);
    expect(bridge.closeThread).toHaveBeenCalledWith({ threadId: selected.id });
  });

  it("prompts to remove the worktree when deleting the sole thread using it", () => {
    const worktreePath = "/repo/.worktrees/feature";
    const thread = makeThread({
      worktreePath,
      worktreeBranch: "poracode/feature",
    });
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));

    requestDeleteThread(thread.id, worktreePath, thread.projectId, {
      anchorPosition: { x: 240, y: 120 },
    });

    expect(useAppStore.getState().threads).toHaveLength(1);
    expect(bridge.closeThread).not.toHaveBeenCalled();
    expect(useWorktreeDeleteStore.getState().dialog).toEqual({
      kind: "single-thread",
      threadId: thread.id,
      projectId: thread.projectId,
      worktreePath,
      worktreeBranch: "poracode/feature",
      anchorPosition: { x: 240, y: 120 },
    });
  });

  it("asks again for the legacy thread-only preference instead of deleting a worktree", () => {
    localStorage.setItem("poracode-delete-worktree-pref", "thread-only");
    const worktreePath = "/repo/.worktrees/feature";
    const thread = makeThread({
      worktreePath,
      worktreeBranch: "poracode/feature",
    });
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));

    requestDeleteThread(thread.id, worktreePath, thread.projectId, {
      anchorPosition: { x: 240, y: 120 },
    });

    expect(useAppStore.getState().threads).toHaveLength(1);
    expect(deleteWorktreeGroup).not.toHaveBeenCalled();
    expect(useWorktreeDeleteStore.getState().dialog?.kind).toBe("single-thread");
  });

  it("confirms a thread that has no worktree without naming one", () => {
    const thread = makeThread({});
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));

    requestDeleteThread(thread.id, undefined, thread.projectId, {
      anchorPosition: { x: 240, y: 120 },
    });

    expect(useAppStore.getState().threads).toHaveLength(1);
    expect(bridge.closeThread).not.toHaveBeenCalled();
    expect(useWorktreeDeleteStore.getState().dialog).toEqual({
      kind: "single-thread",
      threadId: thread.id,
      projectId: thread.projectId,
      anchorPosition: { x: 240, y: 120 },
    });
  });

  it("confirms a shared-worktree thread without promising to remove the worktree", () => {
    const worktreePath = "/repo/.worktrees/feature";
    const firstThread = makeThread({ id: "thread-a", worktreePath });
    const secondThread = makeThread({ id: "thread-b", worktreePath });
    useAppStore.setState((state) => ({ ...state, threads: [firstThread, secondThread] }));

    requestDeleteThread(firstThread.id, worktreePath, firstThread.projectId, {
      anchorPosition: { x: 240, y: 120 },
    });

    expect(useAppStore.getState().threads).toHaveLength(2);
    expect(useWorktreeDeleteStore.getState().dialog).toEqual({
      kind: "single-thread",
      threadId: firstThread.id,
      projectId: firstThread.projectId,
      anchorPosition: { x: 240, y: 120 },
    });
  });

  it("skips the confirmation entirely once the user opted out", () => {
    localStorage.setItem("poracode-delete-worktree-pref", "thread-and-worktree");
    const thread = makeThread({});
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));

    requestDeleteThread(thread.id, undefined, thread.projectId, {
      anchorPosition: { x: 240, y: 120 },
    });

    expect(useAppStore.getState().threads).toEqual([]);
    expect(bridge.closeThread).toHaveBeenCalledWith({ threadId: thread.id });
    expect(useWorktreeDeleteStore.getState().dialog).toBeNull();
  });

  it("routes local worktree deletion through the group action", () => {
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

  it("forgets a hidden terminal's worktree scope when marking its last worktree thread done", () => {
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
    useDevTerminalStore.getState().openWorktreePanel(project.id, worktreePath);
    useDevTerminalStore.getState().hidePanel();

    toggleMarkThreadDone(thread.id);

    expect(useDevTerminalStore.getState()).toMatchObject({
      activeProjectId: null,
      activeWorktreePath: null,
    });
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

    it("skips Home threads filed under other workspaces but keeps untagged ones", async () => {
      useSharedSettings.setState({
        workspaces: [
          { id: "w1", name: "Work", createdAt: "2026-01-01T00:00:00.000Z", icon: "briefcase" },
          { id: "w2", name: "Side", createdAt: "2026-01-01T00:00:00.000Z", icon: "rocket" },
        ] as Workspace[],
      });
      useWorkspaceStore.setState({ activeWorkspaceId: "w1" });
      const threads = [
        makeThread({ id: "a", projectId: HOME_PROJECT_ID, workspaceId: "w1" }),
        makeThread({ id: "hidden", projectId: HOME_PROJECT_ID, workspaceId: "w2" }),
        makeThread({ id: "b", projectId: HOME_PROJECT_ID }),
      ];
      useAppStore.setState((state) => ({ ...state, threads }));

      // "hidden" is invisible in this workspace's sidebar, so Next must land on
      // the untagged (visible-everywhere) thread instead.
      switchToAdjacentThread(threads[0]!, "next");
      await waitFor(() =>
        expect(useAppStore.getState().view).toEqual({ kind: "thread", panes: ["b"] }),
      );
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
