import { afterEach, describe, expect, it, vi } from "vitest";
import { isIgnoredWorkTreeFile, ProjectWatcher } from "./projectWatcher";
import type { WslBridgeClient, WslLocation } from "./wsl/bridge/client";

function makeLocation(linuxPath: string, distro = "Ubuntu"): WslLocation {
  return {
    kind: "wsl",
    distro,
    linuxPath,
    uncPath: `\\\\wsl.localhost\\${distro}${linuxPath.replaceAll("/", "\\")}`,
  };
}

function createWatchHarness(subscriptionIdForCall: (callNumber: number) => string = () => "sub"): {
  unsubscribe: ReturnType<typeof vi.fn<() => Promise<void>>>;
  waitForSubscription: (callNumber: number) => Promise<void>;
  watch: ReturnType<typeof vi.fn<WslBridgeClient["watch"]>>;
} {
  const unsubscribe = vi.fn<() => Promise<void>>(async () => undefined);
  const readySignals: Array<
    | {
        promise: Promise<void>;
        resolve: () => void;
      }
    | undefined
  > = [];
  const signalForCall = (callNumber: number) => {
    const index = callNumber - 1;
    readySignals[index] ??= (() => {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    })();
    return readySignals[index];
  };
  let callCount = 0;
  const watch = vi.fn<WslBridgeClient["watch"]>(async () => {
    callCount += 1;
    const callNumber = callCount;
    return {
      subscriptionId: subscriptionIdForCall(callNumber),
      get unsubscribe() {
        signalForCall(callNumber).resolve();
        return unsubscribe;
      },
    };
  });

  return {
    unsubscribe,
    waitForSubscription: (callNumber) => signalForCall(callNumber).promise,
    watch,
  };
}

describe("isIgnoredWorkTreeFile", () => {
  it("ignores project-relative managed worktrees and their dependency churn", () => {
    expect(isIgnoredWorkTreeFile(".poracode/worktrees/feature/node_modules/react/index.js")).toBe(
      true,
    );
    expect(isIgnoredWorkTreeFile(".poracode/worktrees/feature/src/app.ts")).toBe(true);
  });

  it("does not hide unrelated project files", () => {
    expect(isIgnoredWorkTreeFile(".poracode/settings.json")).toBe(false);
    expect(isIgnoredWorkTreeFile("src/worktrees/create.ts")).toBe(false);
  });
});

describe("ProjectWatcher WSL worktrees", () => {
  it("restores subscriptions after a crash during pending setup", async () => {
    const { watch, waitForSubscription } = createWatchHarness();
    let rejectFirst!: (error: Error) => void;
    let started!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    watch.mockImplementationOnce(() => {
      started();
      return new Promise((_resolve, reject) => {
        rejectFirst = reject;
      });
    });
    const watcher = new ProjectWatcher({
      onGitChanged: vi.fn<(id: string) => void>(),
      onTreeChanged: vi.fn<(id: string) => void>(),
    });
    watcher.setWslClient({
      readFile: vi.fn<WslBridgeClient["readFile"]>(async () => {
        throw new Error("missing");
      }),
      stat: vi.fn<WslBridgeClient["stat"]>(async () => ({ stats: [] })),
      watch,
    } as unknown as WslBridgeClient);
    watcher.watch("project-1", makeLocation("/home/demo/work/repo"));
    await firstStarted;
    watcher.handleWslBridgeExit("Ubuntu");
    rejectFirst(new Error("bridge exited"));
    await waitForSubscription(1);
    expect(watch).toHaveBeenCalledTimes(2);
    await watcher.dispose();
  });

  it("does not duplicate pending subscriptions when their first read wakes the bridge", async () => {
    const { watch, unsubscribe, waitForSubscription } = createWatchHarness();
    const watcher = new ProjectWatcher({
      onGitChanged: vi.fn<(id: string) => void>(),
      onTreeChanged: vi.fn<(id: string) => void>(),
    });
    const client = {
      readFile: vi.fn<WslBridgeClient["readFile"]>(async () => {
        watcher.handleWslBridgeResume("Ubuntu");
        throw new Error("missing");
      }),
      stat: vi.fn<WslBridgeClient["stat"]>(async () => ({ stats: [] })),
      watch,
    } as unknown as WslBridgeClient;
    watcher.setWslClient(client);
    watcher.watch("project-1", makeLocation("/home/demo/work/repo"));
    watcher.watchWorktrees("project-1", ["/home/demo/work/feature"]);
    await waitForSubscription(2);
    expect(watch).toHaveBeenCalledTimes(2);
    await watcher.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("watches linked worktree roots when .git is a file", async () => {
    vi.useFakeTimers();
    const { watch, waitForSubscription } = createWatchHarness();
    const client = {
      readFile: vi.fn<WslBridgeClient["readFile"]>(async () => {
        throw new Error("missing");
      }),
      stat: vi.fn<WslBridgeClient["stat"]>(async (_location: WslLocation, paths: string[]) => ({
        stats: paths.map((path) => ({
          path,
          exists: true,
          isDirectory: false,
          isFile: true,
        })),
      })),
      watch,
    } as unknown as WslBridgeClient;
    const onTreeChanged = vi.fn<(projectId: string) => void>();
    const watcher = new ProjectWatcher({
      onGitChanged: vi.fn<(projectId: string) => void>(),
      onTreeChanged,
    });
    watcher.setWslClient(client);

    watcher.watch("project-1", makeLocation("/home/demo/work/repo"));
    watcher.watchWorktrees("project-1", ["/home/demo/.poracode/worktrees/repo/feature"]);

    await waitForSubscription(2);
    expect(watch).toHaveBeenCalledTimes(2);
    const worktreeWatchCall = watch.mock.calls[1]!;
    const worktreeWatchOptions = worktreeWatchCall[1];
    expect(worktreeWatchOptions).toEqual(
      expect.objectContaining({
        paths: [{ path: "/home/demo/.poracode/worktrees/repo/feature", scope: "worktree" }],
      }),
    );

    const onEvent = worktreeWatchCall[2];
    onEvent({ subscriptionId: "sub", scope: "worktree", paths: ["src/App.tsx"] });

    await vi.advanceTimersByTimeAsync(300);
    expect(onTreeChanged).toHaveBeenCalledWith("project-1");
    await watcher.dispose();
  });

  it("treats pathless WSL worktree events as tree changes", async () => {
    vi.useFakeTimers();
    const { watch, waitForSubscription } = createWatchHarness();
    const client = {
      readFile: vi.fn<WslBridgeClient["readFile"]>(async () => {
        throw new Error("missing");
      }),
      stat: vi.fn<WslBridgeClient["stat"]>(async () => ({ stats: [] })),
      watch,
    } as unknown as WslBridgeClient;
    const onTreeChanged = vi.fn<(projectId: string) => void>();
    const watcher = new ProjectWatcher({
      onGitChanged: vi.fn<(projectId: string) => void>(),
      onTreeChanged,
    });
    watcher.setWslClient(client);

    watcher.watch("project-1", makeLocation("/home/demo/work/repo"));

    await waitForSubscription(1);
    expect(watch).toHaveBeenCalledTimes(1);
    const onEvent = watch.mock.calls[0]![2];
    onEvent({ subscriptionId: "sub", scope: "worktree", paths: [] });

    await vi.advanceTimersByTimeAsync(300);
    expect(onTreeChanged).toHaveBeenCalledWith("project-1");
    await watcher.dispose();
  });

  it("ignores project-relative managed worktree churn", async () => {
    vi.useFakeTimers();
    const { watch, waitForSubscription } = createWatchHarness();
    const client = {
      readFile: vi.fn<WslBridgeClient["readFile"]>(async () => {
        throw new Error("missing");
      }),
      stat: vi.fn<WslBridgeClient["stat"]>(async () => ({ stats: [] })),
      watch,
    } as unknown as WslBridgeClient;
    const onTreeChanged = vi.fn<(projectId: string) => void>();
    const watcher = new ProjectWatcher({
      onGitChanged: vi.fn<(projectId: string) => void>(),
      onTreeChanged,
    });
    watcher.setWslClient(client);
    watcher.watch("project-1", makeLocation("/home/demo/work/repo"));

    await waitForSubscription(1);
    const onEvent = watch.mock.calls[0]![2];
    onEvent({
      subscriptionId: "sub",
      scope: "worktree",
      paths: [".poracode/worktrees/feature/node_modules/react/index.js"],
    });
    await vi.advanceTimersByTimeAsync(300);

    expect(onTreeChanged).not.toHaveBeenCalled();
    await watcher.dispose();
  });

  it("resubscribes WSL project watchers after the bridge exits", async () => {
    vi.useFakeTimers();
    const { unsubscribe, watch, waitForSubscription } = createWatchHarness(
      (callNumber) => `sub-${callNumber - 1}`,
    );
    const client = {
      readFile: vi.fn<WslBridgeClient["readFile"]>(async () => {
        throw new Error("missing");
      }),
      stat: vi.fn<WslBridgeClient["stat"]>(async () => ({ stats: [] })),
      watch,
    } as unknown as WslBridgeClient;
    const watcher = new ProjectWatcher({
      onGitChanged: vi.fn<(projectId: string) => void>(),
      onTreeChanged: vi.fn<(projectId: string) => void>(),
    });
    watcher.setWslClient(client);

    watcher.watch("project-1", makeLocation("/home/demo/work/repo"));

    await waitForSubscription(1);
    expect(watch).toHaveBeenCalledTimes(1);
    watcher.handleWslBridgeExit("Ubuntu");

    await waitForSubscription(2);
    expect(watch).toHaveBeenCalledTimes(2);
    expect(watch.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        paths: [{ path: "/home/demo/work/repo", scope: "worktree" }],
      }),
    );
    expect(unsubscribe).not.toHaveBeenCalled();
    await watcher.dispose();
  });

  it("keeps replacement worktree watchers while the previous project teardown finishes", async () => {
    vi.useFakeTimers();
    const { unsubscribe, watch, waitForSubscription } = createWatchHarness();
    let finishOldProjectUnsubscribe!: () => void;
    const oldProjectUnsubscribe = new Promise<void>((resolve) => {
      finishOldProjectUnsubscribe = resolve;
    });
    unsubscribe.mockReturnValueOnce(oldProjectUnsubscribe).mockResolvedValue(undefined);
    const client = {
      readFile: vi.fn<WslBridgeClient["readFile"]>(async () => {
        throw new Error("missing");
      }),
      stat: vi.fn<WslBridgeClient["stat"]>(async () => ({ stats: [] })),
      watch,
    } as unknown as WslBridgeClient;
    const onTreeChanged = vi.fn<(projectId: string) => void>();
    const watcher = new ProjectWatcher({
      onGitChanged: vi.fn<(projectId: string) => void>(),
      onTreeChanged,
    });
    watcher.setWslClient(client);
    const worktreePath = "/home/demo/.poracode/worktrees/repo/feature";

    watcher.watch("project-1", makeLocation("/home/demo/old"));
    watcher.watchWorktrees("project-1", [worktreePath]);
    await waitForSubscription(2);

    watcher.watch("project-1", makeLocation("/home/demo/new", "Debian"));
    watcher.watchWorktrees("project-1", [worktreePath]);
    await waitForSubscription(4);
    finishOldProjectUnsubscribe();
    await oldProjectUnsubscribe;
    await Promise.resolve();

    expect(watcher.getWslDistros()).toEqual(["Debian"]);
    watch.mock.calls[3]![2]({
      subscriptionId: "replacement-worktree",
      scope: "worktree",
      paths: ["src/App.tsx"],
    });
    await vi.advanceTimersByTimeAsync(300);
    expect(onTreeChanged).toHaveBeenCalledWith("project-1");

    await watcher.dispose();
  });

  it("ignores linked-worktree directory churn from git status", async () => {
    vi.useFakeTimers();
    const { watch, waitForSubscription } = createWatchHarness();
    const client = {
      readFile: vi.fn<WslBridgeClient["readFile"]>(async () => {
        throw new Error("missing");
      }),
      stat: vi.fn<WslBridgeClient["stat"]>(async (_location: WslLocation, paths: string[]) => ({
        stats: paths.map((path) => ({
          path,
          exists: true,
          isDirectory: path.endsWith("/.git"),
          isFile: !path.endsWith("/.git"),
        })),
      })),
      watch,
    } as unknown as WslBridgeClient;
    const onGitChanged = vi.fn<(projectId: string) => void>();
    const watcher = new ProjectWatcher({
      onGitChanged,
      onTreeChanged: vi.fn<(projectId: string) => void>(),
    });
    watcher.setWslClient(client);

    watcher.watch("project-1", makeLocation("/home/demo/work/repo"));

    await waitForSubscription(1);
    expect(watch).toHaveBeenCalledTimes(1);
    const onEvent = watch.mock.calls[0]![2];
    onEvent({ subscriptionId: "sub", scope: "git", paths: ["worktrees/feature"] });
    await vi.advanceTimersByTimeAsync(300);

    expect(onGitChanged).not.toHaveBeenCalled();
    await watcher.dispose();
  });

  it("emits a git change when a WSL project becomes a Git repo", async () => {
    vi.useFakeTimers();
    const { watch, waitForSubscription } = createWatchHarness();
    const client = {
      readFile: vi.fn<WslBridgeClient["readFile"]>(async () => {
        throw new Error("missing");
      }),
      stat: vi.fn<WslBridgeClient["stat"]>(async (_location: WslLocation, paths: string[]) => ({
        stats: paths.map((path) => ({
          path,
          exists: false,
          isDirectory: false,
          isFile: false,
        })),
      })),
      watch,
    } as unknown as WslBridgeClient;
    const onGitChanged = vi.fn<(projectId: string) => void>();
    const watcher = new ProjectWatcher({
      onGitChanged,
      onTreeChanged: vi.fn<(projectId: string) => void>(),
    });
    watcher.setWslClient(client);

    watcher.watch("project-1", makeLocation("/home/demo/work/repo"));

    await waitForSubscription(1);
    expect(watch).toHaveBeenCalledTimes(1);
    const onEvent = watch.mock.calls[0]![2];
    onEvent({ subscriptionId: "sub", scope: "worktree", paths: [".git/HEAD"] });
    await vi.advanceTimersByTimeAsync(300);

    expect(onGitChanged).toHaveBeenCalledWith("project-1");
    await watcher.dispose();
  });
});

describe("ProjectWatcher.hasWslProjects", () => {
  it("tracks whether any watched project lives in a WSL distro", async () => {
    const watcher = new ProjectWatcher({
      onGitChanged: vi.fn<(projectId: string) => void>(),
      onTreeChanged: vi.fn<(projectId: string) => void>(),
    });
    expect(watcher.hasWslProjects()).toBe(false);
    expect(watcher.getWslDistros()).toEqual([]);

    // Native projects don't count. The path doesn't exist — both fs.watch
    // calls fail into their try/catch, but the entry still registers.
    watcher.watch("native", { kind: "windows", path: "C:\\poracode-test-does-not-exist" });
    expect(watcher.hasWslProjects()).toBe(false);
    expect(watcher.getWslDistros()).toEqual([]);

    // No wslClient is wired, so the WSL subscription itself is a no-op while
    // the watcher entry registers synchronously.
    watcher.watch("wsl", makeLocation("/home/u/repo"));
    expect(watcher.hasWslProjects()).toBe(true);
    expect(watcher.getWslDistros()).toEqual(["Ubuntu"]);

    await watcher.unwatch("wsl");
    expect(watcher.hasWslProjects()).toBe(false);
    expect(watcher.getWslDistros()).toEqual([]);
    await watcher.dispose();
  });

  it("keeps a replacement WSL watcher while the previous unsubscribe finishes", async () => {
    const { unsubscribe, watch, waitForSubscription } = createWatchHarness();
    let finishOldUnsubscribe!: () => void;
    const oldUnsubscribe = new Promise<void>((resolve) => {
      finishOldUnsubscribe = resolve;
    });
    unsubscribe.mockReturnValueOnce(oldUnsubscribe).mockResolvedValue(undefined);
    const client = {
      readFile: vi.fn<WslBridgeClient["readFile"]>(async () => {
        throw new Error("missing");
      }),
      stat: vi.fn<WslBridgeClient["stat"]>(async () => ({ stats: [] })),
      watch,
    } as unknown as WslBridgeClient;
    const watcher = new ProjectWatcher({
      onGitChanged: vi.fn<(projectId: string) => void>(),
      onTreeChanged: vi.fn<(projectId: string) => void>(),
    });
    watcher.setWslClient(client);

    watcher.watch("project-1", makeLocation("/home/demo/old"));
    await waitForSubscription(1);
    watcher.watch("project-1", makeLocation("/home/demo/new", "Debian"));
    await waitForSubscription(2);

    expect(watcher.getWslDistros()).toEqual(["Debian"]);
    finishOldUnsubscribe();
    await oldUnsubscribe;
    await Promise.resolve();
    expect(watcher.getWslDistros()).toEqual(["Debian"]);

    await watcher.dispose();
  });
});
