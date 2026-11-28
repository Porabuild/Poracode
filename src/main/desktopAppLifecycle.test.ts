import type { BrowserWindow } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// One stable `app` for the whole file: the electron mock is evaluated once per
// file, so modules re-imported after `vi.resetModules()` keep this instance.
const mocks = vi.hoisted(() => {
  const order: string[] = [];
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const app = {
    getPath: () => "/poracode-lifecycle-test/userData",
    quit: vi.fn<() => void>(() => void order.push("quit")),
    on(event: string, listener: (event: unknown) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    },
    emit(event: string, payload: unknown) {
      for (const listener of [...(listeners.get(event) ?? [])]) listener(payload);
    },
    removeAllListeners() {
      listeners.clear();
    },
  };
  return {
    app,
    order,
    concealAppUiForQuit: vi.fn<() => void>(),
    ensureMainWindow: vi.fn<() => BrowserWindow>(),
    saveWindowBounds: vi.fn<() => void>(),
    showAndFocusWindow: vi.fn<() => void>(),
  };
});

vi.mock("electron", () => ({ app: mocks.app, safeStorage: {} }));
vi.mock("./tray", () => ({ createTray: vi.fn<() => unknown>() }));
vi.mock("./sleepInhibitor", () => ({
  createSleepInhibitor: () => ({ setActive: vi.fn<() => void>(), dispose: vi.fn<() => void>() }),
  createScreenLockInhibitor: () => ({
    setActive: vi.fn<() => void>(),
    dispose: vi.fn<() => void>(),
  }),
}));
vi.mock("@/backend/ownership/nativeSecret", () => ({ HostCredentialAdoptionService: class {} }));
vi.mock("./diagnostics/sentry", () => ({ captureMainException: vi.fn<() => void>() }));
vi.mock("./window/createMainWindow", () => ({ saveWindowBounds: mocks.saveWindowBounds }));
vi.mock("./window/quitUiConceal", () => ({ concealAppUiForQuit: mocks.concealAppUiForQuit }));
vi.mock("./window/showAndFocusWindow", () => ({ showAndFocusWindow: mocks.showAndFocusWindow }));
vi.mock("./desktopAppWindows", () => ({
  ensureMainWindow: mocks.ensureMainWindow,
  openThreadFromTray: vi.fn<() => void>(),
  toggleQuickComposerWindow: vi.fn<() => void>(),
}));

let registerDesktopAppLifecycle: (typeof import("./desktopAppLifecycle"))["registerDesktopAppLifecycle"];
let desktopApp: (typeof import("./desktopAppState"))["desktopApp"];

beforeEach(async () => {
  vi.resetModules();
  mocks.app.removeAllListeners();
  mocks.app.quit.mockReset();
  mocks.order.length = 0;
  mocks.concealAppUiForQuit.mockReset().mockImplementation(() => void mocks.order.push("conceal"));
  mocks.saveWindowBounds.mockReset().mockImplementation(() => void mocks.order.push("bounds"));
  mocks.showAndFocusWindow.mockReset();
  mocks.ensureMainWindow.mockReset();
  ({ registerDesktopAppLifecycle } = await import("./desktopAppLifecycle"));
  ({ desktopApp } = await import("./desktopAppState"));
  desktopApp.isQuitting = false;
  desktopApp.mainWindow = { isDestroyed: () => false } as unknown as BrowserWindow;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function registerLifecycle(): void {
  registerDesktopAppLifecycle({
    backendHost: { disposeAsync: async () => undefined },
    shellState: { close: async () => undefined },
    ssh: { dispose: async () => undefined },
    disposeBrowserGateway: async () => undefined,
    autoUpdater: { initialize: () => undefined },
    supervisorPath: "/unused/supervisor.cjs",
  } as unknown as Parameters<typeof registerDesktopAppLifecycle>[0]);
}

function quitEvent(): { preventDefault: ReturnType<typeof vi.fn<() => void>> } {
  return { preventDefault: vi.fn<() => void>() };
}

describe("before-quit", () => {
  it("takes the UI off screen first and quits only after the shutdown joined", async () => {
    registerLifecycle();
    const event = quitEvent();

    mocks.app.emit("before-quit", event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(desktopApp.isQuitting).toBe(true);
    expect(mocks.order).toEqual(["bounds", "conceal"]);
    await vi.waitFor(() => expect(mocks.app.quit).toHaveBeenCalledOnce());
    expect(mocks.order).toEqual(["bounds", "conceal", "quit"]);
  });

  it("still quits when a shutdown participant never settles", async () => {
    vi.useFakeTimers();
    try {
      registerLifecycle();
      mocks.app.emit("before-quit", quitEvent());
      await vi.advanceTimersByTimeAsync(10_000);
      expect(mocks.concealAppUiForQuit).toHaveBeenCalledOnce();
      expect(mocks.app.quit).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("still exits when a teardown step throws after the UI left", async () => {
    const { captureMainException } = await import("./diagnostics/sentry");
    registerLifecycle();
    const failure = new Error("tray teardown failed");
    desktopApp.tray = {
      destroy: () => {
        throw failure;
      },
    } as unknown as typeof desktopApp.tray;

    mocks.app.emit("before-quit", quitEvent());

    await vi.waitFor(() => expect(mocks.app.quit).toHaveBeenCalledOnce());
    expect(mocks.order).toEqual(["bounds", "conceal", "quit"]);
    expect(captureMainException).toHaveBeenCalledExactlyOnceWith(failure, {
      "poracode.feature_area": "main-shutdown",
    });
  });

  it("still exits when the last step before the exit fails", async () => {
    const { captureMainException } = await import("./diagnostics/sentry");
    registerLifecycle();
    const failure = new Error("diagnostics teardown failed");
    desktopApp.performanceDiagnostics = {
      stop: () => Promise.reject(failure),
    } as unknown as typeof desktopApp.performanceDiagnostics;

    mocks.app.emit("before-quit", quitEvent());

    await vi.waitFor(() => expect(mocks.app.quit).toHaveBeenCalledOnce());
    expect(mocks.order).toEqual(["bounds", "conceal", "quit"]);
    expect(captureMainException).toHaveBeenCalledExactlyOnceWith(failure, {
      "poracode.feature_area": "main-shutdown",
    });
  });

  it("runs its cleanup once across the repeated before-quit of a deferred exit", async () => {
    registerLifecycle();
    mocks.app.emit("before-quit", quitEvent());
    await vi.waitFor(() => expect(mocks.app.quit).toHaveBeenCalledOnce());
    const again = quitEvent();

    // The second app.quit() re-emits before-quit; it must pass through.
    mocks.app.emit("before-quit", again);

    expect(again.preventDefault).not.toHaveBeenCalled();
    expect(mocks.concealAppUiForQuit).toHaveBeenCalledOnce();
    expect(mocks.saveWindowBounds).toHaveBeenCalledOnce();
  });
});

describe("activate", () => {
  it("ignores a Dock click while the app is quitting", () => {
    registerLifecycle();
    desktopApp.isQuitting = true;

    mocks.app.emit("activate", undefined);

    expect(mocks.showAndFocusWindow).not.toHaveBeenCalled();
    expect(mocks.ensureMainWindow).not.toHaveBeenCalled();
  });

  it("brings the main window back while the app is running", () => {
    registerLifecycle();
    mocks.app.emit("activate", undefined);

    expect(mocks.showAndFocusWindow).toHaveBeenCalledExactlyOnceWith(desktopApp.mainWindow);
  });
});
