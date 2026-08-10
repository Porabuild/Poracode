import { beforeEach, describe, expect, it, vi } from "vitest";

const installSessionPermissions = vi.hoisted(() => vi.fn<() => void>());
const dbGetState = vi.hoisted(() => vi.fn<() => string | null>(() => null));
const dbSetState = vi.hoisted(() => vi.fn<() => void>());
const setUserAgent = vi.hoisted(() => vi.fn<(userAgent: string) => void>());

let browserWindowOptions: Record<string, unknown> | null = null;
let webContentsHandlers: Record<string, (...args: never[]) => void> = {};
let windowHandlers: Record<string, (...args: never[]) => void> = {};

vi.mock("electron", () => ({
  BrowserWindow: class BrowserWindow {
    webContents = {
      session: {},
      send: vi.fn<() => void>(),
      openDevTools: vi.fn<() => void>(),
      setWindowOpenHandler: vi.fn<() => void>(),
      setUserAgent,
      on: vi.fn<(event: string, handler: (...args: never[]) => void) => void>((event, handler) => {
        webContentsHandlers[event] = handler;
      }),
    };

    constructor(options: Record<string, unknown>) {
      browserWindowOptions = options;
    }

    once = vi.fn<() => void>();
    on = vi.fn<(event: string, handler: (...args: never[]) => void) => void>((event, handler) => {
      windowHandlers[event] = handler;
    });
    isMaximized = vi.fn<() => boolean>(() => false);
    isDestroyed = vi.fn<() => boolean>(() => false);
    getNormalBounds = vi.fn<() => { x: number; y: number; width: number; height: number }>(() => ({
      x: 0,
      y: 0,
      width: 1460,
      height: 920,
    }));
    loadURL = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    loadFile = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    show = vi.fn<() => void>();
    maximize = vi.fn<() => void>();
  },
  screen: {
    getDisplayMatching: vi.fn<
      () => { workArea: { x: number; y: number; width: number; height: number } }
    >(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })),
  },
}));

vi.mock("../db", () => ({
  dbGetState,
  dbSetState,
}));

vi.mock("../browser/permissions", () => ({
  installSessionPermissions,
}));

describe("createMainWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browserWindowOptions = null;
    webContentsHandlers = {};
    windowHandlers = {};
  });

  it("applies the browser user agent to the window and sanitizes attached webviews", async () => {
    const { createMainWindow } = await import("./createMainWindow");
    const userAgent =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

    createMainWindow({
      state: { get: dbGetState, set: dbSetState },
      title: "Poracode",
      isDev: false,
      channel: "stable",
      preloadPath: "/tmp/preload.cjs",
      rendererHtmlPath: "/tmp/index.html",
      appVersion: "1.2.1",
      posthogEnableDev: false,
      posthogEnabled: false,
      posthogHost: "",
      posthogKey: "",
      sentryEnabled: false,
      windowChromeHeight: 32,
      browserUserAgent: userAgent,
      appearance: "dark",
      sidebarTranslucency: false,
      onClosed: vi.fn<() => void>(),
    });

    expect(setUserAgent).toHaveBeenCalledWith(userAgent);
    expect((browserWindowOptions?.webPreferences as { webviewTag?: boolean })?.webviewTag).toBe(
      true,
    );

    const webPreferences = {
      preload: "/tmp/unsafe.cjs",
      nodeIntegration: true,
      contextIsolation: false,
    };
    webContentsHandlers["will-attach-webview"]?.({} as never, webPreferences as never);

    expect(webPreferences.preload).toBeUndefined();
    expect(webPreferences.nodeIntegration).toBe(false);
    expect(webPreferences.contextIsolation).toBe(true);
  });

  it("supplies window-close intent only when the app does not prevent the close", async () => {
    const { createMainWindow } = await import("./createMainWindow");
    let preventClose = true;
    const onRendererProcessGone =
      vi.fn<
        (
          details: Electron.RenderProcessGoneDetails,
          intent: "app-shutdown" | "reload" | "window-close" | undefined,
        ) => void
      >();
    createMainWindow({
      state: { get: dbGetState, set: dbSetState },
      title: "Poracode",
      isDev: false,
      channel: "stable",
      preloadPath: "/tmp/preload.cjs",
      rendererHtmlPath: "/tmp/index.html",
      appVersion: "1.2.1",
      posthogEnableDev: false,
      posthogEnabled: false,
      posthogHost: "",
      posthogKey: "",
      sentryEnabled: false,
      windowChromeHeight: 32,
      browserUserAgent: "Poracode",
      appearance: "dark",
      sidebarTranslucency: false,
      onClosed: vi.fn<() => void>(),
      onClose(event) {
        if (preventClose) event.preventDefault();
      },
      onRendererProcessGone,
    });
    const killed = {
      reason: "killed",
      exitCode: 9,
    } satisfies Electron.RenderProcessGoneDetails;
    const closeEvent = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };

    windowHandlers.close?.(closeEvent as never);
    webContentsHandlers["render-process-gone"]?.({} as never, killed as never);
    preventClose = false;
    closeEvent.defaultPrevented = false;
    windowHandlers.close?.(closeEvent as never);
    webContentsHandlers["render-process-gone"]?.({} as never, killed as never);

    expect(onRendererProcessGone.mock.calls).toEqual([
      [killed, undefined],
      [killed, "window-close"],
    ]);
  });
});
