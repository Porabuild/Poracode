import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectWatcher } from "./projectWatcher";
import type { WslBridgeClient, WslLocation } from "./wsl/bridge/client";

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
});
