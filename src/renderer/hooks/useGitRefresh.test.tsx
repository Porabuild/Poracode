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

  it("keeps Git prefetch and recovery active for a reachable server error", async () => {
    useRemoteServersStore.setState({
      runtime: {
        "desktop-1": { status: "error", projects: [], threads: [] },
      },
    });

    const { unmount } = renderHook(() => useGitRefresh(true));
    await act(async () => {});

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

  it("keeps local Git work running when a paired host repeatedly reconnects", async () => {
    useAppStore.setState({ projects: [localProject, remoteProject] });
    useRemoteServersStore.setState({
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    });
    const { unmount } = renderHook(() => useGitRefresh(true));
    await act(async () => {});
    const localRefresh = gitRefreshMocks.refreshGitProject.mock.calls.find(
      ([project]) => project.id === localProject.id,
    )!;
    bridgeMock.gitWatchProject.mockClear();
    bridgeMock.gitUnwatchProject.mockClear();
    gitRefreshMocks.refreshGitProject.mockClear();

    for (const status of ["connecting", "online", "offline", "online"] as const) {
      act(() => {
        useRemoteServersStore.setState({
          runtime: { "desktop-1": { status, projects: [], threads: [] } },
        });
      });
    }

    expect(localRefresh[3]?.isActive?.()).toBe(true);
    expect(bridgeMock.gitWatchProject).not.toHaveBeenCalledWith(
      expect.objectContaining({ projectId: localProject.id }),
    );
    expect(bridgeMock.gitUnwatchProject).not.toHaveBeenCalledWith({
      projectId: localProject.id,
    });
    expect(gitRefreshMocks.refreshGitProject).not.toHaveBeenCalledWith(
      localProject,
      "initial",
      "full",
      expect.anything(),
    );
    unmount();
    await act(async () => {});
  });

  it("starts an offline host when it recovers and fences its retired refresh", async () => {
    const { unmount } = renderHook(() => useGitRefresh(true));
    expect(bridgeMock.gitWatchProject).not.toHaveBeenCalled();
    const setStatus = (status: "online" | "offline") => {
      act(() => {
        useRemoteServersStore.setState({
          runtime: { "desktop-1": { status, projects: [], threads: [] } },
        });
      });
    };
    setStatus("online");
    await act(async () => {});
    const firstRefresh = gitRefreshMocks.refreshGitProject.mock.calls[0]!;
    expect(firstRefresh[3]?.isActive?.()).toBe(true);
    setStatus("offline");
    expect(firstRefresh[3]?.isActive?.()).toBe(false);
    setStatus("online");
    await act(async () => {});
    expect(firstRefresh[3]?.isActive?.()).toBe(false);
    expect(gitRefreshMocks.refreshGitProject).toHaveBeenCalledTimes(2);
    expect(gitRefreshMocks.refreshGitProject.mock.calls[1]![3]?.isActive?.()).toBe(true);
    unmount();
    await act(async () => {});
  });

  it("registers a project's worktrees only after its watch settles, on mount and on reconnect", async () => {
    const setStatus = (status: "online" | "connecting") => {
      act(() => {
        useRemoteServersStore.setState({
          runtime: { "desktop-1": { status, projects: [], threads: [] } },
        });
      });
    };
    setStatus("online");
    const log: string[] = [];
    let watch = Promise.withResolvers<void>();
    bridgeMock.gitWatchProject.mockImplementation(() => {
      log.push("watch");
      return watch.promise.then(() => {
        log.push("watched");
      });
    });
    gitRefreshMocks.syncWatchedWorktreeProjects.mockImplementation((projects) => {
      if (projects.some((project) => project.id === remoteProject.id)) log.push("worktrees");
    });
    gitRefreshMocks.cleanupGitRefreshProjects.mockImplementation((projectIds) => {
      if (!projectIds.has(remoteProject.id)) log.push("reset");
    });
    const { unmount } = renderHook(() => useGitRefresh(true));
    try {
      await act(async () => {});
      expect(log).toEqual(["watch"]);
      watch.resolve();
      await act(async () => {});
      expect(log).toEqual(["watch", "watched", "reset", "worktrees"]);

      log.length = 0;
      watch = Promise.withResolvers<void>();
      setStatus("connecting");
      setStatus("online");
      await act(async () => {});
      // A worktree-affecting change before the new watch settles stays local.
      act(() => {
        useAppStore.setState({ view: { kind: "home" } });
      });
      expect(log).toEqual(["reset", "watch"]);
      watch.resolve();
      await act(async () => {});
      expect(log).toEqual(["reset", "watch", "watched", "reset", "worktrees"]);
    } finally {
      watch.resolve();
      unmount();
      await act(async () => {});
      gitRefreshMocks.syncWatchedWorktreeProjects.mockReset();
      gitRefreshMocks.cleanupGitRefreshProjects.mockReset();
    }
  });

  it("never unwatches projects on a paired host it can no longer reach", async () => {
    useAppStore.setState({ projects: [localProject, remoteProject] });
    useRemoteServersStore.setState({
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    });
    const { unmount } = renderHook(() => useGitRefresh(true));
    await act(async () => {});
    act(() => {
      useRemoteServersStore.setState({
        runtime: { "desktop-1": { status: "connecting", projects: [], threads: [] } },
      });
    });
    expect(bridgeMock.gitUnwatchProject).not.toHaveBeenCalled();

    unmount();
    expect(bridgeMock.gitUnwatchProject).toHaveBeenCalledExactlyOnceWith({
      projectId: localProject.id,
    });
    await act(async () => {});
  });

  it("still unwatches a reachable paired host's projects on teardown", async () => {
    useAppStore.setState({ projects: [localProject, remoteProject] });
    useRemoteServersStore.setState({
      runtime: { "desktop-1": { status: "error", projects: [], threads: [] } },
    });
    const { unmount } = renderHook(() => useGitRefresh(true));
    await act(async () => {});

    unmount();
    expect(bridgeMock.gitUnwatchProject).toHaveBeenCalledWith({ projectId: localProject.id });
    expect(bridgeMock.gitUnwatchProject).toHaveBeenCalledWith({ projectId: remoteProject.id });
    await act(async () => {});
  });

  it("bounds initial Git batches per host while another host remains usable", async () => {
    const projects = Array.from({ length: 8 }, (_, index) => ({
      ...localProject,
      id: `local-${index}`,
    }));
    useAppStore.setState({ projects: [...projects, remoteProject] });
    useRemoteServersStore.setState({
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    });
    const firstRefresh = Promise.withResolvers<void>();
    gitRefreshMocks.refreshGitProject.mockImplementation((project) =>
      project.id === "local-0" ? firstRefresh.promise : Promise.resolve(),
    );
    const { unmount } = renderHook(() => useGitRefresh(true));
    try {
      await act(async () => {});
      expect(gitRefreshMocks.refreshGitProject.mock.calls.map(([project]) => project.id)).toEqual([
        "local-0",
        remoteProject.id,
      ]);
      firstRefresh.resolve();
      await act(async () => {});
      expect(gitRefreshMocks.refreshGitProject).toHaveBeenCalledTimes(9);
    } finally {
      firstRefresh.resolve();
      unmount();
      await act(async () => {});
      gitRefreshMocks.refreshGitProject.mockReset();
    }
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

  async function renderAndClearInitialPrefetch() {
    const hook = renderHook(() => useGitRefresh(true));
    await act(async () => {});
    expect(gitRefreshMocks.prefetchBranchPrData).toHaveBeenCalledWith(localProject);
    gitRefreshMocks.prefetchBranchPrData.mockClear();
    return hook;
  }

  it("does not re-prefetch for streamed thread updates that leave PR inputs unchanged", async () => {
    const { unmount } = await renderAndClearInitialPrefetch();

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

  it("re-prefetches when a worktree branch appears or a thread finishes its turn", async () => {
    const { unmount } = await renderAndClearInitialPrefetch();

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

  it("re-prefetches only the project whose thread changed", async () => {
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
    await act(async () => {});
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

  it("keeps a slow paired host's fetch from delaying a local project's fetch", async () => {
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
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    });
    useAppStore.setState({
      projects: [remoteProject, localProject],
      view: { kind: "draft", projectId: localProject.id },
    });
    const remoteFetch = Promise.withResolvers<void>();
    bridgeMock.gitFetch.mockReturnValueOnce(remoteFetch.promise);
    const { unmount } = renderHook(() => useGitRefresh(true));
    try {
      await act(() => vi.advanceTimersByTimeAsync(5_000));
      expect(bridgeMock.gitFetch).toHaveBeenCalledTimes(2);
      expect(bridgeMock.gitFetch).toHaveBeenNthCalledWith(1, {
        projectLocation: remoteProject.location,
        remote: "origin",
        prune: true,
      });
      expect(bridgeMock.gitFetch).toHaveBeenNthCalledWith(2, {
        projectLocation: localProject.location,
        remote: "origin",
        prune: true,
      });
    } finally {
      remoteFetch.resolve();
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
