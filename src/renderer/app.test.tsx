import { Fragment, type ReactNode } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteThreadCommand } from "@/shared/contracts";
import type { QuickComposerSubmission, SupervisorEvent } from "@/shared/ipc";
import { useAppStore } from "./state/appStore";
import { useGitStore } from "./state/gitStore";
import { usePanelStore } from "./state/panelStore";
import { useSidebarUiStore } from "./state/sidebarUiStore";
import { gitMergeAndRemove } from "@/renderer/actions/gitActions";
import { openThread, unloadThread } from "@/renderer/actions/threadActions";

const {
  bridge,
  quickComposerSubmitListeners,
  remoteThreadCommandListeners,
  supervisorEventListeners,
} = vi.hoisted(() => {
  const listeners: Array<(command: RemoteThreadCommand) => void> = [];
  const quickListeners: Array<(submission: QuickComposerSubmission) => void> = [];
  const supervisorListeners: Array<(event: SupervisorEvent) => void> = [];
  return {
    remoteThreadCommandListeners: listeners,
    quickComposerSubmitListeners: quickListeners,
    supervisorEventListeners: supervisorListeners,
    bridge: {
      windowKind: "main",
      pickFolder: vi.fn<() => Promise<null>>().mockResolvedValue(null),
      listWslDistros: vi.fn<() => Promise<string[]>>().mockResolvedValue([]),
      getAgentStatuses: vi
        .fn<() => Promise<{ windows: unknown[]; wsl: unknown[]; fromCache: boolean }>>()
        .mockResolvedValue({ windows: [], wsl: [], fromCache: false }),
      getThreadSnapshots: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
      getHomeScopeLocation: vi
        .fn<() => Promise<{ kind: "windows"; path: string }>>()
        .mockResolvedValue({ kind: "windows", path: "C:\\Users\\demo" }),
      dbGetThreadRuntimeItems: vi
        .fn<(threadId: string) => Promise<unknown[]>>()
        .mockResolvedValue([]),
      dbGetThreadCompletedTurns: vi
        .fn<(threadId: string) => Promise<unknown[]>>()
        .mockResolvedValue([]),
      dbGetThreadContextUsage: vi.fn<(threadId: string) => Promise<null>>().mockResolvedValue(null),
      getGitStatus: vi
        .fn<
          () => Promise<{
            isRepo: boolean;
            branch: string;
            tracking: string;
            hasRemote: boolean;
            remoteInfo: null;
            ahead: number;
            behind: number;
            staged: unknown[];
            unstaged: unknown[];
            totalInsertions: number;
            totalDeletions: number;
          }>
        >()
        .mockResolvedValue({
          isRepo: true,
          branch: "main",
          tracking: "",
          hasRemote: false,
          remoteInfo: null,
          ahead: 0,
          behind: 0,
          staged: [],
          unstaged: [],
          totalInsertions: 0,
          totalDeletions: 0,
        }),
      gitListBranches: vi
        .fn<() => Promise<{ current: string; branches: unknown[] }>>()
        .mockResolvedValue({ current: "main", branches: [] }),
      gitFetch: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      gitListWorktrees: vi
        .fn<() => Promise<{ worktrees: unknown[] }>>()
        .mockResolvedValue({ worktrees: [] }),
      gitProjectSnapshot: vi
        .fn<
          () => Promise<{
            status: unknown;
            branches: unknown;
            worktrees: unknown[] | null;
            ghAvailable: boolean | null;
          }>
        >()
        .mockResolvedValue({
          status: {
            isRepo: true,
            branch: "main",
            tracking: "",
            hasRemote: false,
            remoteInfo: null,
            ahead: 0,
            behind: 0,
            staged: [],
            unstaged: [],
            totalInsertions: 0,
            totalDeletions: 0,
          },
          branches: { current: "main", branches: [] },
          worktrees: [],
          ghAvailable: null,
        }),
      gitWorktreeStatusBatch: vi
        .fn<() => Promise<{ statuses: Record<string, unknown> }>>()
        .mockResolvedValue({ statuses: {} }),
      gitGetWorktreeSourceBranch: vi
        .fn<() => Promise<{ sourceBranch: string; commitsAhead: number; sourceAhead: number }>>()
        .mockResolvedValue({
          sourceBranch: "master",
          commitsAhead: 1,
          sourceAhead: 0,
        }),
      gitMergeToSource: vi
        .fn<() => Promise<{ merged: boolean; fastForward: boolean; newSourceCommit: string }>>()
        .mockResolvedValue({
          merged: true,
          fastForward: false,
          newSourceCommit: "abc123",
        }),
      gitAddWorktree: vi.fn<() => Promise<{ path: string }>>().mockResolvedValue({
        path: "C:\\Users\\demo\\.poracode\\worktrees\\repo-12345678\\feature-x",
      }),
      gitRemoveWorktree: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      gitDeleteBranch: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      startThread: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      sendThreadInput: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      setPendingSteer: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      clearPendingSteer: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      writeTerminal: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      resizeTerminal: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      resolveThreadServerRequest: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      closeThread: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      setWindowChrome: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      onSupervisorEvent: vi.fn<(listener: (event: SupervisorEvent) => void) => () => void>(
        (listener) => {
          supervisorListeners.push(listener);
          return () => undefined;
        },
      ),
      startShell: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      gitWatchProject: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      gitWatchWorktrees: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      gitUnwatchProject: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      checkForUpdate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      startUpdateDownload: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      installUpdate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      onUpdateStatus: vi.fn<() => () => void>(() => () => undefined),
      listAcpRegistry: vi.fn<() => Promise<unknown>>().mockResolvedValue([]),
      onBrowserEvent: vi.fn<() => () => void>(() => () => undefined),
      onRemoteThreadCommand: vi.fn<
        (listener: (command: RemoteThreadCommand) => void) => () => void
      >((listener) => {
        listeners.push(listener);
        return () => undefined;
      }),
      onSharedSettingsChanged: vi.fn<() => () => void>(() => () => undefined),
      onNotificationClick: vi.fn<() => () => void>(() => () => undefined),
      notifyQuickComposerMainReady: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      onQuickComposerSubmit: vi.fn<
        (listener: (submission: QuickComposerSubmission) => void) => () => void
      >((listener) => {
        quickListeners.push(listener);
        return () => undefined;
      }),
      publishRemoteGitSummaries: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      appendUsageEvents: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      browserGetState: vi
        .fn<() => Promise<{ tabs: []; activeTabId: null }>>()
        .mockResolvedValue({ tabs: [], activeTabId: null }),
    },
  };
});

vi.mock("./bridge", () => ({
  readBridge: () => bridge,
  isWindows: () => false,
  isMac: () => false,
}));

vi.mock("./components/ui/provider", () => ({
  AppProvider: (props: { children: ReactNode }) => props.children,
}));

vi.mock("./views/MainView/parts/AppShell/AppShell", () => ({
  AppShell: (props: { sidebar: ReactNode; content: ReactNode }) => (
    <div>
      <div>{props.sidebar}</div>
      <div>{props.content}</div>
    </div>
  ),
  useSidebar: () => ({
    isCollapsed: false,
    closingOverlay: false,
    isOverlay: false,
    collapse: () => {},
    expand: () => {},
  }),
}));

vi.mock("./components/layout/SplitPaneContainer", () => ({
  SplitPaneContainer: (props: {
    layout: { kind: "leaf"; paneId: string } | { kind: "split"; children: unknown[] };
    renderPane: (
      paneId: string,
      rect: { left: number; top: number; width: number; height: number },
    ) => ReactNode;
  }) => {
    const stubRect = { left: 0, top: 0, width: 0, height: 0 };
    const renderAll = (
      layout: { kind: "leaf"; paneId: string } | { kind: "split"; children: unknown[] },
    ): ReactNode =>
      layout.kind === "leaf"
        ? props.renderPane(layout.paneId, stubRect)
        : (
            layout.children as (
              | { kind: "leaf"; paneId: string }
              | { kind: "split"; children: unknown[] }
            )[]
          ).map((child, index) => <Fragment key={index}>{renderAll(child)}</Fragment>);
    return <div>{renderAll(props.layout)}</div>;
  },
}));

vi.mock("./views/MainView/parts/Sidebar/Sidebar", () => ({
  sortModeOrder: ["updated", "created", "manual"],
  sortModeIcon: {
    updated: (props: { className?: string }) => <span {...props}>u</span>,
    created: (props: { className?: string }) => <span {...props}>c</span>,
    manual: (props: { className?: string }) => <span {...props}>m</span>,
  },
  sortModeLabel: {
    updated: "Updated",
    created: "Created",
    manual: "Manual",
  },
  Sidebar: () => {
    return (
      <div>
        sidebar
        <button onClick={() => openThread("thread-1")} type="button">
          open-thread-1
        </button>
        <button onClick={() => unloadThread("thread-1")} type="button">
          unload-thread-1
        </button>
        <button
          onClick={() =>
            gitMergeAndRemove(
              "project-1",
              "C:\\Users\\demo\\.poracode\\worktrees\\repo-12345678\\feature-x",
            )
          }
          type="button"
        >
          merge-remove-worktree
        </button>
      </div>
    );
  },
}));

vi.mock("@/renderer/components/thread/ThreadDraftView", () => ({
  ThreadDraftView: (props: {
    onStart: (input: {
      agentKind: "codex";
      config: { model: string };
      prompt: string;
      existingWorktreePath?: string;
      worktreeBranch?: string;
      worktreeBaseBranch?: string;
      worktreeIsNewBranch?: boolean;
    }) => void;
  }) => (
    <div>
      draft
      <button
        onClick={() =>
          props.onStart({
            agentKind: "codex",
            config: { model: "gpt-5.4" },
            prompt: "start worktree",
            worktreeBranch: "feature/x",
            worktreeBaseBranch: "main",
            worktreeIsNewBranch: true,
          })
        }
        type="button"
      >
        start-worktree
      </button>
      <button
        onClick={() =>
          props.onStart({
            agentKind: "codex",
            config: { model: "gpt-5.4" },
            prompt: "attach worktree",
            existingWorktreePath: "C:\\Users\\demo\\.poracode\\worktrees\\repo-12345678\\feature-x",
            worktreeBranch: "feature/x",
          })
        }
        type="button"
      >
        attach-existing-worktree
      </button>
    </div>
  ),
}));

vi.mock("@/renderer/components/thread/ThreadView", () => ({
  ThreadView: (props: {
    thread: { id: string; title: string; status: string };
    pendingLaunchPrompt?: string;
  }) => (
    <div
      data-pending-launch={props.pendingLaunchPrompt ?? "__none__"}
      data-status={props.thread.status}
      data-testid={`thread-view-${props.thread.id}`}
    >
      {props.thread.title}
    </div>
  ),
}));

vi.mock("./state/sharedSettingsStore", () => ({
  useSharedSettings: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        themeMode: "system",
        staleThreadUnloadMinutes: 20,
        autoArchiveDoneAfterDays: 7,
        worktreeStorageMode: "global",
        worktreeBasePath: "",
        wslWorktreeBasePath: "",
      }),
    {
      getState: () => ({
        themeMode: "system",
        staleThreadUnloadMinutes: 20,
        autoArchiveDoneAfterDays: 7,
        worktreeStorageMode: "global",
        worktreeBasePath: "",
        wslWorktreeBasePath: "",
        setThemeMode: () => undefined,
      }),
    },
  ),
}));

import { App } from "./app";

describe("App", () => {
  const originalHasHydrated = useAppStore.persist.hasHydrated;
  const originalOnHydrate = useAppStore.persist.onHydrate;
  const originalOnFinishHydration = useAppStore.persist.onFinishHydration;

  function mockAnimationFrameWithFakeTimers(): void {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
      window.setTimeout(() => callback(0), 16),
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => {
      window.clearTimeout(handle);
    });
  }

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.useRealTimers();
    useAppStore.persist.hasHydrated = originalHasHydrated;
    useAppStore.persist.onHydrate = originalOnHydrate;
    useAppStore.persist.onFinishHydration = originalOnFinishHydration;
    useAppStore.setState((state) => ({
      ...state,
      projects: [],
      threads: [],
      pendingThreadLaunches: {},
      pendingLaunchSegments: {},
      lastViewedAtByThreadId: {},
      view: { kind: "home" },
    }));
    useGitStore.setState({
      statuses: {},
      worktreeStatuses: {},
      worktrees: {},
      branches: {},
      ghAvailable: {},
      prData: {},
      worktreeSourceInfo: {},
    });
    usePanelStore.setState({
      gitReviewContext: null,
      gitReviewAsPanel: false,
      filesPanelContext: null,
      rightPanelTab: "git",
      threadSortMode: "updated",
    });
    useSidebarUiStore.setState({
      collapsedProjects: {},
      collapsedWorktrees: {},
      threadListLimits: {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps visible runtime streams frame-paced and throttles hidden threads", () => {
    vi.useFakeTimers();
    mockAnimationFrameWithFakeTimers();
    useAppStore.setState({ view: { kind: "thread", panes: ["visible"] } });
    const applyRuntimeEventBatches = vi.spyOn(useAppStore.getState(), "applyRuntimeEventBatches");
    const listener = supervisorEventListeners.at(-1);
    expect(listener).toBeDefined();

    listener?.({
      type: "thread-runtime-event",
      threadId: "visible",
      event: {
        type: "item.started",
        threadId: "visible",
        itemId: "visible-item",
        itemType: "assistant_message",
      },
    });
    listener?.({
      type: "thread-runtime-event",
      threadId: "hidden",
      event: {
        type: "item.started",
        threadId: "hidden",
        itemId: "hidden-item",
        itemType: "assistant_message",
      },
    });

    vi.advanceTimersByTime(16);
    expect(applyRuntimeEventBatches).toHaveBeenCalledTimes(1);
    expect(applyRuntimeEventBatches.mock.calls[0]?.[0].map((batch) => batch.threadId)).toEqual([
      "visible",
    ]);

    vi.advanceTimersByTime(233);
    expect(applyRuntimeEventBatches).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(applyRuntimeEventBatches).toHaveBeenCalledTimes(2);
    expect(applyRuntimeEventBatches.mock.calls[1]?.[0].map((batch) => batch.threadId)).toEqual([
      "hidden",
    ]);
  });

  it("batches ten background threads with five subagents each into one store update", () => {
    vi.useFakeTimers();
    useAppStore.setState({ view: { kind: "home" } });
    const applyRuntimeEventBatches = vi.spyOn(useAppStore.getState(), "applyRuntimeEventBatches");
    const listener = supervisorEventListeners.at(-1);

    listener?.({
      type: "thread-runtime-events-multi",
      batches: Array.from({ length: 10 }, (_thread, threadIndex) => {
        const threadId = `thread-${threadIndex}`;
        return {
          threadId,
          events: Array.from({ length: 5 }, (_subagent, subagentIndex) => ({
            type: "item.started" as const,
            threadId,
            itemId: `subagent-${subagentIndex}`,
            itemType: "tool_call" as const,
            payload: { name: "spawnAgent", status: "running", isSubAgent: true },
          })),
        };
      }),
    });

    vi.advanceTimersByTime(249);
    expect(applyRuntimeEventBatches).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(applyRuntimeEventBatches).toHaveBeenCalledTimes(1);
    const batches = applyRuntimeEventBatches.mock.calls[0]?.[0] ?? [];
    expect(batches).toHaveLength(10);
    expect(batches.reduce((count, batch) => count + batch.events.length, 0)).toBe(50);
  });

  it("promotes queued background events when the user opens the thread", () => {
    vi.useFakeTimers();
    mockAnimationFrameWithFakeTimers();
    useAppStore.setState({ view: { kind: "thread", panes: ["visible"] } });
    const applyRuntimeEventBatches = vi.spyOn(useAppStore.getState(), "applyRuntimeEventBatches");
    const listener = supervisorEventListeners.at(-1);

    listener?.({
      type: "thread-runtime-event",
      threadId: "hidden",
      event: {
        type: "item.started",
        threadId: "hidden",
        itemId: "hidden-item",
        itemType: "assistant_message",
      },
    });
    vi.advanceTimersByTime(100);
    expect(applyRuntimeEventBatches).not.toHaveBeenCalled();

    useAppStore.setState({ view: { kind: "thread", panes: ["hidden"] } });
    vi.advanceTimersByTime(16);

    expect(applyRuntimeEventBatches).toHaveBeenCalledTimes(1);
    expect(applyRuntimeEventBatches.mock.calls[0]?.[0].map((batch) => batch.threadId)).toEqual([
      "hidden",
    ]);
  });

  it("creates and queues a thread requested by a remote client", async () => {
    useAppStore.persist.hasHydrated = vi.fn<() => boolean>().mockReturnValue(true);
    useAppStore.persist.onHydrate = vi.fn<() => () => void>(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn<() => () => void>(() => () => undefined);

    useAppStore.setState((state) => ({
      ...state,
      projects: [
        {
          id: "project-1",
          name: "Repo",
          location: {
            kind: "windows",
            path: "C:\\repo",
          },
          createdAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      view: { kind: "home" },
    }));

    render(<App />);
    const listener = remoteThreadCommandListeners.at(-1);
    expect(listener).toBeDefined();

    act(() => {
      listener?.({
        kind: "start",
        threadId: "remote-thread-1",
        projectId: "project-1",
        agentKind: "codex",
        config: { model: "gpt-5.4" },
        prompt: "start from phone",
        segments: [{ kind: "text", content: "start from phone" }],
        presentationMode: "gui",
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("thread-view-remote-thread-1")).toHaveAttribute(
        "data-pending-launch",
        "start from phone",
      );
    });
    const state = useAppStore.getState();
    const thread = state.threads.find((entry) => entry.id === "remote-thread-1");
    expect(thread).toMatchObject({
      projectId: "project-1",
      agentKind: "codex",
      presentationMode: "gui",
      status: "launching",
    });
    expect(state.view).toEqual({ kind: "thread", panes: ["remote-thread-1"] });
    expect(state.pendingLaunchSegments["remote-thread-1"]).toEqual([
      { kind: "text", content: "start from phone" },
    ]);
    expect(bridge.startThread).not.toHaveBeenCalled();
  });

  it("creates and queues the thread submitted by the quick composer", async () => {
    useAppStore.persist.hasHydrated = vi.fn<() => boolean>().mockReturnValue(true);
    useAppStore.persist.onHydrate = vi.fn<() => () => void>(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn<() => () => void>(() => () => undefined);
    useAppStore.setState((state) => ({
      ...state,
      projects: [
        {
          id: "project-1",
          name: "Repo",
          location: { kind: "windows", path: "C:\\repo" },
          createdAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      view: { kind: "home" },
    }));

    render(<App />);
    const listener = quickComposerSubmitListeners.at(-1);
    expect(listener).toBeDefined();

    act(() => {
      listener?.({
        projectId: "project-1",
        input: {
          agentKind: "codex",
          config: { model: "gpt-5.4" },
          prompt: "sent from overlay",
          segments: [{ kind: "text", content: "sent from overlay" }],
          presentationMode: "gui",
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText("sent from overlay")).toHaveAttribute(
        "data-pending-launch",
        "sent from overlay",
      );
    });
    expect(useAppStore.getState().view.kind).toBe("thread");
    expect(useAppStore.getState().threads[0]).toMatchObject({
      projectId: "project-1",
      agentKind: "codex",
      presentationMode: "gui",
    });
  });

  it("mirrors a remotely started thread without queueing a duplicate launch", async () => {
    useAppStore.persist.hasHydrated = vi.fn<() => boolean>().mockReturnValue(true);
    useAppStore.persist.onHydrate = vi.fn<() => () => void>(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn<() => () => void>(() => () => undefined);

    useAppStore.setState((state) => ({
      ...state,
      projects: [
        {
          id: "project-1",
          name: "Repo",
          location: {
            kind: "windows",
            path: "C:\\repo",
          },
          createdAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      view: { kind: "home" },
    }));

    render(<App />);
    const listener = remoteThreadCommandListeners.at(-1);
    expect(listener).toBeDefined();

    act(() => {
      listener?.({
        kind: "start",
        threadId: "remote-thread-1",
        projectId: "project-1",
        agentKind: "codex",
        config: { model: "gpt-5.4" },
        prompt: "",
        presentationMode: "terminal",
        launchRuntime: false,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("thread-view-remote-thread-1")).toBeInTheDocument();
    });
    const state = useAppStore.getState();
    expect(state.threads.find((thread) => thread.id === "remote-thread-1")?.title).toBe(
      "New thread",
    );
    expect(state.pendingThreadLaunches["remote-thread-1"]).toBeUndefined();
    expect(state.pendingLaunchSegments["remote-thread-1"]).toBeUndefined();
    expect(bridge.startThread).not.toHaveBeenCalled();
  });

  it("queues launch for the selected stored thread on launch even without a session ref", async () => {
    useAppStore.persist.hasHydrated = vi.fn<() => boolean>().mockReturnValue(true);
    useAppStore.persist.onHydrate = vi.fn<() => () => void>(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn<() => () => void>(() => () => undefined);

    useAppStore.setState((state) => ({
      ...state,
      projects: [
        {
          id: "project-1",
          name: "Repo",
          location: {
            kind: "windows",
            path: "C:\\repo",
          },
          createdAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      threads: [
        {
          id: "thread-1",
          projectId: "project-1",
          title: "Persisted thread",
          agentKind: "codex",
          config: {
            model: "gpt-5.4",
          },
          status: "inactive",
          attention: "none",
          canResumeWithConfig: false,
          archived: false,
          done: false,
          starred: false,
          createdAt: "2026-03-22T00:00:00.000Z",
          updatedAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      view: { kind: "thread", panes: ["thread-1"] },
    }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("thread-view-thread-1")).toHaveAttribute(
        "data-status",
        "launching",
      );
      expect(screen.getByTestId("thread-view-thread-1")).toHaveAttribute("data-pending-launch", "");
    });
    expect(bridge.startThread).not.toHaveBeenCalled();
  });

  it("hydrates the selected GUI thread transcript before initial render", async () => {
    useAppStore.persist.hasHydrated = vi.fn<() => boolean>().mockReturnValue(true);
    useAppStore.persist.onHydrate = vi.fn<() => () => void>(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn<() => () => void>(() => () => undefined);
    let resolveRuntimeItems: (items: unknown[]) => void = () => undefined;
    bridge.dbGetThreadRuntimeItems.mockReturnValueOnce(
      new Promise<unknown[]>((resolve) => {
        resolveRuntimeItems = resolve;
      }),
    );

    useAppStore.setState((state) => ({
      ...state,
      projects: [
        {
          id: "project-1",
          name: "Repo",
          location: {
            kind: "windows",
            path: "C:\\repo",
          },
          createdAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      threads: [
        {
          id: "thread-visible-gui",
          projectId: "project-1",
          title: "Visible GUI thread",
          agentKind: "codex",
          config: {
            model: "gpt-5.4",
          },
          status: "idle",
          attention: "none",
          canResumeWithConfig: false,
          archived: false,
          done: false,
          starred: false,
          presentationMode: "gui",
          createdAt: "2026-03-22T00:00:00.000Z",
          updatedAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      view: { kind: "thread", panes: ["thread-visible-gui"] },
    }));

    render(<App />);

    await waitFor(() => {
      expect(bridge.dbGetThreadRuntimeItems).toHaveBeenCalledWith("thread-visible-gui");
    });
    expect(screen.queryByTestId("thread-view-thread-visible-gui")).not.toBeInTheDocument();

    resolveRuntimeItems([]);

    await waitFor(() => {
      expect(screen.getByTestId("thread-view-thread-visible-gui")).toBeInTheDocument();
    });
  });

  it("queues launch for the selected thread after persisted state hydrates", async () => {
    let hydrated = false;
    let onHydrate: ((state: ReturnType<typeof useAppStore.getState>) => void) | undefined;
    let onFinishHydration: ((state: ReturnType<typeof useAppStore.getState>) => void) | undefined;

    useAppStore.persist.hasHydrated = vi.fn<() => boolean>(() => hydrated);
    useAppStore.persist.onHydrate = vi.fn<
      (listener: (state: ReturnType<typeof useAppStore.getState>) => void) => () => void
    >((listener) => {
      onHydrate = listener;
      return () => undefined;
    });
    useAppStore.persist.onFinishHydration = vi.fn<
      (listener: (state: ReturnType<typeof useAppStore.getState>) => void) => () => void
    >((listener) => {
      onFinishHydration = listener;
      return () => undefined;
    });

    render(<App />);

    expect(bridge.startThread).not.toHaveBeenCalled();

    act(() => {
      useAppStore.setState((state) => ({
        ...state,
        projects: [
          {
            id: "project-1",
            name: "Repo",
            location: {
              kind: "windows",
              path: "C:\\repo",
            },
            createdAt: "2026-03-22T00:00:00.000Z",
          },
        ],
        threads: [
          {
            id: "thread-1",
            projectId: "project-1",
            title: "Persisted thread",
            agentKind: "codex",
            config: {
              model: "gpt-5.4",
            },
            status: "idle",
            attention: "none",
            canResumeWithConfig: false,
            archived: false,
            done: false,
            starred: false,
            createdAt: "2026-03-22T00:00:00.000Z",
            updatedAt: "2026-03-22T00:00:00.000Z",
          },
        ],
        view: { kind: "thread", panes: ["thread-1"] },
      }));

      onHydrate?.(useAppStore.getState());
      hydrated = true;
      onFinishHydration?.(useAppStore.getState());
    });

    await waitFor(() => {
      expect(screen.getByTestId("thread-view-thread-1")).toHaveAttribute(
        "data-status",
        "launching",
      );
      expect(screen.getByTestId("thread-view-thread-1")).toHaveAttribute("data-pending-launch", "");
    });
    expect(bridge.startThread).not.toHaveBeenCalled();
  });

  it("queues launch for an inactive thread when the user selects it", async () => {
    useAppStore.persist.hasHydrated = vi.fn<() => boolean>().mockReturnValue(true);
    useAppStore.persist.onHydrate = vi.fn<() => () => void>(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn<() => () => void>(() => () => undefined);

    useAppStore.setState((state) => ({
      ...state,
      projects: [
        {
          id: "project-1",
          name: "Repo",
          location: {
            kind: "windows",
            path: "C:\\repo",
          },
          createdAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      threads: [
        {
          id: "thread-1",
          projectId: "project-1",
          title: "Persisted thread",
          agentKind: "codex",
          config: {
            model: "gpt-5.4",
          },
          status: "inactive",
          attention: "none",
          canResumeWithConfig: false,
          archived: false,
          done: false,
          starred: false,
          createdAt: "2026-03-22T00:00:00.000Z",
          updatedAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      view: { kind: "home" },
    }));

    render(<App />);
    fireEvent.click(await screen.findByText("open-thread-1"));

    await waitFor(() => {
      expect(screen.getByTestId("thread-view-thread-1")).toHaveAttribute(
        "data-status",
        "launching",
      );
      expect(screen.getByTestId("thread-view-thread-1")).toHaveAttribute("data-pending-launch", "");
    });
    expect(bridge.startThread).not.toHaveBeenCalled();
  });

  it("queues reconnect for an inactive GUI thread without marking it as launching", async () => {
    useAppStore.persist.hasHydrated = vi.fn<() => boolean>().mockReturnValue(true);
    useAppStore.persist.onHydrate = vi.fn<() => () => void>(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn<() => () => void>(() => () => undefined);

    useAppStore.setState((state) => ({
      ...state,
      projects: [
        {
          id: "project-1",
          name: "Repo",
          location: {
            kind: "windows",
            path: "C:\\repo",
          },
          createdAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      threads: [
        {
          id: "thread-1",
          projectId: "project-1",
          title: "Stored chat thread",
          agentKind: "codex",
          config: {
            model: "gpt-5.4",
          },
          status: "inactive",
          attention: "none",
          canResumeWithConfig: true,
          archived: false,
          done: false,
          starred: false,
          presentationMode: "gui",
          sessionRef: {
            providerSessionId: "session-1",
            discoveredAt: "2026-03-22T00:00:00.000Z",
          },
          createdAt: "2026-03-22T00:00:00.000Z",
          updatedAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      view: { kind: "home" },
    }));

    render(<App />);
    fireEvent.click(await screen.findByText("open-thread-1"));

    await waitFor(() => {
      expect(screen.getByTestId("thread-view-thread-1")).toHaveAttribute("data-status", "idle");
      expect(screen.getByTestId("thread-view-thread-1")).toHaveAttribute("data-pending-launch", "");
    });
    expect(bridge.startThread).not.toHaveBeenCalled();
  });

  it("can unload a resumable thread and queue it again when reopened", async () => {
    useAppStore.persist.hasHydrated = vi.fn<() => boolean>().mockReturnValue(true);
    useAppStore.persist.onHydrate = vi.fn<() => () => void>(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn<() => () => void>(() => () => undefined);

    useAppStore.setState((state) => ({
      ...state,
      projects: [
        {
          id: "project-1",
          name: "Repo",
          location: {
            kind: "windows",
            path: "C:\\repo",
          },
          createdAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      threads: [
        {
          id: "thread-1",
          projectId: "project-1",
          title: "Stored thread",
          agentKind: "codex",
          config: {
            model: "gpt-5.4",
          },
          status: "inactive",
          attention: "none",
          canResumeWithConfig: true,
          archived: false,
          done: false,
          starred: false,
          sessionRef: {
            providerSessionId: "session-1",
            discoveredAt: "2026-03-22T00:00:00.000Z",
          },
          createdAt: "2026-03-22T00:00:00.000Z",
          updatedAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      view: { kind: "home" },
    }));

    render(<App />);
    fireEvent.click(await screen.findByText("open-thread-1"));

    await waitFor(() => {
      expect(screen.getByTestId("thread-view-thread-1")).toHaveAttribute(
        "data-status",
        "launching",
      );
    });

    await act(async () => {
      useAppStore.setState((state) => ({
        ...state,
        pendingThreadLaunches: {},
        threads: state.threads.map((thread) =>
          thread.id === "thread-1"
            ? {
                ...thread,
                status: "idle",
                attention: "none",
              }
            : thread,
        ),
      }));
    });

    fireEvent.click(screen.getByText("unload-thread-1"));

    await waitFor(() => {
      expect(bridge.closeThread).toHaveBeenCalledWith({ threadId: "thread-1" });
      expect(useAppStore.getState().threads.find((t) => t.id === "thread-1")?.status).toBe(
        "inactive",
      );
      expect(screen.queryByTestId("thread-view-thread-1")).toBeNull();
    });

    fireEvent.click(screen.getByText("open-thread-1"));

    await waitFor(() => {
      expect(screen.getByTestId("thread-view-thread-1")).toHaveAttribute(
        "data-status",
        "launching",
      );
      expect(screen.getByTestId("thread-view-thread-1")).toHaveAttribute("data-pending-launch", "");
    });
  });

  it("sweeps and unloads stale hidden idle threads every 5 minutes", async () => {
    useAppStore.persist.hasHydrated = vi.fn<() => boolean>().mockReturnValue(true);
    useAppStore.persist.onHydrate = vi.fn<() => () => void>(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn<() => () => void>(() => () => undefined);
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-04-06T12:05:00.000Z").getTime());
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    render(<App />);
    await act(async () => {
      await Promise.resolve();
    });

    const sweepInterval = setIntervalSpy.mock.calls.find(
      ([, delay]) => delay === 5 * 60_000,
    )?.[0] as (() => void) | undefined;

    expect(sweepInterval).toBeDefined();

    await act(async () => {
      useAppStore.setState((state) => ({
        ...state,
        projects: [
          {
            id: "project-1",
            name: "Repo",
            location: {
              kind: "windows",
              path: "C:\\repo",
            },
            createdAt: "2026-03-22T00:00:00.000Z",
          },
        ],
        threads: [
          {
            id: "thread-1",
            projectId: "project-1",
            title: "Hidden thread",
            agentKind: "codex",
            config: {
              model: "gpt-5.4",
            },
            status: "idle",
            attention: "none",
            canResumeWithConfig: true,
            archived: false,
            done: false,
            starred: false,
            sessionRef: {
              providerSessionId: "session-1",
              discoveredAt: "2026-03-22T00:00:00.000Z",
            },
            createdAt: "2026-03-22T00:00:00.000Z",
            updatedAt: "2026-04-06T11:39:00.000Z",
          },
          {
            id: "thread-3",
            projectId: "project-1",
            title: "Fresh hidden thread",
            agentKind: "codex",
            config: {
              model: "gpt-5.4",
            },
            status: "idle",
            attention: "none",
            canResumeWithConfig: true,
            archived: false,
            done: false,
            starred: false,
            sessionRef: {
              providerSessionId: "session-3",
              discoveredAt: "2026-03-22T00:00:00.000Z",
            },
            createdAt: "2026-03-22T00:00:00.000Z",
            updatedAt: "2026-04-06T11:50:00.000Z",
          },
          {
            id: "thread-4",
            projectId: "project-1",
            title: "Unchecked finished thread",
            agentKind: "codex",
            config: {
              model: "gpt-5.4",
            },
            status: "finished",
            attention: "none",
            canResumeWithConfig: true,
            archived: false,
            done: false,
            starred: false,
            sessionRef: {
              providerSessionId: "session-4",
              discoveredAt: "2026-03-22T00:00:00.000Z",
            },
            createdAt: "2026-03-22T00:00:00.000Z",
            updatedAt: "2026-04-06T11:00:00.000Z",
          },
          {
            id: "thread-2",
            projectId: "project-1",
            title: "Visible thread",
            agentKind: "codex",
            config: {
              model: "gpt-5.4",
            },
            status: "idle",
            attention: "none",
            canResumeWithConfig: true,
            archived: false,
            done: false,
            starred: false,
            sessionRef: {
              providerSessionId: "session-2",
              discoveredAt: "2026-03-22T00:00:00.000Z",
            },
            createdAt: "2026-03-22T00:00:00.000Z",
            updatedAt: "2026-03-22T00:00:00.000Z",
          },
        ],
        view: { kind: "thread", panes: ["thread-2"] },
      }));
    });

    expect(bridge.closeThread).not.toHaveBeenCalled();

    await act(async () => {
      sweepInterval?.();
      await Promise.resolve();
    });

    expect(bridge.closeThread).toHaveBeenCalledWith({ threadId: "thread-1" });
    expect(bridge.closeThread).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().threads.find((thread) => thread.id === "thread-1")?.status).toBe(
      "inactive",
    );
    expect(useAppStore.getState().threads.find((thread) => thread.id === "thread-3")?.status).toBe(
      "idle",
    );
    expect(useAppStore.getState().threads.find((thread) => thread.id === "thread-4")?.status).toBe(
      "finished",
    );
  });

  it("uses the resolved worktree path returned by the supervisor when starting from a draft", async () => {
    useAppStore.persist.hasHydrated = vi.fn<() => boolean>().mockReturnValue(true);
    useAppStore.persist.onHydrate = vi.fn<() => () => void>(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn<() => () => void>(() => () => undefined);

    useAppStore.setState((state) => ({
      ...state,
      projects: [
        {
          id: "project-1",
          name: "Repo",
          location: {
            kind: "windows",
            path: "C:\\repo",
          },
          scripts: { actions: [], worktreeCopyPatterns: [".env", ".env.*"] },
          createdAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      view: { kind: "draft", projectId: "project-1" },
    }));

    render(<App />);
    fireEvent.click(screen.getByText("start-worktree"));

    await waitFor(() => {
      expect(bridge.gitAddWorktree).toHaveBeenCalledWith({
        projectLocation: { kind: "windows", path: "C:\\repo" },
        branch: "feature/x",
        createBranch: true,
        startPoint: "main",
        copyIgnoredPatterns: [".env", ".env.*"],
        transferUncommitted: false,
        keepChangesInSource: false,
      });
    });

    await waitFor(() => expect(useAppStore.getState().threads).toHaveLength(1));
    const threads = useAppStore.getState().threads;
    expect(threads).toHaveLength(1);
    expect(threads[0]?.worktreePath).toBe(
      "C:\\Users\\demo\\.poracode\\worktrees\\repo-12345678\\feature-x",
    );
    expect(threads[0]?.worktreeBranch).toBe("feature/x");
    expect(useAppStore.getState().projects[0]?.lastDraftConfig?.worktreeMode).toBe(true);
    expect(bridge.gitWatchWorktrees).toHaveBeenCalledWith({
      projectId: "project-1",
      worktreePaths: ["C:\\Users\\demo\\.poracode\\worktrees\\repo-12345678\\feature-x"],
    });
    expect(bridge.getGitStatus).toHaveBeenCalledWith({
      projectLocation: {
        kind: "windows",
        path: "C:\\Users\\demo\\.poracode\\worktrees\\repo-12345678\\feature-x",
      },
    });
  });

  it("keeps existing thread worktrees watched when creating another worktree", async () => {
    useAppStore.persist.hasHydrated = vi.fn<() => boolean>().mockReturnValue(true);
    useAppStore.persist.onHydrate = vi.fn<() => () => void>(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn<() => () => void>(() => () => undefined);

    useAppStore.setState((state) => ({
      ...state,
      projects: [
        {
          id: "project-1",
          name: "Repo",
          location: {
            kind: "windows",
            path: "C:\\repo",
          },
          createdAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      threads: [
        {
          id: "thread-existing",
          projectId: "project-1",
          title: "Existing worktree",
          agentKind: "codex",
          config: { model: "gpt-5.4" },
          status: "idle",
          attention: "none",
          canResumeWithConfig: false,
          worktreePath: "C:\\Users\\demo\\.poracode\\worktrees\\repo-12345678\\feature-y",
          worktreeBranch: "feature/y",
          archived: false,
          done: false,
          starred: false,
          createdAt: "2026-03-22T00:00:00.000Z",
          updatedAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      view: { kind: "draft", projectId: "project-1" },
    }));

    render(<App />);
    fireEvent.click(screen.getByText("start-worktree"));

    await waitFor(() => {
      expect(bridge.gitWatchWorktrees).toHaveBeenCalledWith({
        projectId: "project-1",
        worktreePaths: [
          "C:\\Users\\demo\\.poracode\\worktrees\\repo-12345678\\feature-x",
          "C:\\Users\\demo\\.poracode\\worktrees\\repo-12345678\\feature-y",
        ],
      });
    });
  });

  it("reactively updates watched worktrees when a hidden worktree panel opens and closes", async () => {
    useAppStore.persist.hasHydrated = vi.fn<() => boolean>().mockReturnValue(true);
    useAppStore.persist.onHydrate = vi.fn<() => () => void>(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn<() => () => void>(() => () => undefined);

    const visiblePath = "C:\\Users\\demo\\.poracode\\worktrees\\repo-12345678\\feature-y";
    const hiddenPath = "C:\\Users\\demo\\.poracode\\worktrees\\repo-12345678\\feature-z";

    useSidebarUiStore.setState({ threadListLimits: { "project-1": 1 } });
    useAppStore.setState((state) => ({
      ...state,
      projects: [
        {
          id: "project-1",
          name: "Repo",
          location: {
            kind: "windows",
            path: "C:\\repo",
          },
          createdAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      threads: [
        {
          id: "thread-visible",
          projectId: "project-1",
          title: "Visible worktree",
          agentKind: "codex",
          config: { model: "gpt-5.4" },
          status: "idle",
          attention: "none",
          canResumeWithConfig: false,
          worktreePath: visiblePath,
          worktreeBranch: "feature/y",
          archived: false,
          done: false,
          starred: false,
          createdAt: "2026-03-22T00:00:00.000Z",
          updatedAt: "2026-03-22T00:00:00.000Z",
        },
        {
          id: "thread-hidden",
          projectId: "project-1",
          title: "Hidden worktree",
          agentKind: "codex",
          config: { model: "gpt-5.4" },
          status: "finished",
          attention: "none",
          canResumeWithConfig: false,
          worktreePath: hiddenPath,
          worktreeBranch: "feature/z",
          archived: false,
          done: false,
          starred: false,
          createdAt: "2026-03-21T00:00:00.000Z",
          updatedAt: "2026-03-21T00:00:00.000Z",
        },
      ],
      view: { kind: "home" },
    }));

    render(<App />);

    await waitFor(() => {
      expect(bridge.gitWatchWorktrees).toHaveBeenCalledWith({
        projectId: "project-1",
        worktreePaths: [visiblePath],
      });
    });
    bridge.gitWatchWorktrees.mockClear();

    act(() => {
      usePanelStore.setState({
        gitReviewContext: { projectId: "project-1", worktreePath: hiddenPath },
        gitReviewAsPanel: true,
        rightPanelTab: "git",
      });
    });

    await waitFor(() => {
      expect(bridge.gitWatchWorktrees).toHaveBeenCalledWith({
        projectId: "project-1",
        worktreePaths: [visiblePath, hiddenPath],
      });
    });
    bridge.gitWatchWorktrees.mockClear();

    act(() => {
      usePanelStore.setState({
        gitReviewContext: null,
      });
    });

    await waitFor(() => {
      expect(bridge.gitWatchWorktrees).toHaveBeenCalledWith({
        projectId: "project-1",
        worktreePaths: [visiblePath],
      });
    });
  });

  it("attaches a new thread to an existing worktree without creating another one", async () => {
    useAppStore.persist.hasHydrated = vi.fn<() => boolean>().mockReturnValue(true);
    useAppStore.persist.onHydrate = vi.fn<() => () => void>(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn<() => () => void>(() => () => undefined);

    useAppStore.setState((state) => ({
      ...state,
      projects: [
        {
          id: "project-1",
          name: "Repo",
          location: {
            kind: "windows",
            path: "C:\\repo",
          },
          createdAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      view: { kind: "draft", projectId: "project-1" },
    }));

    render(<App />);
    fireEvent.click(screen.getByText("attach-existing-worktree"));

    await waitFor(() => {
      const threads = useAppStore.getState().threads;
      expect(threads).toHaveLength(1);
      expect(threads[0]?.worktreePath).toBe(
        "C:\\Users\\demo\\.poracode\\worktrees\\repo-12345678\\feature-x",
      );
      expect(threads[0]?.worktreeBranch).toBe("feature/x");
    });

    expect(bridge.gitAddWorktree).not.toHaveBeenCalled();
    expect(useAppStore.getState().projects[0]?.lastDraftConfig?.worktreeMode).toBe(false);
  });

  it("uses a sibling thread branch when merge and remove is triggered from a worktree thread without branch metadata", async () => {
    useAppStore.persist.hasHydrated = vi.fn<() => boolean>().mockReturnValue(true);
    useAppStore.persist.onHydrate = vi.fn<() => () => void>(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn<() => () => void>(() => () => undefined);

    useAppStore.setState((state) => ({
      ...state,
      projects: [
        {
          id: "project-1",
          name: "Repo",
          location: {
            kind: "windows",
            path: "C:\\repo",
          },
          createdAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      threads: [
        {
          id: "thread-1",
          projectId: "project-1",
          title: "Thread without branch",
          agentKind: "codex",
          config: { model: "gpt-5.4" },
          status: "idle",
          attention: "none",
          canResumeWithConfig: false,
          worktreePath: "C:\\Users\\demo\\.poracode\\worktrees\\repo-12345678\\feature-x",
          archived: false,
          done: false,
          starred: false,
          createdAt: "2026-03-22T00:00:00.000Z",
          updatedAt: "2026-03-22T00:00:00.000Z",
        },
        {
          id: "thread-2",
          projectId: "project-1",
          title: "Sibling thread with branch",
          agentKind: "codex",
          config: { model: "gpt-5.4" },
          status: "idle",
          attention: "none",
          canResumeWithConfig: false,
          worktreePath: "C:\\Users\\demo\\.poracode\\worktrees\\repo-12345678\\feature-x",
          worktreeBranch: "poracode/brave-heron",
          archived: false,
          done: false,
          starred: false,
          createdAt: "2026-03-22T00:00:00.000Z",
          updatedAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      view: { kind: "home" },
    }));

    render(<App />);
    fireEvent.click(screen.getByText("merge-remove-worktree"));

    await waitFor(() => {
      expect(bridge.gitGetWorktreeSourceBranch).toHaveBeenCalledWith({
        projectLocation: { kind: "windows", path: "C:\\repo" },
        branch: "poracode/brave-heron",
      });
    });

    await waitFor(() => {
      expect(bridge.gitMergeToSource).toHaveBeenCalledWith({
        projectLocation: { kind: "windows", path: "C:\\repo" },
        worktreeLocation: {
          kind: "windows",
          path: "C:\\Users\\demo\\.poracode\\worktrees\\repo-12345678\\feature-x",
        },
        worktreeBranch: "poracode/brave-heron",
        sourceBranch: "master",
      });
      expect(bridge.gitDeleteBranch).toHaveBeenCalledWith({
        projectLocation: { kind: "windows", path: "C:\\repo" },
        branch: "poracode/brave-heron",
        force: true,
      });
    });
  });
});
