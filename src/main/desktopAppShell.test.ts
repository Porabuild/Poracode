import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NativeThreadActivityChange } from "@/shared/backendHostProtocol";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";

const hoisted = vi.hoisted(() => {
  const state = {
    poracodePaths: {
      baseDir: "/tmp/poracode-shell-test",
      settingsPath: "/tmp/poracode-shell-test/settings.json",
    } as { baseDir: string; settingsPath: string } | null,
    workingThreads: new Set<string>(),
    sleepInhibitor: {
      setActive: vi.fn<(active: boolean) => void>(),
      dispose: vi.fn<() => void>(),
    },
    computerUseWakeLock: {
      setEnabled: vi.fn<(enabled: boolean) => void>(),
    },
    hostServices: null as { applyBrowserAllowFlags(settings: SharedSettings): void } | null,
  };
  return {
    state,
    readSharedSettingsFile: vi.fn<(path: string) => SharedSettings>(),
    syncWindowsStartupRegistration: vi.fn<() => void>(),
    shouldStartMinimized: vi.fn<() => boolean>(() => false),
    readOrCreateSafeStorageSecretKey: vi.fn<() => string>(() => "unused-test-key"),
    configureSecretStorageKey: vi.fn<(key: string) => void>(),
    captureMainException: vi.fn<() => void>(),
    installLocalFileProtocolHandler: vi.fn<() => void>(),
    installPickerProtocolHandler: vi.fn<() => void>(),
    startUsageLoginCookieMirror: vi.fn<() => void>(),
  };
});

vi.mock("electron", () => ({
  app: { isPackaged: false, getPath: vi.fn<() => string>(() => "/tmp/poracode-shell-test") },
  session: {
    fromPartition: vi.fn<() => { setUserAgent: (agent: string) => void }>(() => ({
      setUserAgent: vi.fn<() => void>(),
    })),
  },
}));

vi.mock("./desktopAppState", () => ({
  desktopApp: hoisted.state,
  isDev: false,
  requirePoracodePaths: () => hoisted.state.poracodePaths,
}));

vi.mock("@/host/sharedSettingsFile", () => ({
  readSharedSettingsFile: hoisted.readSharedSettingsFile,
}));

vi.mock("./startupSettings", () => ({
  syncWindowsStartupRegistration: hoisted.syncWindowsStartupRegistration,
  shouldStartMinimized: hoisted.shouldStartMinimized,
}));

vi.mock("./secretStorageKey", () => ({
  readOrCreateSafeStorageSecretKey: hoisted.readOrCreateSafeStorageSecretKey,
}));

vi.mock("@/shared/secretStorage", () => ({
  configureSecretStorageKey: hoisted.configureSecretStorageKey,
}));

vi.mock("./diagnostics/sentry", () => ({
  captureMainException: hoisted.captureMainException,
}));

vi.mock("./windowsJobObject", () => ({
  WindowsJobObjectManager: class WindowsJobObjectManager {},
}));

vi.mock("./attachments/localFiles", () => ({
  installLocalFileProtocolHandler: hoisted.installLocalFileProtocolHandler,
}));

vi.mock("./browser", () => ({
  installPickerProtocolHandler: hoisted.installPickerProtocolHandler,
}));

vi.mock("./usageLogin/UsageLoginCookieMirror", () => ({
  startUsageLoginCookieMirror: hoisted.startUsageLoginCookieMirror,
}));

function settings(overrides: Partial<SharedSettings> = {}): SharedSettings {
  return { ...defaultSharedSettings, ...overrides };
}

function activity(threadId: string, active: boolean): NativeThreadActivityChange {
  return { threadId, active };
}

async function loadShell(): Promise<typeof import("./desktopAppShell")> {
  return import("./desktopAppShell");
}

beforeEach(() => {
  vi.resetModules();
  hoisted.state.poracodePaths = {
    baseDir: "/tmp/poracode-shell-test",
    settingsPath: "/tmp/poracode-shell-test/settings.json",
  };
  hoisted.state.workingThreads = new Set<string>();
  hoisted.state.hostServices = null;
});

describe("desktopAppShell committed settings cache", () => {
  it("seeds the cache from native-shell startup and never re-reads on thread events", async () => {
    hoisted.readSharedSettingsFile.mockReturnValue(settings({ preventSleep: "while-working" }));
    const shell = await loadShell();

    shell.prepareDesktopNativeShell();

    expect(hoisted.readSharedSettingsFile).toHaveBeenCalledTimes(1);

    shell.applyThreadActivity([activity("t1", true), activity("t2", true)]);
    shell.applyThreadActivity([activity("t1", false)]);
    shell.updatePowerSaveBlocker();

    expect(hoisted.readSharedSettingsFile).toHaveBeenCalledTimes(1);
    expect(hoisted.state.sleepInhibitor.setActive).toHaveBeenLastCalledWith(true);
  });

  it("falls back to one read when a reaction runs before the shell seeds the cache", async () => {
    hoisted.readSharedSettingsFile.mockReturnValue(settings({ preventSleep: "always" }));
    const shell = await loadShell();

    shell.updatePowerSaveBlocker();
    shell.updatePowerSaveBlocker();

    expect(hoisted.readSharedSettingsFile).toHaveBeenCalledTimes(1);
    expect(hoisted.state.sleepInhibitor.setActive).toHaveBeenLastCalledWith(true);
  });

  it("applies settings commits and makes unchanged thread-state events no-ops", async () => {
    const shell = await loadShell();

    shell.handleSharedSettingsChanged(
      settings({ preventSleep: "while-working", computerUseKeepAwake: true }),
    );
    expect(hoisted.state.sleepInhibitor.setActive).toHaveBeenCalledTimes(1);
    expect(hoisted.state.sleepInhibitor.setActive).toHaveBeenLastCalledWith(false);
    expect(hoisted.state.computerUseWakeLock.setEnabled).toHaveBeenCalledTimes(1);
    expect(hoisted.state.computerUseWakeLock.setEnabled).toHaveBeenLastCalledWith(true);

    // The first working thread moves the derived value -> one apply.
    shell.applyThreadActivity([activity("t1", true)]);
    expect(hoisted.state.sleepInhibitor.setActive).toHaveBeenCalledTimes(2);
    expect(hoisted.state.sleepInhibitor.setActive).toHaveBeenLastCalledWith(true);

    // More working threads and repeats change the aggregate but not the
    // derived value, so nothing reaches the native surfaces again.
    shell.applyThreadActivity([activity("t2", true), activity("t1", true), activity("t3", false)]);
    expect(hoisted.state.sleepInhibitor.setActive).toHaveBeenCalledTimes(2);
    expect(hoisted.state.computerUseWakeLock.setEnabled).toHaveBeenCalledTimes(1);

    shell.applyThreadActivity([activity("t1", false), activity("t2", false)]);
    expect(hoisted.state.sleepInhibitor.setActive).toHaveBeenCalledTimes(3);
    expect(hoisted.state.sleepInhibitor.setActive).toHaveBeenLastCalledWith(false);
  });

  it("recalculates the sleep aggregate when a settings commit changes the policy", async () => {
    const shell = await loadShell();

    shell.handleSharedSettingsChanged(
      settings({ preventSleep: "while-working", computerUseKeepAwake: true }),
    );
    expect(hoisted.state.sleepInhibitor.setActive).toHaveBeenLastCalledWith(false);

    shell.handleSharedSettingsChanged(
      settings({ preventSleep: "always", computerUseKeepAwake: false }),
    );
    expect(hoisted.state.sleepInhibitor.setActive).toHaveBeenLastCalledWith(true);
    expect(hoisted.state.computerUseWakeLock.setEnabled).toHaveBeenLastCalledWith(false);

    shell.handleSharedSettingsChanged(
      settings({
        preventSleep: "while-remote-access",
        remoteAccessEnabled: false,
        computerUseKeepAwake: true,
      }),
    );
    expect(hoisted.state.sleepInhibitor.setActive).toHaveBeenLastCalledWith(false);
    expect(hoisted.state.computerUseWakeLock.setEnabled).toHaveBeenLastCalledWith(true);

    shell.handleSharedSettingsChanged(
      settings({ preventSleep: "while-remote-access", remoteAccessEnabled: true }),
    );
    expect(hoisted.state.sleepInhibitor.setActive).toHaveBeenLastCalledWith(true);
  });

  it("clears the working set on reset so no stale active flag survives a restart", async () => {
    hoisted.readSharedSettingsFile.mockReturnValue(settings({ preventSleep: "while-working" }));
    const shell = await loadShell();

    shell.applyThreadActivity([activity("t1", true), activity("t2", true)]);
    expect(hoisted.state.workingThreads.size).toBe(2);
    expect(hoisted.state.sleepInhibitor.setActive).toHaveBeenLastCalledWith(true);

    shell.resetThreadActivity();

    expect(hoisted.state.workingThreads.size).toBe(0);
    expect(hoisted.state.sleepInhibitor.setActive).toHaveBeenLastCalledWith(false);
  });

  it("keeps the no-paths (attach) fallback on working threads and the default keep-awake", async () => {
    hoisted.state.poracodePaths = null;
    const shell = await loadShell();
    hoisted.state.workingThreads.add("t1");

    shell.updatePowerSaveBlocker();

    expect(hoisted.readSharedSettingsFile).not.toHaveBeenCalled();
    expect(hoisted.state.sleepInhibitor.setActive).toHaveBeenLastCalledWith(true);
    expect(hoisted.state.computerUseWakeLock.setEnabled).toHaveBeenLastCalledWith(true);
  });
});
