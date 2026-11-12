import { afterEach, describe, expect, it, vi } from "vitest";
import { WINDOWS_SHELL_AUTO } from "@/shared/settings";
import type { SessionRuntime } from "./runtime/sessionTypes";
import * as shellPreference from "./shellPreference";
import {
  createWindowsPowerShellLaunchResolver,
  type WindowsShellPreference,
} from "./shellPreference";
import { SupervisorRuntime } from "./supervisorRuntime";
import type {
  GitProjectSnapshotPayload,
  GitProjectSnapshotResult,
  GitStatusResult,
  ProjectLocation,
} from "@/shared/contracts";
import { GitService } from "./git";
import type { ProjectWatcher } from "./projectWatcher";
import { ProjectWatcherClient } from "./projectWatcherClient";
import type { WslBridgeClient } from "./wsl/bridge/client";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function status(branch: string): GitStatusResult {
  return {
    isRepo: true,
    branch,
    tracking: "",
    hasRemote: false,
    remoteInfo: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    totalInsertions: 0,
    totalDeletions: 0,
  };
}

describe("SupervisorRuntime Git watcher status invalidation", () => {
  afterEach(() => vi.useRealTimers());

  it("invalidates Files but retains Git caches for native ignore-only notifications", async () => {
    let changed: Parameters<ProjectWatcherClient["watch"]>[1] | undefined;
    const watch = vi
      .spyOn(ProjectWatcherClient.prototype, "watch")
      .mockImplementation((_root, onChanged) => {
        changed = onChanged;
        return { ready: Promise.resolve(), unsubscribe: () => {} };
      });
    const emit = vi.fn<(...args: unknown[]) => void>();
    const invalidateStatus = vi.fn<() => void>();
    const invalidateAllCaches = vi.fn<() => void>();
    const runtime = Object.assign(Object.create(SupervisorRuntime.prototype), {
      emit,
      gitService: { invalidateStatus },
      projectTreeService: { invalidateAllCaches },
    }) as { projectWatcher: ProjectWatcher };
    const watcher = runtime.projectWatcher;
    try {
      await watcher.watch("project-1", { kind: "posix", path: "/repo" });
      changed!("worktree", false);
      expect(invalidateStatus).not.toHaveBeenCalled();
      expect(invalidateAllCaches).toHaveBeenCalledOnce();
      expect(emit).toHaveBeenLastCalledWith({
        type: "project-tree-changed",
        projectId: "project-1",
        gitChanged: false,
      });
      changed!("worktree");
      expect(invalidateStatus).toHaveBeenCalledOnce();
      expect(invalidateAllCaches).toHaveBeenCalledTimes(2);
      expect(emit).toHaveBeenLastCalledWith({
        type: "project-tree-changed",
        projectId: "project-1",
      });
    } finally {
      await watcher.dispose();
      watch.mockRestore();
    }
  });

  it.each([
    { scope: "worktree" as const, paths: ["src/file.ts"], detail: "full" as const },
    { scope: "git" as const, paths: ["HEAD"], detail: "full" as const },
    { scope: "worktree" as const, paths: ["src/file.ts"], detail: "summary" as const },
    { scope: "git" as const, paths: ["HEAD"], detail: "summary" as const },
  ])(
    "starts a fresh $detail read after a $scope watcher event",
    async ({ scope, paths, detail }) => {
      vi.useFakeTimers();
      const location: ProjectLocation = {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/repo",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
      };
      const gitService = new GitService();
      const oldRead = deferred<GitStatusResult>();
      const freshRead = deferred<GitStatusResult>();
      const serviceInternals = gitService as unknown as {
        statusService: {
          computeStatus(location: ProjectLocation): Promise<GitStatusResult>;
          computeStatusSummary(location: ProjectLocation): Promise<GitStatusResult>;
        };
      };
      const compute = vi
        .spyOn(
          serviceInternals.statusService,
          detail === "summary" ? "computeStatusSummary" : "computeStatus",
        )
        .mockReturnValueOnce(oldRead.promise)
        .mockReturnValueOnce(freshRead.promise);
      let sendWatchEvent: Parameters<WslBridgeClient["watch"]>[2] | undefined;
      const watch = vi.fn<WslBridgeClient["watch"]>(async (_location, _options, onEvent) => {
        sendWatchEvent = onEvent;
        return { subscriptionId: "watch-1", unsubscribe: async () => undefined };
      });
      const wslClient = {
        readFile: async () => {
          throw new Error("No gitignore fixture");
        },
        stat: async () => ({
          stats: [{ path: "/repo/.git", exists: true, isDirectory: true }],
        }),
        watch,
      } as unknown as WslBridgeClient;
      let watcherRequest: Promise<GitStatusResult> | undefined;
      const emit = vi.fn<(...args: unknown[]) => void>(() => {
        watcherRequest = gitService.getStatus(location, detail);
      });
      const invalidateProjectTree = vi.fn<() => void>();
      const runtime = Object.create(SupervisorRuntime.prototype) as unknown as {
        emit: typeof emit;
        gitService: GitService;
        projectTreeService: { invalidateAllCaches: typeof invalidateProjectTree };
        _projectWatcher: ProjectWatcher | undefined;
        wslBridgeClient: WslBridgeClient | undefined;
        projectWatcher: ProjectWatcher;
      };
      runtime.emit = emit;
      runtime.gitService = gitService;
      runtime.projectTreeService = { invalidateAllCaches: invalidateProjectTree };
      runtime._projectWatcher = undefined;
      runtime.wslBridgeClient = wslClient;

      const oldRequest = gitService.getStatus(location, detail);
      expect(compute).toHaveBeenCalledOnce();

      const watcher = runtime.projectWatcher;
      await watcher.watch("project-1", location);
      await vi.waitFor(() => expect(watch).toHaveBeenCalledOnce());
      sendWatchEvent!({ subscriptionId: "watch-1", scope, paths });
      await vi.advanceTimersByTimeAsync(300);

      expect(watcherRequest).toBeDefined();
      expect(compute).toHaveBeenCalledTimes(2);
      oldRead.resolve(status("before-edit"));
      await oldRequest;

      const joinedFreshRequest = gitService.getStatus(location, detail);
      expect(compute).toHaveBeenCalledTimes(2);
      freshRead.resolve(status("after-edit"));
      await expect(watcherRequest).resolves.toMatchObject({ branch: "after-edit" });
      await joinedFreshRequest;
      expect(emit).toHaveBeenCalledWith({
        type: scope === "git" ? "git-changed" : "project-tree-changed",
        projectId: "project-1",
      });
      expect(invalidateProjectTree).toHaveBeenCalledTimes(scope === "worktree" ? 1 : 0);

      await watcher.dispose();
    },
  );
});

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

describe("SupervisorRuntime Windows launch shells", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("launches internal commands and automatic terminals without loading the Settings catalog", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    vi.stubEnv("Path", "C:\\automatic");
    const automatic = "C:\\automatic\\pwsh.exe";
    const explicit = "C:\\selected\\pwsh.exe";
    const existing = new Set([automatic, explicit]);
    const settings = {
      windowsInternalShellPath: WINDOWS_SHELL_AUTO,
      windowsShellPath: WINDOWS_SHELL_AUTO,
      windowsShellArguments: "-NoProfile",
    };
    const getCachedAvailableWindowsShells = vi.fn<() => never>(() => {
      throw new Error("Launch must not enumerate the Settings catalog");
    });
    const runtime = Object.create(SupervisorRuntime.prototype) as {
      sharedSettingsCache: { readFresh(): typeof settings };
      resolveLaunchWindowsPowerShell: ReturnType<typeof createWindowsPowerShellLaunchResolver>;
      getCachedAvailableWindowsShells: typeof getCachedAvailableWindowsShells;
      resolveWindowsPowerShell(): WindowsShellPreference;
      resolveWindowsShell(runtime?: "preferred" | "powershell"): WindowsShellPreference;
    };
    runtime.sharedSettingsCache = { readFresh: () => settings };
    runtime.resolveLaunchWindowsPowerShell = createWindowsPowerShellLaunchResolver(
      () => {
        throw new Error("Known launch hosts must not spawn executable discovery");
      },
      (path) => existing.has(path),
    );
    runtime.getCachedAvailableWindowsShells = getCachedAvailableWindowsShells;

    expect(runtime.resolveWindowsPowerShell()).toEqual({
      shell: automatic,
      kind: "pwsh",
      args: ["-NoLogo"],
    });
    settings.windowsInternalShellPath = explicit;
    expect(runtime.resolveWindowsShell("powershell").shell).toBe(explicit);
    expect(runtime.resolveWindowsShell()).toEqual({
      shell: automatic,
      kind: "pwsh",
      args: ["-NoLogo", "-NoProfile"],
    });
    existing.delete(explicit);
    expect(runtime.resolveWindowsPowerShell().shell).toBe(automatic);
    expect(getCachedAvailableWindowsShells).not.toHaveBeenCalled();
  });

  it("refreshes the complete Settings catalog and resets the launch selection", async () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    vi.stubEnv("Path", "C:\\older");
    const shells = [
      { path: "C:\\new\\pwsh.exe", kind: "pwsh" as const, version: "7.6.7" },
      { path: "C:\\older\\pwsh.exe", kind: "pwsh" as const, version: "7.4.6" },
      { path: "C:\\Windows\\System32\\cmd.exe", kind: "cmd" as const },
    ];
    const detectCatalog = vi
      .spyOn(shellPreference, "detectWindowsShells")
      .mockResolvedValue(shells);
    const previousResolver = createWindowsPowerShellLaunchResolver(
      () => undefined,
      (path) => path === "C:\\older\\pwsh.exe",
    );
    expect(previousResolver(WINDOWS_SHELL_AUTO)?.path).toBe("C:\\older\\pwsh.exe");
    const runtime = Object.create(SupervisorRuntime.prototype) as {
      availableWindowsShellsCache: { shells: typeof shells; ts: number };
      resolveLaunchWindowsPowerShell: ReturnType<typeof createWindowsPowerShellLaunchResolver>;
      getAvailableWindowsShells(): Promise<typeof shells>;
    };
    runtime.availableWindowsShellsCache = { shells: [], ts: 0 };
    runtime.resolveLaunchWindowsPowerShell = previousResolver;

    expect(await runtime.getAvailableWindowsShells()).toEqual(shells);
    expect(detectCatalog).toHaveBeenCalledOnce();
    const refreshedResolver = runtime.resolveLaunchWindowsPowerShell;
    expect(refreshedResolver).not.toBe(previousResolver);
    expect(await runtime.getAvailableWindowsShells()).toEqual(shells);
    expect(runtime.resolveLaunchWindowsPowerShell).toBe(refreshedResolver);
    expect(detectCatalog).toHaveBeenCalledOnce();
  });
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
