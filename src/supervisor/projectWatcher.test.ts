import { afterEach, describe, expect, it, vi } from "vitest";
import { isIgnoredWorkTreeFile, ProjectWatcher } from "./projectWatcher";
import { ProjectWatcherClient } from "./projectWatcherClient";
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
    expect(isIgnoredWorkTreeFile("packages/cli/node_modules/chalk/index.js")).toBe(true);
    expect(isIgnoredWorkTreeFile("native/mcp-relay/target/debug/deps/lib.rmeta")).toBe(true);
    expect(isIgnoredWorkTreeFile(".tmp/scratch.txt")).toBe(true);
  });

  it("does not hide unrelated project files", () => {
    expect(isIgnoredWorkTreeFile(".poracode/settings.json")).toBe(false);
    expect(isIgnoredWorkTreeFile("src/worktrees/create.ts")).toBe(false);
    expect(isIgnoredWorkTreeFile("src/target/router.ts")).toBe(false);
    expect(isIgnoredWorkTreeFile("src/targeting/router.ts")).toBe(false);
  });

  it.each([
    "target/x86_64-pc-windows-msvc/release/helper.exe",
    "native/helper/target/aarch64-apple-darwin/debug/helper",
    ".vite/deps/a.js",
    "packages/a/.vite/deps/a.js",
    ".cache/a",
    "packages/a/.cache/a",
    ".swc/a",
    "packages/a/.swc/a",
    ".parcel-cache/a",
    "packages/a/.parcel-cache/a",
  ])("ignores build/cache noise like the native watcher: %s", (path) => {
    expect(isIgnoredWorkTreeFile(path)).toBe(true);
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
    await watcher.watch("project-1", makeLocation("/home/demo/work/repo"));
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
    await watcher.watch("project-1", makeLocation("/home/demo/work/repo"));
    await watcher.watchWorktrees("project-1", ["/home/demo/work/feature"]);
    await waitForSubscription(2);
    expect(watch).toHaveBeenCalledTimes(2);
    await watcher.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("watches linked worktree roots and preserves WSL location metadata", async () => {
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
    const onTreeChanged = vi.fn<(projectId: string, worktreePath?: string) => void>();
    const watcher = new ProjectWatcher({
      onGitChanged: vi.fn<(projectId: string, worktreePath?: string) => void>(),
      onTreeChanged,
    });
    watcher.setWslClient(client);

    await watcher.watch("project-1", {
      ...makeLocation("/home/demo/work/repo"),
      remoteServerId: "remote-host",
    });
    await watcher.watchWorktrees("project-1", ["/home/demo/.poracode/worktrees/repo/feature"]);

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
    expect(onTreeChanged).toHaveBeenCalledWith(
      "project-1",
      "/home/demo/.poracode/worktrees/repo/feature",
      {
        ...makeLocation("/home/demo/.poracode/worktrees/repo/feature"),
        remoteServerId: "remote-host",
      },
    );
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

    await watcher.watch("project-1", makeLocation("/home/demo/work/repo"));

    await waitForSubscription(1);
    expect(watch).toHaveBeenCalledTimes(1);
    const onEvent = watch.mock.calls[0]![2];
    onEvent({ subscriptionId: "sub", scope: "worktree", paths: [] });

    await vi.advanceTimersByTimeAsync(300);
    expect(onTreeChanged).toHaveBeenCalledWith(
      "project-1",
      undefined,
      makeLocation("/home/demo/work/repo"),
    );
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
    await watcher.watch("project-1", makeLocation("/home/demo/work/repo"));

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

    await watcher.watch("project-1", makeLocation("/home/demo/work/repo"));

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
    const onTreeChanged = vi.fn<(projectId: string, worktreePath?: string) => void>();
    const watcher = new ProjectWatcher({
      onGitChanged: vi.fn<(projectId: string, worktreePath?: string) => void>(),
      onTreeChanged,
    });
    watcher.setWslClient(client);
    const worktreePath = "/home/demo/.poracode/worktrees/repo/feature";

    await watcher.watch("project-1", makeLocation("/home/demo/old"));
    await watcher.watchWorktrees("project-1", [worktreePath]);
    await waitForSubscription(2);

    await watcher.watch("project-1", makeLocation("/home/demo/new", "Debian"));
    await watcher.watchWorktrees("project-1", [worktreePath]);
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
    expect(onTreeChanged).toHaveBeenCalledWith(
      "project-1",
      worktreePath,
      makeLocation(worktreePath, "Debian"),
    );

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

    await watcher.watch("project-1", makeLocation("/home/demo/work/repo"));

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

    await watcher.watch("project-1", makeLocation("/home/demo/work/repo"));

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

    // Native setup is asynchronous; retiring this entry cancels its pending
    // registration without waking a missing filesystem root.
    const nativeReady = watcher.watch("native", {
      kind: "windows",
      path: "C:\\poracode-test-does-not-exist",
    });
    expect(watcher.hasWslProjects()).toBe(false);
    expect(watcher.getWslDistros()).toEqual([]);

    // No wslClient is wired, so the WSL subscription itself is a no-op while
    // the watcher entry registers synchronously.
    await watcher.watch("wsl", makeLocation("/home/u/repo"));
    expect(watcher.hasWslProjects()).toBe(true);
    expect(watcher.getWslDistros()).toEqual(["Ubuntu"]);

    await watcher.unwatch("wsl");
    expect(watcher.hasWslProjects()).toBe(false);
    expect(watcher.getWslDistros()).toEqual([]);
    await watcher.dispose();
    await nativeReady;
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

    await watcher.watch("project-1", makeLocation("/home/demo/old"));
    await waitForSubscription(1);
    await watcher.watch("project-1", makeLocation("/home/demo/new", "Debian"));
    await waitForSubscription(2);

    expect(watcher.getWslDistros()).toEqual(["Debian"]);
    finishOldUnsubscribe();
    await oldUnsubscribe;
    await Promise.resolve();
    expect(watcher.getWslDistros()).toEqual(["Debian"]);

    await watcher.dispose();
  });
});

describe("ProjectWatcher native registration readiness", () => {
  afterEach(() => vi.restoreAllMocks());

  function harness() {
    const registrations: Array<{
      root: string;
      resolve: () => void;
      reject: (error: Error) => void;
      changed: Parameters<ProjectWatcherClient["watch"]>[1];
      unsubscribe: ReturnType<typeof vi.fn>;
    }> = [];
    vi.spyOn(ProjectWatcherClient.prototype, "watch").mockImplementation((root, changed) => {
      let resolve!: () => void, reject!: (error: Error) => void;
      const ready = new Promise<void>((done, fail) => {
        resolve = done;
        reject = fail;
      });
      const unsubscribe = vi.fn<() => void>(() => resolve());
      registrations.push({ root, resolve, reject, changed, unsubscribe });
      return { ready, unsubscribe };
    });
    const onGitChanged = vi.fn<(projectId: string, worktreePath?: string) => void>(),
      onTreeChanged = vi.fn<(projectId: string, worktreePath?: string) => void>();
    const watcher = new ProjectWatcher({ onGitChanged, onTreeChanged });
    return { watcher, registrations, onGitChanged, onTreeChanged };
  }

  it.each([
    { kind: "windows" as const, root: "C:\\repo", worktree: "C:\\topic" },
    { kind: "posix" as const, root: "/repo", worktree: "/topic" },
  ])("preserves $kind location metadata in tree callbacks", async ({ kind, root, worktree }) => {
    const h = harness();
    const location = { kind, path: root, remoteServerId: "remote-host" };
    const project = h.watcher.watch("p", location);
    const registration = h.watcher.watchWorktrees("p", [worktree]);
    h.registrations[0]!.resolve();
    h.registrations[1]!.resolve();
    await Promise.all([project, registration]);

    h.registrations[0]!.changed("worktree");
    h.registrations[1]!.changed("worktree");
    expect(h.onTreeChanged.mock.calls).toEqual([
      ["p", undefined, location],
      ["p", worktree, { kind, path: worktree, remoteServerId: "remote-host" }],
    ]);
    await h.watcher.dispose();
  });

  it("uses the host platform for worktree callbacks without a project location", async () => {
    const h = harness();
    const worktree = process.platform === "win32" ? "C:\\topic" : "/topic";
    const registration = h.watcher.watchWorktrees("p", [worktree]);
    h.registrations[0]!.resolve();
    await registration;
    h.registrations[0]!.changed("worktree");
    expect(h.onTreeChanged).toHaveBeenCalledExactlyOnceWith("p", worktree, {
      kind: process.platform === "win32" ? "windows" : "posix",
      path: worktree,
    });
    await h.watcher.dispose();
  });

  it("keeps project and idempotent worktree registration pending until their ACKs", async () => {
    const h = harness();
    let projectReady = false,
      worktreeReady = false,
      repeatedReady = false;
    const project = h.watcher.watch("p", { kind: "posix", path: "/repo" }).then(() => {
      projectReady = true;
    });
    const worktrees = h.watcher.watchWorktrees("p", ["/topic"]).then(() => {
      worktreeReady = true;
    });
    const repeated = h.watcher.watchWorktrees("p", ["/topic"]).then(() => {
      repeatedReady = true;
    });
    await Promise.resolve();
    expect([projectReady, worktreeReady, repeatedReady]).toEqual([false, false, false]);
    h.registrations[0]!.resolve();
    await project;
    expect(projectReady).toBe(true);
    expect(worktreeReady).toBe(false);
    h.registrations[1]!.resolve();
    await Promise.all([worktrees, repeated]);
    expect([worktreeReady, repeatedReady]).toEqual([true, true]);
    h.registrations[1]!.changed("worktree");
    expect(h.onTreeChanged).toHaveBeenCalledWith("p", "/topic", { kind: "posix", path: "/topic" });
    h.registrations[0]!.changed("worktree");
    expect(h.onTreeChanged).toHaveBeenCalledWith("p", undefined, { kind: "posix", path: "/repo" });
    await h.watcher.dispose();
  });

  it("ignores retired callbacks and keeps a replacement during pending teardown", async () => {
    const h = harness();
    const first = h.watcher.watch("p", { kind: "posix", path: "/old" });
    const oldWorktree = h.watcher.watchWorktrees("p", ["/topic"]);
    const replacement = h.watcher.watch("p", { kind: "posix", path: "/new" });
    const nextWorktree = h.watcher.watchWorktrees("p", ["/topic"]);
    await Promise.all([first, oldWorktree]);
    h.registrations[0]!.changed("git");
    h.registrations[1]!.changed("worktree");
    expect(h.onGitChanged).not.toHaveBeenCalled();
    expect(h.onTreeChanged).not.toHaveBeenCalled();
    h.registrations[2]!.resolve();
    h.registrations[3]!.resolve();
    await Promise.all([replacement, nextWorktree]);
    h.registrations[3]!.changed("git");
    expect(h.onGitChanged).toHaveBeenCalledWith("p", "/topic");
    await h.watcher.dispose();
  });

  it("propagates failed registration and removes only the failed current entry", async () => {
    const h = harness();
    const pending = h.watcher.watch("p", { kind: "posix", path: "/missing" });
    h.registrations[0]!.reject(new Error("registration failed"));
    await expect(pending).rejects.toThrow("registration failed");
    expect(h.registrations[0]!.unsubscribe).toHaveBeenCalledOnce();
    const next = h.watcher.watch("p", { kind: "posix", path: "/valid" });
    h.registrations[1]!.resolve();
    await next;
    h.registrations[1]!.changed("git");
    expect(h.onGitChanged).toHaveBeenCalledExactlyOnceWith("p");
    await h.watcher.dispose();
  });

  it("cancels pending worktree setup on explicit unwatch without late notifications", async () => {
    const h = harness();
    const pending = h.watcher.watchWorktrees("p", ["/topic"]);
    await h.watcher.unwatchWorktree("/topic");
    await pending;
    h.registrations[0]!.changed("worktree");
    expect(h.onTreeChanged).not.toHaveBeenCalled();
    expect(h.registrations[0]!.unsubscribe).toHaveBeenCalledOnce();
    await h.watcher.dispose();
  });
});
