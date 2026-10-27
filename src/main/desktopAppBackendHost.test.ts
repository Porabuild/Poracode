import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_EVENT_CHANNELS } from "@/shared/ipc";
import type { RemoteThreadCommand } from "@/shared/contracts";
import type { BackendNativeRequest } from "@/shared/backendHostProtocol";

const hoisted = vi.hoisted(() => ({
  clientOptions: null as Record<string, unknown> | null,
  ensureMainWindow: vi.fn<() => void>(),
  openThreadFromTray: vi.fn<() => void>(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn<() => string>(() => "C:/poracode-backend-host-test/userData"),
    isPackaged: false,
  },
  ipcMain: { handle: vi.fn<() => void>() },
}));

vi.mock("./sleepInhibitor", () => ({
  createSleepInhibitor: vi.fn<() => { setActive(): void; dispose(): void }>(() => ({
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
