import { afterEach, describe, expect, it, vi } from "vitest";
import { WINDOWS_SHELL_AUTO } from "@/shared/settings";
import type { SessionRuntime } from "./runtime/sessionTypes";
import * as shellPreference from "./shellPreference";
import {
  createWindowsPowerShellLaunchResolver,
  type WindowsShellPreference,
} from "./shellPreference";
import { SupervisorRuntime } from "./supervisorRuntime";

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

  it("refreshes the complete Settings catalog and resets the launch selection", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    vi.stubEnv("Path", "C:\\older");
    const shells = [
      { path: "C:\\new\\pwsh.exe", kind: "pwsh" as const, version: "7.6.7" },
      { path: "C:\\older\\pwsh.exe", kind: "pwsh" as const, version: "7.4.6" },
      { path: "C:\\Windows\\System32\\cmd.exe", kind: "cmd" as const },
    ];
    const detectCatalog = vi.spyOn(shellPreference, "detectWindowsShells").mockReturnValue(shells);
    const previousResolver = createWindowsPowerShellLaunchResolver(
      () => undefined,
      (path) => path === "C:\\older\\pwsh.exe",
    );
    expect(previousResolver(WINDOWS_SHELL_AUTO)?.path).toBe("C:\\older\\pwsh.exe");
    const runtime = Object.create(SupervisorRuntime.prototype) as {
      availableWindowsShellsCache: { shells: typeof shells; ts: number };
      resolveLaunchWindowsPowerShell: ReturnType<typeof createWindowsPowerShellLaunchResolver>;
      getAvailableWindowsShells(): typeof shells;
    };
    runtime.availableWindowsShellsCache = { shells: [], ts: 0 };
    runtime.resolveLaunchWindowsPowerShell = previousResolver;

    expect(runtime.getAvailableWindowsShells()).toEqual(shells);
    expect(detectCatalog).toHaveBeenCalledOnce();
    const refreshedResolver = runtime.resolveLaunchWindowsPowerShell;
    expect(refreshedResolver).not.toBe(previousResolver);
    expect(runtime.getAvailableWindowsShells()).toEqual(shells);
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
