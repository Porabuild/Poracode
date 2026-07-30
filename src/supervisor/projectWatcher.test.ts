import { afterEach, describe, expect, it, vi } from "vitest";
import { isIgnoredWorkTreeFile, ProjectWatcher } from "./projectWatcher";
import type { WslBridgeClient, WslLocation } from "./wsl/bridge/client";

function makeLocation(linuxPath: string): WslLocation {
  return {
    kind: "wsl",
    distro: "Ubuntu",
    linuxPath,
    uncPath: `\\\\wsl.localhost\\Ubuntu${linuxPath.replaceAll("/", "\\")}`,
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
