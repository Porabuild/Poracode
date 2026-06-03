import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectWatcher } from "./projectWatcher";
import { readSshCommandOutput } from "./ssh";
import type { WslBridgeClient, WslLocation } from "./wsl/bridge/client";

vi.mock("./ssh", () => ({
  readSshCommandOutput: vi.fn<() => Promise<{ stdout: string; stderr: string }>>(),
}));

function makeLocation(linuxPath: string): WslLocation {
  return {
    kind: "wsl",
    distro: "Ubuntu",
    linuxPath,
    uncPath: `\\\\wsl.localhost\\Ubuntu${linuxPath.replaceAll("/", "\\")}`,
  };
}

describe("ProjectWatcher WSL worktrees", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("watches linked worktree roots when .git is a file", async () => {
    const unsubscribe = vi.fn<() => Promise<void>>(async () => undefined);
    const watch = vi.fn<WslBridgeClient["watch"]>(async () => ({
      subscriptionId: "sub",
      unsubscribe,
    }));
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
    watcher.watchWorktrees("project-1", ["/home/demo/.lightcode/worktrees/repo/feature"]);

    await vi.waitFor(() => expect(watch).toHaveBeenCalledTimes(2));
    const worktreeWatchCall = watch.mock.calls[1]!;
    const worktreeWatchOptions = worktreeWatchCall[1];
    expect(worktreeWatchOptions).toEqual(
      expect.objectContaining({
        paths: [{ path: "/home/demo/.lightcode/worktrees/repo/feature", scope: "worktree" }],
      }),
    );

    const onEvent = worktreeWatchCall[2];
    onEvent({ subscriptionId: "sub", scope: "worktree", paths: ["src/App.tsx"] });

    await vi.waitFor(() => expect(onTreeChanged).toHaveBeenCalledWith("project-1"));
    await watcher.dispose();
  });

  it("treats pathless WSL worktree events as tree changes", async () => {
    const unsubscribe = vi.fn<() => Promise<void>>(async () => undefined);
    const watch = vi.fn<WslBridgeClient["watch"]>(async () => ({
      subscriptionId: "sub",
      unsubscribe,
    }));
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

    await vi.waitFor(() => expect(watch).toHaveBeenCalledTimes(1));
    const onEvent = watch.mock.calls[0]![2];
    onEvent({ subscriptionId: "sub", scope: "worktree", paths: [] });

    await vi.waitFor(() => expect(onTreeChanged).toHaveBeenCalledWith("project-1"));
    await watcher.dispose();
  });

  it("resubscribes WSL project watchers after the bridge exits", async () => {
    const unsubscribe = vi.fn<() => Promise<void>>(async () => undefined);
    let subscriptionCount = 0;
    const watch = vi.fn<WslBridgeClient["watch"]>(async () => ({
      subscriptionId: `sub-${subscriptionCount++}`,
      unsubscribe,
    }));
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

    await vi.waitFor(() => expect(watch).toHaveBeenCalledTimes(1));
    watcher.handleWslBridgeExit("Ubuntu");

    await vi.waitFor(() => expect(watch).toHaveBeenCalledTimes(2));
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
    const unsubscribe = vi.fn<() => Promise<void>>(async () => undefined);
    const watch = vi.fn<WslBridgeClient["watch"]>(async () => ({
      subscriptionId: "sub",
      unsubscribe,
    }));
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

    await vi.waitFor(() => expect(watch).toHaveBeenCalledTimes(1));
    const onEvent = watch.mock.calls[0]![2];
    onEvent({ subscriptionId: "sub", scope: "git", paths: ["worktrees/feature"] });
    await vi.advanceTimersByTimeAsync(300);

    expect(onGitChanged).not.toHaveBeenCalled();
    await watcher.dispose();
  });
});

describe("ProjectWatcher SSH polling", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("emits tree changes when the remote tree signature changes", async () => {
    vi.useFakeTimers();
    const readSsh = vi.mocked(readSshCommandOutput);
    readSsh
      .mockResolvedValueOnce({ stdout: "sig-a\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "sig-b\n", stderr: "" });
    const onTreeChanged = vi.fn<(projectId: string) => void>();
    const watcher = new ProjectWatcher({
      onGitChanged: vi.fn<(projectId: string) => void>(),
      onTreeChanged,
    });

    watcher.watch("project-ssh", {
      kind: "ssh",
      host: "dev.example.com",
      path: "/home/demo/repo",
    });

    await vi.advanceTimersByTimeAsync(SSH_POLL_MS_FOR_TEST);
    expect(onTreeChanged).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(SSH_POLL_MS_FOR_TEST);
    await vi.advanceTimersByTimeAsync(300);

    expect(readSsh).toHaveBeenCalledWith(
      { kind: "ssh", host: "dev.example.com", path: "/home/demo/repo" },
      "sh",
      expect.any(Array),
      expect.objectContaining({ timeout: 10_000 }),
    );
    expect(onTreeChanged).toHaveBeenCalledWith("project-ssh");
    await watcher.dispose();
  });
});

const SSH_POLL_MS_FOR_TEST = 3_000;
