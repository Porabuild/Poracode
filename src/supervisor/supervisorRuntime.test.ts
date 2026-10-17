import { describe, expect, it, vi } from "vitest";
import type { SessionRuntime } from "./runtime/sessionTypes";
import { SupervisorRuntime } from "./supervisorRuntime";
import type {
  GitProjectSnapshotPayload,
  GitProjectSnapshotResult,
  ProjectLocation,
} from "@/shared/contracts";

describe("SupervisorRuntime source-host review availability", () => {
  it.each([true, false])(
    "uses the forge probe for WSL snapshots (requested: %s)",
    async (includeGhCheck) => {
      const projectLocation: ProjectLocation = {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/repo",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
      };
      const snapshot: GitProjectSnapshotResult = {
        status: null,
        branches: null,
        worktrees: null,
        ghAvailable: null,
      };
      const batchedWslProjectSnapshot = vi
        .fn<
          (location: ProjectLocation, includeGhCheck: boolean) => Promise<GitProjectSnapshotResult>
        >()
        .mockResolvedValue(snapshot);
      const checkAvailable = vi
        .fn<(location: ProjectLocation) => Promise<{ available: boolean }>>()
        .mockResolvedValue({ available: true });
      const runtime = Object.create(SupervisorRuntime.prototype) as {
        gitService: { batchedWslProjectSnapshot: typeof batchedWslProjectSnapshot };
        forgeReviewService: { checkAvailable: typeof checkAvailable };
        gitProjectSnapshot(payload: GitProjectSnapshotPayload): Promise<GitProjectSnapshotResult>;
      };
      runtime.gitService = { batchedWslProjectSnapshot };
      runtime.forgeReviewService = { checkAvailable };

      expect(await runtime.gitProjectSnapshot({ projectLocation, includeGhCheck })).toEqual({
        ...snapshot,
        ghAvailable: includeGhCheck ? true : null,
      });
      expect(batchedWslProjectSnapshot).toHaveBeenCalledExactlyOnceWith(projectLocation, false);
      expect(checkAvailable.mock.calls).toEqual(includeGhCheck ? [[projectLocation]] : []);
    },
  );
});

describe("SupervisorRuntime WSL activity", () => {
  it.each([
    { status: "idle", live: true },
    { status: "error", live: true },
    { status: "inactive", live: false },
    { status: "error", ignoreExit: true, live: false },
    { status: "idle", ptyExited: true, live: false },
  ] as const)("tracks actual session lifetime: %j", ({ live, ...state }) => {
    const releaseBridge = vi.fn<(distro: string) => void>();
    const runtime = Object.create(SupervisorRuntime.prototype) as {
      sessions: Map<
        string,
        Pick<SessionRuntime, "status" | "projectLocation" | "ignoreExit" | "ptyExited">
      >;
      wslHookBridge: { releaseBridge: typeof releaseBridge };
      hasLiveWslSession(distro?: string): boolean;
      releaseWslBridgeIfUnused(distro: string): void;
    };
    runtime.sessions = new Map([
      [
        "thread-1",
        {
          ...state,
          projectLocation: {
            kind: "wsl",
            distro: "Ubuntu",
            linuxPath: "/repo",
            uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
          },
        },
      ],
    ]);
    runtime.wslHookBridge = { releaseBridge };
    expect(runtime.hasLiveWslSession()).toBe(live);
    expect(runtime.hasLiveWslSession("Ubuntu")).toBe(live);
    expect(runtime.hasLiveWslSession("Debian")).toBe(false);
    runtime.releaseWslBridgeIfUnused("Ubuntu");
    expect(releaseBridge).toHaveBeenCalledTimes(live ? 0 : 1);
  });
});

describe("SupervisorRuntime worktree removal preparation", () => {
  it("closes a WSL-backed thread by its logical Windows project path", async () => {
    const closeThread = vi.fn<(payload: { threadId: string }) => Promise<void>>(
      async () => undefined,
    );
    const runtime = Object.create(SupervisorRuntime.prototype) as unknown as {
      sessions: Map<string, SessionRuntime>;
      shellSessions: Map<string, never>;
      threadSessionManager: { closeThread: typeof closeThread };
      prepareWorktreeRemovals(paths: readonly string[]): Promise<void>;
    };
    runtime.sessions = new Map([
      [
        "thread-1",
        {
          logicalProjectLocation: { kind: "windows", path: "C:\\work\\project" },
          projectLocation: {
            kind: "wsl",
            distro: "Ubuntu",
            linuxPath: "/mnt/c/work/project",
            uncPath: "\\\\wsl.localhost\\Ubuntu\\mnt\\c\\work\\project",
          },
        } as SessionRuntime,
      ],
    ]);
    runtime.shellSessions = new Map<string, never>();
    runtime.threadSessionManager = { closeThread };

    await runtime.prepareWorktreeRemovals(["C:\\work\\project"]);

    expect(closeThread).toHaveBeenCalledWith({ threadId: "thread-1" });
  });

  it("matches a WSL thread by the native DrvFs path and by its UNC path", async () => {
    for (const target of [
      "C:\\work\\project",
      "\\\\wsl.localhost\\Ubuntu\\mnt\\c\\work\\project",
    ]) {
      const closeThread = vi.fn<(payload: { threadId: string }) => Promise<void>>(
        async () => undefined,
      );
      const runtime = Object.create(SupervisorRuntime.prototype) as unknown as {
        sessions: Map<string, SessionRuntime>;
        shellSessions: Map<string, never>;
        threadSessionManager: { closeThread: typeof closeThread };
        prepareWorktreeRemovals(paths: readonly string[]): Promise<void>;
      };
      runtime.sessions = new Map([
        [
          "thread-1",
          {
            projectLocation: {
              kind: "wsl",
              distro: "Ubuntu",
              linuxPath: "/mnt/c/work/project",
              uncPath: "\\\\wsl.localhost\\Ubuntu\\mnt\\c\\work\\project",
            },
          } as SessionRuntime,
        ],
      ]);
      runtime.shellSessions = new Map<string, never>();
      runtime.threadSessionManager = { closeThread };

      await runtime.prepareWorktreeRemovals([target]);

      expect(closeThread).toHaveBeenCalledWith({ threadId: "thread-1" });
    }
  });
});
