import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import { IPC_EVENT_CHANNELS } from "@/shared/ipc";
import type { ShellStateStore } from "./backend/BackendStateStore";

const hoisted = vi.hoisted(() => ({
  createMainWindow: vi.fn<(options: { state: unknown }) => unknown>(),
}));
vi.mock("electron", () => ({
  app: {
    getPath: () => "C:/poracode-thread-return-test/userData",
    getVersion: () => "0.0.0",
    isPackaged: false,
    quit: () => {},
  },
  BrowserWindow: { fromWebContents: () => null },
  nativeTheme: { shouldUseDarkColors: true },
}));
vi.mock("./sleepInhibitor", () => ({
  createSleepInhibitor: () => ({ setActive: () => {}, dispose: () => {} }),
  createScreenLockInhibitor: () => ({ setActive: () => {}, dispose: () => {} }),
}));
vi.mock("./window/createMainWindow", () => ({ createMainWindow: hoisted.createMainWindow }));
vi.mock("./window/createQuickComposerWindow", () => ({
  createQuickComposerWindow: () => {},
  showQuickComposerWindow: () => {},
}));
vi.mock("./ipc/localHandlers", () => ({ showAddFilesDialog: async () => null }));
vi.mock("./diagnostics/sentry", () => ({ captureMainException: () => {} }));
vi.mock("./backend/managedLoopbackBootstrapPrewarm", () => ({
  prewarmManagedLoopbackBootstrap: () => {},
}));

import { desktopApp } from "./desktopAppState";
import { flushTrayThreadOpen, openThreadFromTray } from "./desktopAppWindows";
import { QuickComposerLifecycle } from "./window/quickComposerLifecycle";

function fakeWindow() {
  return {
    isDestroyed: () => false,
    isMinimized: () => false,
    isVisible: () => true,
    restore: () => {},
    show: () => {},
    focus: () => {},
    webContents: { on: () => {}, send: vi.fn<(channel: string, payload: unknown) => void>() },
  };
}

function attachLifecycle() {
  const lifecycle = new QuickComposerLifecycle({
    getMainWindow: () => desktopApp.mainWindow,
  } as unknown as ConstructorParameters<typeof QuickComposerLifecycle>[0]);
  desktopApp.quickComposerLifecycle = lifecycle;
  return lifecycle;
}

afterEach(() => {
  desktopApp.mainWindow = null;
  desktopApp.quickComposerLifecycle = null;
  desktopApp.pendingTrayThreadId = null;
  hoisted.createMainWindow.mockReset();
});

describe("returning a thread to the main window", () => {
  it("waits for a reloading main renderer before asking it to show the thread", () => {
    const lifecycle = attachLifecycle();
    const main = fakeWindow();
    desktopApp.mainWindow = main as unknown as BrowserWindow;
    lifecycle.markMainNotReady();

    openThreadFromTray("thread-a");
    expect(main.webContents.send).not.toHaveBeenCalled();

    lifecycle.handleMainReady();
    flushTrayThreadOpen();
    expect(main.webContents.send).toHaveBeenCalledExactlyOnceWith(
      IPC_EVENT_CHANNELS.threadOpenRequested,
      { threadId: "thread-a" },
    );
  });

  it("recreates a closed attach-mode main window on the attach shell state", () => {
    attachLifecycle();
    const recreated = fakeWindow();
    hoisted.createMainWindow.mockReturnValue(recreated);
    const shellState = { get: () => null, set: () => {} } as unknown as ShellStateStore;

    openThreadFromTray("thread-a", shellState);

    expect(hoisted.createMainWindow).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ state: shellState }),
    );
    // The new renderer is not ready yet; the thread waits for its ready ping.
    expect(recreated.webContents.send).not.toHaveBeenCalled();
    expect(desktopApp.pendingTrayThreadId).toBe("thread-a");
  });
});
