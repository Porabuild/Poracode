import { Fragment, type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./state/appStore";
import { useGitStore } from "./state/gitStore";
import { gitMergeAndRemove } from "@/renderer/actions/gitActions";
import { openThread, unloadThread } from "@/renderer/actions/threadActions";

const { bridge } = vi.hoisted(() => ({
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
      path: "C:\\Users\\demo\\.lightcode\\worktrees\\repo-12345678\\feature-x",
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
    onSupervisorEvent: vi.fn<() => () => void>(() => () => undefined),
    startShell: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    gitWatchProject: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    gitWatchWorktrees: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    gitUnwatchProject: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    checkForUpdate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    startUpdateDownload: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    installUpdate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    onUpdateStatus: vi.fn<() => () => void>(() => () => undefined),
    setQuickOverlayExpanded: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    closeQuickOverlay: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    notifyQuickOverlayThreadChanged: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    openQuickOverlayThreadInMainWindow: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    onExternalAppStoreChanged: vi.fn<() => () => void>(() => () => undefined),
    onOpenThreadInMainWindow: vi.fn<() => () => void>(() => () => undefined),
    listAcpRegistry: vi.fn<() => Promise<unknown>>().mockResolvedValue([]),
    onBrowserEvent: vi.fn<() => () => void>(() => () => undefined),
    browserGetState: vi
      .fn<() => Promise<{ tabs: []; activeTabId: null }>>()
      .mockResolvedValue({ tabs: [], activeTabId: null }),
  },
}));

vi.mock("./bridge", () => ({
  readBridge: () => bridge,
  isWindows: () => false,
  isMac: () => false,
  isQuickOverlay: () => bridge.windowKind === "quickOverlay",
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
              "C:\\Users\\demo\\.lightcode\\worktrees\\repo-12345678\\feature-x",
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
            existingWorktreePath:
              "C:\\Users\\demo\\.lightcode\\worktrees\\repo-12345678\\feature-x",
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
      }),
    {
      getState: () => ({
        themeMode: "system",
        staleThreadUnloadMinutes: 20,
        autoArchiveDoneAfterDays: 7,
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
      });
    });

    await waitFor(() => expect(useAppStore.getState().threads).toHaveLength(1));
    const threads = useAppStore.getState().threads;
    expect(threads).toHaveLength(1);
    expect(threads[0]?.worktreePath).toBe(
      "C:\\Users\\demo\\.lightcode\\worktrees\\repo-12345678\\feature-x",
    );
    expect(threads[0]?.worktreeBranch).toBe("feature/x");
    expect(useAppStore.getState().projects[0]?.lastDraftConfig?.worktreeMode).toBe(true);
    expect(bridge.gitWatchWorktrees).toHaveBeenCalledWith({
      projectId: "project-1",
      worktreePaths: ["C:\\Users\\demo\\.lightcode\\worktrees\\repo-12345678\\feature-x"],
    });
    expect(bridge.getGitStatus).toHaveBeenCalledWith({
      projectLocation: {
        kind: "windows",
        path: "C:\\Users\\demo\\.lightcode\\worktrees\\repo-12345678\\feature-x",
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
          worktreePath: "C:\\Users\\demo\\.lightcode\\worktrees\\repo-12345678\\feature-y",
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
          "C:\\Users\\demo\\.lightcode\\worktrees\\repo-12345678\\feature-x",
          "C:\\Users\\demo\\.lightcode\\worktrees\\repo-12345678\\feature-y",
        ],
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
        "C:\\Users\\demo\\.lightcode\\worktrees\\repo-12345678\\feature-x",
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
          worktreePath: "C:\\Users\\demo\\.lightcode\\worktrees\\repo-12345678\\feature-x",
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
          worktreePath: "C:\\Users\\demo\\.lightcode\\worktrees\\repo-12345678\\feature-x",
          worktreeBranch: "lightcode/brave-heron",
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
        branch: "lightcode/brave-heron",
      });
    });

    await waitFor(() => {
      expect(bridge.gitMergeToSource).toHaveBeenCalledWith({
        projectLocation: { kind: "windows", path: "C:\\repo" },
        worktreeLocation: {
          kind: "windows",
          path: "C:\\Users\\demo\\.lightcode\\worktrees\\repo-12345678\\feature-x",
        },
        worktreeBranch: "lightcode/brave-heron",
        sourceBranch: "master",
      });
      expect(bridge.gitDeleteBranch).toHaveBeenCalledWith({
        projectLocation: { kind: "windows", path: "C:\\repo" },
        branch: "lightcode/brave-heron",
        force: true,
      });
    });
  });
});
