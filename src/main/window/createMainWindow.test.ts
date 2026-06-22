import { beforeEach, describe, expect, it, vi } from "vitest";

const installSessionPermissions = vi.hoisted(() => vi.fn<() => void>());
const dbGetState = vi.hoisted(() => vi.fn<() => string | null>(() => null));
const dbSetState = vi.hoisted(() => vi.fn<() => void>());
const setUserAgent = vi.hoisted(() => vi.fn<(userAgent: string) => void>());

let browserWindowOptions: Record<string, unknown> | null = null;
let webContentsHandlers: Record<string, (...args: never[]) => void> = {};

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
    on = vi.fn<() => void>();
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
  });

  it("applies the browser user agent to the window and sanitizes attached webviews", async () => {
    const { createMainWindow } = await import("./createMainWindow");
    const userAgent =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

    createMainWindow({
      title: "Lightcode",
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
});
