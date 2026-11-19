import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_EVENT_CHANNELS } from "@/shared/ipc";
import type { RemoteThreadCommand } from "@/shared/contracts";
import type { BackendNativeRequest } from "@/shared/backendHostProtocol";
import type { closeLocalPort, listLocalPorts } from "@/host/localPorts";

const hoisted = vi.hoisted(() => ({
  clientOptions: null as Record<string, unknown> | null,
  ensureMainWindow: vi.fn<() => void>(),
  openThreadFromTray: vi.fn<() => void>(),
  listLocalPorts: vi.fn<typeof listLocalPorts>(),
  closeLocalPort: vi.fn<typeof closeLocalPort>(),
  openExternal: vi.fn<(url: string) => Promise<void>>(),
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

vi.mock("./desktopAppWindows", () => ({
  ensureMainWindow: hoisted.ensureMainWindow,
  openThreadFromTray: hoisted.openThreadFromTray,
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
  showUserNotificationFallback: vi.fn<() => void>(),
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
    hoisted.ensureMainWindow.mockClear();
    hoisted.openThreadFromTray.mockClear();
    desktopApp.mainWindow = null;
    desktopApp.pendingThreadCommands.length = 0;
    desktopApp.isQuitting = false;
  });

  it("queues the command and creates the hidden window on demand with no main window", () => {
    createHost();

    expect(dispatchThreadCommand()).toBe(true);
    expect(desktopApp.pendingThreadCommands).toEqual([PAYLOAD]);
    expect(hoisted.ensureMainWindow).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("queues without creating the window while the app is quitting", () => {
    desktopApp.isQuitting = true;
    createHost();

    expect(dispatchThreadCommand()).toBe(true);
    expect(desktopApp.pendingThreadCommands).toEqual([PAYLOAD]);
    expect(hoisted.ensureMainWindow).not.toHaveBeenCalled();
  });

  it("sends directly to a live window when the queue is empty", () => {
    const send = vi.fn<() => void>();
    desktopApp.mainWindow = {
      isDestroyed: () => false,
      webContents: { send },
    } as never;
    createHost();

    expect(dispatchThreadCommand()).toBe(true);
    expect(send).toHaveBeenCalledWith(IPC_EVENT_CHANNELS.remoteThreadCommand, PAYLOAD);
    expect(desktopApp.pendingThreadCommands).toEqual([]);
    expect(hoisted.ensureMainWindow).not.toHaveBeenCalled();
  });
});
