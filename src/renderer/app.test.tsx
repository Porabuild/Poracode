import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./state/appStore";

const { bridge } = vi.hoisted(() => ({
  bridge: {
    pickFolder: vi.fn().mockResolvedValue(null),
    listWslDistros: vi.fn().mockResolvedValue([]),
    getAgentStatuses: vi.fn().mockResolvedValue([]),
    getThreadSnapshots: vi.fn().mockResolvedValue([]),
    getThreadHistory: vi.fn().mockResolvedValue({ history: "", length: 0 }),
    getGitStatus: vi.fn().mockResolvedValue({
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
    gitListBranches: vi.fn().mockResolvedValue({ current: "main", branches: [] }),
    gitFetch: vi.fn().mockResolvedValue(undefined),
    gitListWorktrees: vi.fn().mockResolvedValue({ worktrees: [] }),
    gitAddWorktree: vi.fn().mockResolvedValue({
      path: "C:\\Users\\demo\\.lightcode\\worktrees\\repo-12345678\\feature-x",
    }),
    gitRemoveWorktree: vi.fn().mockResolvedValue(undefined),
    startThread: vi.fn().mockResolvedValue(undefined),
    sendThreadInput: vi.fn().mockResolvedValue(undefined),
    writeTerminal: vi.fn().mockResolvedValue(undefined),
    resizeTerminal: vi.fn().mockResolvedValue(undefined),
    resolveThreadServerRequest: vi.fn().mockResolvedValue(undefined),
    closeThread: vi.fn().mockResolvedValue(undefined),
    setWindowChrome: vi.fn().mockResolvedValue(undefined),
    onSupervisorEvent: vi.fn(() => () => undefined),
    startShell: vi.fn().mockResolvedValue(undefined),
    gitWatchProject: vi.fn().mockResolvedValue(undefined),
    gitWatchWorktrees: vi.fn().mockResolvedValue(undefined),
    gitUnwatchProject: vi.fn().mockResolvedValue(undefined),
    checkForUpdate: vi.fn().mockResolvedValue(undefined),
    startUpdateDownload: vi.fn().mockResolvedValue(undefined),
    installUpdate: vi.fn().mockResolvedValue(undefined),
    onUpdateStatus: vi.fn(() => () => undefined),
  },
}));

vi.mock("./bridge", () => ({
  readBridge: () => bridge,
  isWindows: () => false,
  isMac: () => false,
}));

vi.mock("./components/ui/provider", () => ({
  AppProvider: (props: { children: ReactNode }) => props.children,
}));

vi.mock("./components/layout/AppShell", () => ({
  AppShell: (props: { sidebar: ReactNode; content: ReactNode }) => (
    <div>
      <div>{props.sidebar}</div>
      <div>{props.content}</div>
    </div>
  ),
  useSidebar: () => ({ isCollapsed: false, collapse: () => {}, expand: () => {} }),
}));

vi.mock("./components/layout/SplitPaneContainer", () => ({
  SplitPaneContainer: (props: { children: ReactNode }) => <div>{props.children}</div>,
}));

vi.mock("./components/sidebar/Sidebar", () => ({
  Sidebar: (props: {
    onOpenThread?: (threadId: string) => void;
    onOpenThreadSideBySide?: (threadId: string) => void;
    onUnloadThread?: (threadId: string) => void;
  }) => (
    <div>
      sidebar
      <button onClick={() => props.onOpenThread?.("thread-1")} type="button">
        open-thread-1
      </button>
      <button onClick={() => props.onUnloadThread?.("thread-1")} type="button">
        unload-thread-1
      </button>
    </div>
  ),
}));

vi.mock("./components/thread/ThreadDraftView", () => ({
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

vi.mock("./components/thread/ThreadView", () => ({
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
      selector({ themeMode: "system", staleThreadUnloadMinutes: 20 }),
    {
      getState: () => ({
        themeMode: "system",
        staleThreadUnloadMinutes: 20,
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
      pendingServerRequests: [],
      pendingThreadLaunches: {},
      pendingLaunchSegments: {},
      agentStatuses: [],
      wslAgentStatuses: [],
      view: { kind: "home" },
    }));
  });

  it("queues launch for the selected stored thread on launch even without a session ref", async () => {
    useAppStore.persist.hasHydrated = vi.fn(() => true);
    useAppStore.persist.onHydrate = vi.fn(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn(() => () => undefined);

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

  it("queues launch for the selected thread after persisted state hydrates", async () => {
    let hydrated = false;
    let onHydrate: ((state: ReturnType<typeof useAppStore.getState>) => void) | undefined;
    let onFinishHydration: ((state: ReturnType<typeof useAppStore.getState>) => void) | undefined;

    useAppStore.persist.hasHydrated = vi.fn(() => hydrated);
    useAppStore.persist.onHydrate = vi.fn((listener) => {
      onHydrate = listener;
      return () => undefined;
    });
    useAppStore.persist.onFinishHydration = vi.fn((listener) => {
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
    useAppStore.persist.hasHydrated = vi.fn(() => true);
    useAppStore.persist.onHydrate = vi.fn(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn(() => () => undefined);

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

  it("can unload a resumable thread and queue it again when reopened", async () => {
    useAppStore.persist.hasHydrated = vi.fn(() => true);
    useAppStore.persist.onHydrate = vi.fn(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn(() => () => undefined);

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
      expect(screen.getByTestId("thread-view-thread-1")).toHaveAttribute("data-status", "inactive");
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
    useAppStore.persist.hasHydrated = vi.fn(() => true);
    useAppStore.persist.onHydrate = vi.fn(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn(() => () => undefined);
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
            sessionRef: {
              providerSessionId: "session-3",
              discoveredAt: "2026-03-22T00:00:00.000Z",
            },
            createdAt: "2026-03-22T00:00:00.000Z",
            updatedAt: "2026-04-06T11:50:00.000Z",
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
  });

  it("uses the resolved worktree path returned by the supervisor when starting from a draft", async () => {
    useAppStore.persist.hasHydrated = vi.fn(() => true);
    useAppStore.persist.onHydrate = vi.fn(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn(() => () => undefined);

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

    const threads = useAppStore.getState().threads;
    expect(threads).toHaveLength(1);
    expect(threads[0]?.worktreePath).toBe(
      "C:\\Users\\demo\\.lightcode\\worktrees\\repo-12345678\\feature-x",
    );
    expect(threads[0]?.worktreeBranch).toBe("feature/x");
  });

  it("attaches a new thread to an existing worktree without creating another one", async () => {
    useAppStore.persist.hasHydrated = vi.fn(() => true);
    useAppStore.persist.onHydrate = vi.fn(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn(() => () => undefined);

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
  });
});
