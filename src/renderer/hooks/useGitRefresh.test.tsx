import "fake-indexeddb/auto";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { threadSchema, type Project, type Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useGitRefresh } from "./useGitRefresh";

const { bridgeMock, gitRefreshMocks } = vi.hoisted(() => ({
  bridgeMock: {
    gitWatchProject: vi.fn<() => Promise<void>>(),
    gitUnwatchProject: vi.fn<() => Promise<void>>(),
    gitFetch: vi.fn<() => Promise<void>>(),
    onSupervisorEvent: vi.fn<() => () => void>(),
  },
  gitRefreshMocks: {
    cleanupGitRefreshProjects: vi.fn<(activeProjectIds: ReadonlySet<string>) => void>(),
    getWatcherRefreshMode: vi.fn<(projectId: string) => "status" | "full">(() => "full"),
    prefetchBranchPrData: vi.fn<(project: Pick<Project, "id" | "location">) => Promise<void>>(),
    refreshGitProject:
      vi.fn<
        (
          project: Pick<Project, "id" | "location">,
          reason: "initial" | "watcher" | "fetch" | "manual" | "poll",
          mode?: "status" | "full",
          options?: { isActive?: () => boolean; fetchRemote?: boolean },
        ) => Promise<void>
      >(),
    stopPendingPrRefresh: vi.fn<() => void>(),
    syncPendingPrRefreshProjects:
      vi.fn<(activeProjects: readonly Pick<Project, "id" | "location">[]) => void>(),
    syncWatchedWorktreeProjects:
      vi.fn<(activeProjects: readonly Pick<Project, "id" | "location">[]) => void>(),
  },
}));

vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridgeMock }));
vi.mock("@/renderer/state/gitRefresh", () => gitRefreshMocks);

const remoteProject: Project = {
  id: "remote-project",
  remoteServerId: "desktop-1",
  remoteId: "host-project",
  name: "Remote project",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-08-10T00:00:00.000Z",
};

describe("useGitRefresh remote reachability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMock.gitWatchProject.mockResolvedValue(undefined);
    bridgeMock.gitUnwatchProject.mockResolvedValue(undefined);
    bridgeMock.gitFetch.mockResolvedValue(undefined);
    bridgeMock.onSupervisorEvent.mockReturnValue(vi.fn());
    useAppStore.setState({ projects: [remoteProject] });
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Remote",
          endpoint: "http://127.0.0.1:61234",
          accessToken: "token",
          scopes: [],
        },
      ],
      runtime: {},
    });
  });

  it("skips Git work while the remote transport is connecting", () => {
    useRemoteServersStore.setState({
      runtime: {
        "desktop-1": { status: "connecting", projects: [], threads: [] },
      },
    });

    const { unmount } = renderHook(() => useGitRefresh(true));

    expect(gitRefreshMocks.prefetchBranchPrData).not.toHaveBeenCalled();
    expect(gitRefreshMocks.refreshGitProject).not.toHaveBeenCalled();
    expect(bridgeMock.gitWatchProject).not.toHaveBeenCalled();
    unmount();
  });

  it("keeps Git prefetch and recovery active for a reachable server error", () => {
    useRemoteServersStore.setState({
      runtime: {
        "desktop-1": { status: "error", projects: [], threads: [] },
      },
    });

    const { unmount } = renderHook(() => useGitRefresh(true));

    expect(gitRefreshMocks.prefetchBranchPrData).toHaveBeenCalledWith(remoteProject);
    expect(gitRefreshMocks.refreshGitProject).toHaveBeenCalledWith(
      remoteProject,
      "initial",
      "full",
      expect.any(Object),
    );
    expect(bridgeMock.gitWatchProject).toHaveBeenCalledWith({
      projectId: remoteProject.id,
      projectLocation: remoteProject.location,
    });
    unmount();
  });
});

const localProject: Project = {
  id: "local-project",
  name: "Local project",
  location: { kind: "posix", path: "/local" },
  createdAt: "2026-08-10T00:00:00.000Z",
};

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return threadSchema.parse({
    id: "thread-1",
    projectId: localProject.id,
    title: "Thread",
    agentKind: "acp-generic:fixture",
    config: { model: "fixture" },
    status: "working",
    attention: "working",
    canResumeWithConfig: true,
    presentationMode: "gui",
    worktreePath: "/local/.poracode/worktrees/one",
    worktreeBranch: "poracode/one",
    createdAt: "2026-10-07T00:00:00Z",
    updatedAt: "2026-10-07T00:00:00Z",
    ...overrides,
  });
}

describe("useGitRefresh branch PR prefetch triggers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMock.gitWatchProject.mockResolvedValue(undefined);
    bridgeMock.gitUnwatchProject.mockResolvedValue(undefined);
    bridgeMock.onSupervisorEvent.mockReturnValue(vi.fn());
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    useAppStore.setState({ projects: [localProject], threads: [makeThread()] });
  });

  function renderAndClearInitialPrefetch() {
    const hook = renderHook(() => useGitRefresh(true));
    expect(gitRefreshMocks.prefetchBranchPrData).toHaveBeenCalledWith(localProject);
    gitRefreshMocks.prefetchBranchPrData.mockClear();
    return hook;
  }

  it("does not re-prefetch for streamed thread updates that leave PR inputs unchanged", () => {
    const { unmount } = renderAndClearInitialPrefetch();

    act(() => {
      useAppStore.setState({
        threads: [makeThread({ title: "Renamed", updatedAt: "2026-10-07T00:00:05Z" })],
      });
    });
    act(() => {
      useAppStore.setState({ threads: [makeThread({ attention: "needs_approval" })] });
    });

    expect(gitRefreshMocks.prefetchBranchPrData).not.toHaveBeenCalled();
    unmount();
  });

  it("re-prefetches when a worktree branch appears or a thread finishes its turn", () => {
    const { unmount } = renderAndClearInitialPrefetch();

    act(() => {
      useAppStore.setState({
        threads: [
          makeThread(),
          makeThread({
            id: "thread-2",
            worktreePath: "/local/.poracode/worktrees/two",
            worktreeBranch: "poracode/two",
          }),
        ],
      });
    });
    expect(gitRefreshMocks.prefetchBranchPrData).toHaveBeenCalledTimes(1);

    act(() => {
      useAppStore.setState({
        threads: [
          makeThread({ status: "inactive", attention: "none" }),
          makeThread({
            id: "thread-2",
            worktreePath: "/local/.poracode/worktrees/two",
            worktreeBranch: "poracode/two",
          }),
        ],
      });
    });
    expect(gitRefreshMocks.prefetchBranchPrData).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("re-prefetches only the project whose thread changed", () => {
    const otherProject: Project = {
      ...localProject,
      id: "other-project",
      location: { kind: "posix", path: "/other" },
    };
    const otherThread = makeThread({
      id: "thread-other",
      projectId: otherProject.id,
      worktreePath: "/other/.poracode/worktrees/one",
    });
    useAppStore.setState({
      projects: [localProject, otherProject],
      threads: [makeThread(), otherThread],
    });
    const { unmount } = renderHook(() => useGitRefresh(true));
    expect(gitRefreshMocks.prefetchBranchPrData).toHaveBeenCalledTimes(2);
    gitRefreshMocks.prefetchBranchPrData.mockClear();

    act(() => {
      useAppStore.setState({
        threads: [makeThread(), { ...otherThread, status: "inactive", attention: "none" }],
      });
    });

    expect(gitRefreshMocks.prefetchBranchPrData).toHaveBeenCalledTimes(1);
    expect(gitRefreshMocks.prefetchBranchPrData).toHaveBeenCalledWith(otherProject);
    unmount();
  });
});

describe("useGitRefresh background fetch capacity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    bridgeMock.gitFetch.mockReset().mockResolvedValue(undefined);
    bridgeMock.gitWatchProject.mockResolvedValue(undefined);
    bridgeMock.gitUnwatchProject.mockResolvedValue(undefined);
    bridgeMock.onSupervisorEvent.mockReturnValue(vi.fn());
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    useAppStore.setState({
      projects: Array.from({ length: 8 }, (_, index) => ({
        ...localProject,
        id: `project-${index}`,
        location: { kind: "posix", path: `/repo-${index}` },
      })),
      threads: [],
      view: { kind: "home" },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("limits long fetches and avoids duplicating waiting projects on later polls", async () => {
    const firstFetch = Promise.withResolvers<void>();
    bridgeMock.gitFetch.mockReturnValueOnce(firstFetch.promise);
    const { unmount } = renderHook(() => useGitRefresh(true));
    try {
      await act(() => vi.advanceTimersByTimeAsync(5_000));
      expect(bridgeMock.gitFetch).toHaveBeenCalledOnce();
      await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));
      expect(bridgeMock.gitFetch).toHaveBeenCalledOnce();
      firstFetch.reject(new Error("origin unreachable"));
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(bridgeMock.gitFetch).toHaveBeenCalledTimes(8);
    } finally {
      firstFetch.resolve();
      unmount();
      await act(() => vi.advanceTimersByTimeAsync(0));
    }
  });

  it("shares capacity across effect replacements and skips obsolete queued projects", async () => {
    const firstFetch = Promise.withResolvers<void>();
    bridgeMock.gitFetch.mockReturnValueOnce(firstFetch.promise);
    const { unmount } = renderHook(() => useGitRefresh(true));
    try {
      await act(() => vi.advanceTimersByTimeAsync(5_000));
      expect(bridgeMock.gitFetch).toHaveBeenCalledOnce();
      act(() => {
        useAppStore.setState({ projects: [localProject] });
      });
      await act(() => vi.advanceTimersByTimeAsync(5_000));
      expect(bridgeMock.gitFetch).toHaveBeenCalledOnce();
      firstFetch.resolve();
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(bridgeMock.gitFetch).toHaveBeenCalledTimes(2);
      expect(bridgeMock.gitFetch).toHaveBeenLastCalledWith({
        projectLocation: localProject.location,
        remote: "origin",
        prune: true,
      });
      expect(gitRefreshMocks.refreshGitProject).not.toHaveBeenCalledWith(
        expect.objectContaining({ id: "project-0" }),
        "fetch",
        "full",
        expect.anything(),
      );
    } finally {
      firstFetch.resolve();
      unmount();
      await act(() => vi.advanceTimersByTimeAsync(0));
    }
  });
});
