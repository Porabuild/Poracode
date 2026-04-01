import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  }) => (
    <div>
      sidebar
      <button onClick={() => props.onOpenThread?.("thread-1")} type="button">
        open-thread-1
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
    (selector: (s: Record<string, unknown>) => unknown) => selector({ themeMode: "system" }),
    {
      getState: () => ({
        themeMode: "system",
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
    vi.clearAllMocks();
    useAppStore.persist.hasHydrated = originalHasHydrated;
    useAppStore.persist.onHydrate = originalOnHydrate;
    useAppStore.persist.onFinishHydration = originalOnFinishHydration;
    useAppStore.setState((state) => ({
      ...state,
      projects: [],
      threads: [],
      pendingServerRequests: [],
      pendingThreadLaunches: {},
      agentStatuses: [],
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
