import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => {
  const window = {
    webContents: {
      session: {},
      setUserAgent: vi.fn<(value: string) => void>(),
      setWindowOpenHandler: vi.fn<(handler: (...args: unknown[]) => unknown) => void>(),
      on: vi.fn<(...args: unknown[]) => void>(),
    },
    setVisibleOnAllWorkspaces: vi.fn<(visible: boolean, options: unknown) => void>(),
    once: vi.fn<(...args: unknown[]) => void>(),
    on: vi.fn<(...args: unknown[]) => void>(),
    loadURL: vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined),
    loadFile: vi.fn<(path: string) => Promise<void>>().mockResolvedValue(undefined),
    isDestroyed: vi.fn<() => boolean>().mockReturnValue(false),
    getBounds: vi
      .fn<() => { x: number; y: number; width: number; height: number }>()
      .mockReturnValue({ x: 120, y: 80, width: 560, height: 470 }),
    setBounds: vi.fn<(bounds: unknown, animate: boolean) => void>(),
    isMinimized: vi.fn<() => boolean>().mockReturnValue(false),
    isVisible: vi.fn<() => boolean>().mockReturnValue(false),
    show: vi.fn<() => void>(),
    focus: vi.fn<() => void>(),
  };
  return {
    BrowserWindow: vi.fn<(options: unknown) => typeof window>(function BrowserWindowMock(
      _options: unknown,
    ) {
      return window;
    }),
    screen: {
      getCursorScreenPoint: vi.fn<() => { x: number; y: number }>(() => ({ x: 100, y: 100 })),
      getDisplayNearestPoint: vi.fn<
        () => { workArea: { x: number; y: number; width: number; height: number } }
      >(() => ({ workArea: { x: 0, y: 0, width: 3440, height: 1400 } })),
      getAllDisplays: vi.fn<
        () => Array<{ workArea: { x: number; y: number; width: number; height: number } }>
      >(() => [{ workArea: { x: 0, y: 0, width: 3440, height: 1400 } }]),
    },
    window,
  };
});

vi.mock("electron", () => ({
  BrowserWindow: electronMock.BrowserWindow,
  screen: electronMock.screen,
}));
vi.mock("../browser/permissions", () => ({
  installSessionPermissions: vi.fn<(session: unknown) => void>(),
}));

import {
  createQuickComposerWindow,
  isQuickComposerBoundsVisible,
  resolveQuickComposerBounds,
  showQuickComposerWindow,
} from "./createQuickComposerWindow";

describe("quick composer window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    electronMock.window.getBounds.mockReturnValue({ x: 120, y: 80, width: 560, height: 470 });
    electronMock.window.isDestroyed.mockReturnValue(false);
    electronMock.window.isVisible.mockReturnValue(false);
  });

  it("places the composer bottom-center with room above for its menus", () => {
    expect(resolveQuickComposerBounds({ x: 0, y: 0, width: 3440, height: 1400 })).toEqual({
      x: 1440,
      y: 678,
      width: 560,
      height: 470,
    });
  });

  it("keeps a user-dragged position and only recenters an offscreen window", () => {
    showQuickComposerWindow(electronMock.window as never);
    expect(electronMock.window.setBounds).not.toHaveBeenCalled();

    electronMock.window.getBounds.mockReturnValue({ x: 5000, y: 5000, width: 560, height: 470 });
    showQuickComposerWindow(electronMock.window as never);
    expect(electronMock.window.setBounds).toHaveBeenCalledWith(
      resolveQuickComposerBounds({ x: 0, y: 0, width: 3440, height: 1400 }),
      false,
    );
  });

  it("requires at least a 50px visible grip on one display", () => {
    const displays = [{ x: 0, y: 0, width: 1920, height: 1080 }];
    expect(
      isQuickComposerBoundsVisible({ x: 1870, y: 900, width: 520, height: 430 }, displays),
    ).toBe(true);
    expect(
      isQuickComposerBoundsVisible({ x: 1871, y: 900, width: 520, height: 430 }, displays),
    ).toBe(false);
  });

  it("creates a frameless transparent window that remains natively draggable", () => {
    createQuickComposerWindow({
      title: "Poracode",
      isDev: false,
      channel: "stable",
      preloadPath: "preload.cjs",
      rendererHtmlPath: "index.html",
      appVersion: "1.0.0",
      posthogEnableDev: false,
      posthogEnabled: false,
      posthogHost: "",
      posthogKey: "",
      sentryEnabled: false,
      browserUserAgent: "Poracode",
      onClosed: vi.fn<() => void>(),
    });

    expect(electronMock.BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        frame: false,
        transparent: true,
        movable: true,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
      }),
    );
  });
});
