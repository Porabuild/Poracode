import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_EVENT_CHANNELS } from "@/shared/ipc";
import type { RemoteThreadCommand } from "@/shared/contracts";
import type { BackendNativeEvent, BackendNativeRequest } from "@/shared/backendHostProtocol";
import type { closeLocalPort, listLocalPorts } from "@/host/localPorts";

const hoisted = vi.hoisted(() => ({
  clientOptions: null as Record<string, unknown> | null,
  ensureReadyMainWindowForDesktopAction: vi.fn<(options: { show: boolean }) => Promise<unknown>>(
    async () => null,
  ),
  openThreadFromTray: vi.fn<() => void>(),
  syncRendererWindowPresence: vi.fn<() => void>(),
  listLocalPorts: vi.fn<typeof listLocalPorts>(),
  closeLocalPort: vi.fn<typeof closeLocalPort>(),
  openExternal: vi.fn<(url: string) => Promise<void>>(),
  readSharedSettingsFile: vi.fn<() => { notificationSound: boolean }>(() => ({
    notificationSound: true,
  })),
  showUserNotificationFallback: vi.fn<(...args: unknown[]) => boolean>(() => true),
  requestDesktopMemorySync: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    type: "not-started",
    message: "unavailable",
  })),
  requestDesktopProviderLogin: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    type: "not-started",
    message: "unavailable",
  })),
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn<() => string>(() => "C:/poracode-backend-host-test/userData"),
    isPackaged: false,
  },
  ipcMain: { handle: vi.fn<() => void>() },
  shell: { openExternal: hoisted.openExternal },
}));
vi.mock("@/host/localPorts", () => ({
  listLocalPorts: hoisted.listLocalPorts,
  closeLocalPort: hoisted.closeLocalPort,
}));
vi.mock("@/host/sharedSettingsFile", () => ({
  readSharedSettingsFile: hoisted.readSharedSettingsFile,
}));

vi.mock("./sleepInhibitor", () => ({
  createSleepInhibitor: vi.fn<() => { setActive(): void; dispose(): void }>(() => ({
    setActive: vi.fn<() => void>(),
    dispose: vi.fn<() => void>(),
  })),
  createScreenLockInhibitor: vi.fn<() => { setActive(): void; dispose(): void }>(() => ({
    setActive: vi.fn<() => void>(),
    dispose: vi.fn<() => void>(),
  })),
}));

vi.mock("./backend/BackendHostClient", () => ({
  BackendHostClient: class {
    constructor(options: Record<string, unknown>) {
      hoisted.clientOptions = options;
    }
  },
}));

vi.mock("./backend/BackendStateStore", () => ({
  BackendStateStore: class {
    preload = vi.fn<() => Promise<void>>(async () => {});
  },
}));

vi.mock("./backend/desktopBackendInitialize", () => ({
  buildDesktopBackendInitialize: vi.fn<() => void>(),
}));

vi.mock("./backend/desktopActionBroker", () => ({
  requestDesktopExperiment: vi.fn<() => Promise<unknown>>(async () => null),
  requestDesktopMemorySync: hoisted.requestDesktopMemorySync,
  requestDesktopProviderLogin: hoisted.requestDesktopProviderLogin,
}));

vi.mock("./desktopAppWindows", () => ({
  ensureReadyMainWindowForDesktopAction: hoisted.ensureReadyMainWindowForDesktopAction,
  openThreadFromTray: hoisted.openThreadFromTray,
  syncRendererWindowPresence: hoisted.syncRendererWindowPresence,
}));

vi.mock("./desktopAppShell", () => ({
  applyThreadActivity: vi.fn<() => void>(),
  handleSharedSettingsChanged: vi.fn<() => void>(),
  resetThreadActivity: vi.fn<() => void>(),
  updatePowerSaveBlocker: vi.fn<() => void>(),
}));

vi.mock("./diagnostics/sentry", () => ({
  captureMainException: vi.fn<() => void>(),
}));

vi.mock("./osNotifications", () => ({
  showOsNotification: vi.fn<() => void>(),
  showUserNotificationFallback: hoisted.showUserNotificationFallback,
}));

vi.mock("./window/sideChatWindows", () => ({
  getSideChatWindows: () => [],
}));

import { createDesktopBackendHost } from "./desktopAppBackendHost";
import { desktopApp } from "./desktopAppState";

const PAYLOAD: RemoteThreadCommand = {
  kind: "prepare-worktree",
  threadId: "t1",
  projectId: "p1",
  worktreePath: "C:/repo/wt",
};

function createHost(): void {
  createDesktopBackendHost({
    backendHostPath: "C:/poracode-backend-host-test/backendHost.cjs",
    initialize: vi.fn<() => void>() as never,
    getAutoUpdater: vi.fn<() => void>() as never,
    browser: {} as never,
  });
}

function dispatchThreadCommand(): unknown {
  const handler = hoisted.clientOptions?.handleNativeRequest as (
    request: BackendNativeRequest,
  ) => unknown;
  return handler({ operation: "dispatch-thread-command", payload: PAYLOAD });
}

it("opens URLs from live port rows and forwards the exact identity for close", async () => {
  createHost();
  const nativeRequest = hoisted.clientOptions?.handleNativeRequest as (
    request: BackendNativeRequest,
  ) => unknown;
  const identity = { port: 4173, address: "*", pid: 401, processStartedAt: "start-token" };
  const url = "http://127.0.0.1:4173";
  hoisted.listLocalPorts.mockResolvedValue({
    ports: [{ ...identity, url, canClose: true, processName: "node" }],
  });
  hoisted.closeLocalPort.mockResolvedValue({ closed: false });
  const ports = (
    command: Extract<BackendNativeRequest, { operation: "local-ports" }>["payload"]["command"],
  ) => nativeRequest({ operation: "local-ports", payload: { version: 1, command } });
  await expect(
    ports({ action: "open", port: 4173, address: "127.0.0.1", target: "system" }),
  ).resolves.toEqual({
    action: "open",
    opened: false,
  });
  expect(hoisted.openExternal).not.toHaveBeenCalled();
  await expect(
    ports({ action: "open", port: 4173, address: "*", target: "system" }),
  ).resolves.toEqual({
    action: "open",
    opened: true,
    url,
    target: "system",
  });
  expect(hoisted.openExternal).toHaveBeenCalledExactlyOnceWith(url);
  const createTab = vi.fn<NonNullable<typeof desktopApp.browserPanelManager>["createTab"]>();
  const previousPanel = desktopApp.browserPanelManager;
  desktopApp.browserPanelManager = { createTab } as unknown as NonNullable<typeof previousPanel>;
  try {
    await expect(
      ports({ action: "open", port: 4173, address: "*", target: "app" }),
    ).resolves.toEqual({
      action: "open",
      opened: true,
      url,
      target: "app",
    });
    expect(createTab).toHaveBeenCalledExactlyOnceWith({ url, activate: true, reveal: true });
  } finally {
    desktopApp.browserPanelManager = previousPanel;
  }
  await expect(ports({ action: "close", ...identity })).resolves.toEqual({
    action: "close",
    closed: false,
  });
  expect(hoisted.closeLocalPort).toHaveBeenCalledExactlyOnceWith(identity);
});

describe("dispatch-thread-command", () => {
  beforeEach(() => {
    hoisted.clientOptions = null;
    hoisted.ensureReadyMainWindowForDesktopAction.mockClear();
    hoisted.openThreadFromTray.mockClear();
    hoisted.syncRendererWindowPresence.mockClear();
    desktopApp.mainWindow = null;
    desktopApp.quickComposerLifecycle = null;
    desktopApp.pendingThreadCommands.length = 0;
    desktopApp.isQuitting = false;
  });

  it("returns false without waking or queueing when no main window exists", () => {
    createHost();

    expect(dispatchThreadCommand()).toBe(false);
    expect(desktopApp.pendingThreadCommands).toEqual([]);
    expect(hoisted.ensureReadyMainWindowForDesktopAction).not.toHaveBeenCalled();
  });

  it("queues commands while the main window exists but is still booting", () => {
    const send = vi.fn<() => void>();
    desktopApp.mainWindow = {
      isDestroyed: () => false,
      webContents: { send },
    } as never;
    desktopApp.quickComposerLifecycle = { isMainReady: () => false } as never;
    createHost();

    expect(dispatchThreadCommand()).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(desktopApp.pendingThreadCommands).toEqual([PAYLOAD]);
  });

  it("sends directly to a live ready window when the queue is empty", () => {
    const send = vi.fn<() => void>();
    desktopApp.mainWindow = {
      isDestroyed: () => false,
      webContents: { send },
    } as never;
    createHost();

    expect(dispatchThreadCommand()).toBe(true);
    expect(send).toHaveBeenCalledWith(IPC_EVENT_CHANNELS.remoteThreadCommand, PAYLOAD);
    expect(desktopApp.pendingThreadCommands).toEqual([]);
  });
});

describe("zero-window fallback behavior", () => {
  beforeEach(() => {
    hoisted.clientOptions = null;
    hoisted.showUserNotificationFallback.mockClear();
    hoisted.readSharedSettingsFile.mockReset().mockReturnValue({ notificationSound: true });
    hoisted.ensureReadyMainWindowForDesktopAction.mockReset().mockResolvedValue(null);
    hoisted.requestDesktopMemorySync.mockClear();
    hoisted.requestDesktopProviderLogin.mockClear();
    hoisted.syncRendererWindowPresence.mockClear();
    desktopApp.mainWindow = null;
    desktopApp.poracodePaths = { settingsPath: "/tmp/settings.json" } as never;
  });

  it("honors notificationSound setting in zero-window user-notification fallback", () => {
    createHost();
    const onNativeEvent = hoisted.clientOptions?.onNativeEvent as (
      event: BackendNativeEvent,
    ) => void;
    const notification = {
      threadId: "t1",
      category: "done" as const,
      projectName: "Proj",
      threadTitle: "Title",
      status: "finished" as const,
    };

    hoisted.readSharedSettingsFile.mockReturnValueOnce({ notificationSound: true });
    onNativeEvent({ type: "user-notification", notification });
    expect(hoisted.showUserNotificationFallback).toHaveBeenLastCalledWith(
      notification,
      expect.any(Function),
      hoisted.openThreadFromTray,
      { silent: false },
    );

    hoisted.readSharedSettingsFile.mockReturnValueOnce({ notificationSound: false });
    onNativeEvent({ type: "user-notification", notification });
    expect(hoisted.showUserNotificationFallback).toHaveBeenLastCalledWith(
      notification,
      expect.any(Function),
      hoisted.openThreadFromTray,
      { silent: true },
    );
  });

  it("wakes the main window lazily (hidden vs visible) for desktop-brokered actions", async () => {
    const fakeWindow = { isDestroyed: () => false };
    hoisted.ensureReadyMainWindowForDesktopAction.mockResolvedValue(fakeWindow);
    createHost();
    const nativeRequest = hoisted.clientOptions?.handleNativeRequest as (
      request: BackendNativeRequest,
    ) => Promise<unknown>;

    await nativeRequest({ operation: "memory-sync", payload: { version: 1 } as never });
    expect(hoisted.ensureReadyMainWindowForDesktopAction).toHaveBeenCalledWith({ show: false });
    expect(hoisted.requestDesktopMemorySync).toHaveBeenCalledWith(fakeWindow, { version: 1 });

    await nativeRequest({
      operation: "provider-login",
      payload: { version: 1, provider: "claude" } as never,
    });
    expect(hoisted.ensureReadyMainWindowForDesktopAction).toHaveBeenCalledWith({ show: true });
    expect(hoisted.requestDesktopProviderLogin).toHaveBeenCalledWith(fakeWindow, {
      version: 1,
      provider: "claude",
    });
  });

  it("re-syncs renderer window presence after backend host reset", () => {
    createHost();
    const onReset = hoisted.clientOptions?.onReset as () => void;
    onReset();
    expect(hoisted.syncRendererWindowPresence).toHaveBeenCalledOnce();
  });
});
