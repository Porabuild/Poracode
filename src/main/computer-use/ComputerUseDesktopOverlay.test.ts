import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => {
  class BrowserWindow {
    static instances: BrowserWindow[] = [];
    readonly options: Record<string, unknown>;
    readonly handlers = new Map<string, () => void>();
    destroyed = false;
    visible = false;
    setAlwaysOnTop = vi.fn<(flag: boolean, level: string) => void>();
    setBounds = vi.fn<(bounds: unknown) => void>();
    setContentProtection = vi.fn<(enable: boolean) => void>();
    setIgnoreMouseEvents = vi.fn<(ignore: boolean) => void>();
    setVisibleOnAllWorkspaces = vi.fn<(visible: boolean, options?: unknown) => void>();
    showInactive = vi.fn<() => void>(() => {
      this.visible = true;
    });
    hide = vi.fn<() => void>(() => {
      this.visible = false;
    });
    destroy = vi.fn<() => void>(() => {
      this.destroyed = true;
      this.handlers.get("closed")?.();
    });
    loadURL = vi.fn<(url: string) => Promise<void>>(async () => undefined);

    constructor(options: Record<string, unknown>) {
      this.options = options;
      BrowserWindow.instances.push(this);
    }

    isDestroyed() {
      return this.destroyed;
    }

    isVisible() {
      return this.visible;
    }

    on(event: string, handler: () => void): void {
      this.handlers.set(event, handler);
    }
  }

  const shortcuts = new Map<string, () => void>();
  return {
    BrowserWindow,
    globalShortcut: {
      register: vi.fn<(accelerator: string, handler: () => void) => boolean>(
        (accelerator, handler) => {
          shortcuts.set(accelerator, handler);
          return true;
        },
      ),
      unregister: vi.fn<(accelerator: string) => boolean>((accelerator) =>
        shortcuts.delete(accelerator),
      ),
    },
    screen: {
      getAllDisplays: vi.fn<
        () => Array<{
          id: number;
          bounds: Record<string, number>;
          workArea: Record<string, number>;
        }>
      >(() => [
        {
          id: 1,
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          workArea: { x: 0, y: 32, width: 1920, height: 1048 },
        },
        {
          id: 2,
          bounds: { x: 1920, y: 0, width: 1280, height: 1024 },
          workArea: { x: 1920, y: 32, width: 1280, height: 992 },
        },
      ]),
      getDisplayMatching: vi.fn<
        (bounds: Record<string, number>) => {
          id: number;
          bounds: Record<string, number>;
        }
      >(() => ({ id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 1024 } })),
      screenToDipRect: vi.fn<
        (window: unknown, bounds: Record<string, number>) => Record<string, number>
      >((_window, bounds) => bounds),
      getPrimaryDisplay: vi.fn<() => { id: number; bounds: Record<string, number> }>(() => ({
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      })),
    },
    shortcuts,
  };
});

vi.mock("electron", () => ({
  BrowserWindow: electronMock.BrowserWindow,
  globalShortcut: electronMock.globalShortcut,
  screen: electronMock.screen,
}));

import {
  COMPUTER_USE_OVERLAY_RELEASE_DELAY_MS,
  ComputerUseDesktopOverlay,
} from "./ComputerUseDesktopOverlay";

describe("ComputerUseDesktopOverlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electronMock.BrowserWindow.instances.length = 0;
    electronMock.shortcuts.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("covers every display with a transparent click-through border during control", async () => {
    const overlay = new ComputerUseDesktopOverlay({
      onExit: vi.fn<(threadIds: string[]) => void>(),
    });

    overlay.setActivity({
      kind: "action",
      threadId: "thread-1",
      toolName: "click",
      delivery: "foreground",
      active: true,
    });
    await Promise.resolve();

    expect(electronMock.BrowserWindow.instances).toHaveLength(2);
    for (const window of electronMock.BrowserWindow.instances) {
      expect(window.options).toMatchObject({
        transparent: true,
        focusable: false,
        frame: false,
        title: "Poracode Computer Use Overlay",
      });
      expect(window.setIgnoreMouseEvents).toHaveBeenCalledWith(true);
      expect(window.setAlwaysOnTop).toHaveBeenCalledWith(true, "screen-saver");
      expect(window.setContentProtection).toHaveBeenCalledWith(true);
      expect(window.showInactive).toHaveBeenCalled();
      // The takeover border must frame the entire display, work area included.
      expect(window.setBounds).toHaveBeenLastCalledWith(expect.objectContaining({ y: 0 }));
      const overlayHtml = decodeURIComponent(window.loadURL.mock.calls[0]![0].split(",", 2)[1]!);
      expect(overlayHtml).toContain("inset 0 0 0 2px rgba(92, 167, 255, 0.6)");
      expect(overlayHtml).toContain("inset 0 0 48px rgba(92, 167, 255, 0.08)");
      expect(overlayHtml).toContain("Poracode using your computer | Esc to Exit");
      expect(overlayHtml).toContain("<title>Poracode Computer Use Overlay</title>");
      expect(overlayHtml).not.toContain("<button");
    }
    expect(electronMock.globalShortcut.register).toHaveBeenCalledWith(
      "Escape",
      expect.any(Function),
    );

    overlay.dispose();
  });

  it("shows only a top-center badge for background control", async () => {
    const overlay = new ComputerUseDesktopOverlay({
      onExit: vi.fn<(threadIds: string[]) => void>(),
    });

    overlay.setActivity({
      kind: "action",
      threadId: "thread-1",
      toolName: "click",
      delivery: "background",
      active: true,
    });
    overlay.setActivity({
      kind: "action",
      threadId: "thread-1",
      toolName: "click",
      delivery: "background",
      target: "Notepad",
      targetBounds: { x: 2100, y: 100, width: 800, height: 600 },
      active: false,
    });
    await Promise.resolve();

    expect(electronMock.screen.getDisplayMatching).toHaveBeenCalledWith({
      x: 2100,
      y: 100,
      width: 800,
      height: 600,
    });
    expect(electronMock.BrowserWindow.instances).toHaveLength(2);
    const [primaryOverlay, targetOverlay] = electronMock.BrowserWindow.instances;
    expect(primaryOverlay?.visible).toBe(false);
    expect(targetOverlay?.visible).toBe(true);
    expect(targetOverlay?.options).toMatchObject({ x: 1920, y: 0, width: 1280, height: 1024 });
    // Anchored to the work area so the top-center badge never covers the macOS
    // menu bar or the focused app's title bar.
    expect(targetOverlay?.setBounds).toHaveBeenLastCalledWith({
      x: 1920,
      y: 32,
      width: 1280,
      height: 992,
    });
    const overlayHtml = decodeURIComponent(
      targetOverlay!.loadURL.mock.calls.at(-1)![0].split(",", 2)[1]!,
    );
    expect(overlayHtml).toContain("Poracode is controlling Notepad in the background");
    expect(overlayHtml).toContain("<title>Poracode Computer Use Overlay</title>");
    expect(overlayHtml).toContain("top: 16px");
    expect(overlayHtml).toContain("left: 50%");
    expect(overlayHtml).toContain("transform: translateX(-50%)");
    expect(overlayHtml).not.toContain("bottom: 16px");
    expect(overlayHtml).not.toContain("inset 0 0 0 2px");
    expect(electronMock.shortcuts.has("Escape")).toBe(false);

    overlay.dispose();
  });

  it.runIf(process.platform === "win32")(
    "converts physical target bounds before matching a mixed-DPI Windows display",
    async () => {
      electronMock.screen.screenToDipRect.mockReturnValue({
        x: 1400,
        y: 67,
        width: 533,
        height: 400,
      });
      const overlay = new ComputerUseDesktopOverlay({
        onExit: vi.fn<(threadIds: string[]) => void>(),
      });

      overlay.setActivity({
        kind: "action",
        threadId: "thread-1",
        toolName: "click",
        delivery: "background",
        active: true,
      });
      overlay.setActivity({
        kind: "action",
        threadId: "thread-1",
        toolName: "click",
        delivery: "background",
        target: "Notepad",
        targetBounds: { x: 2100, y: 100, width: 800, height: 600 },
        active: false,
      });
      await Promise.resolve();

      expect(electronMock.screen.screenToDipRect).toHaveBeenCalledWith(null, {
        x: 2100,
        y: 100,
        width: 800,
        height: 600,
      });
      expect(electronMock.screen.getDisplayMatching).toHaveBeenCalledWith({
        x: 1400,
        y: 67,
        width: 533,
        height: 400,
      });

      overlay.dispose();
    },
  );

  it("ignores an aborted stale badge navigation", async () => {
    let rejectFirst: ((error: Error) => void) | undefined;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const overlay = new ComputerUseDesktopOverlay({
      onExit: vi.fn<(threadIds: string[]) => void>(),
    });

    overlay.setActivity({
      kind: "action",
      threadId: "thread-1",
      toolName: "click",
      delivery: "background",
      active: true,
    });
    const window = electronMock.BrowserWindow.instances[0]!;
    window.loadURL
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValue(undefined);
    window.loadURL.mockClear();
    overlay.setActivity({
      kind: "action",
      threadId: "thread-1",
      toolName: "click",
      delivery: "background",
      target: "Notepad",
      active: false,
    });
    overlay.setActivity({
      kind: "action",
      threadId: "thread-1",
      toolName: "click",
      delivery: "background",
      target: "Calculator",
      active: false,
    });

    rejectFirst?.(new Error("ERR_ABORTED"));
    await Promise.resolve();
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
    overlay.dispose();
  });

  it("keeps the border visible briefly across a burst of interactive actions", async () => {
    const overlay = new ComputerUseDesktopOverlay({
      onExit: vi.fn<(threadIds: string[]) => void>(),
    });
    overlay.setActivity({
      kind: "action",
      threadId: "thread-1",
      toolName: "click",
      delivery: "foreground",
      active: true,
    });
    await Promise.resolve();
    const windows = [...electronMock.BrowserWindow.instances];

    overlay.setActivity({
      kind: "action",
      threadId: "thread-1",
      toolName: "click",
      delivery: "foreground",
      active: false,
    });
    vi.advanceTimersByTime(COMPUTER_USE_OVERLAY_RELEASE_DELAY_MS - 1);
    expect(windows.every((window) => window.visible)).toBe(true);

    vi.advanceTimersByTime(1);
    expect(windows.every((window) => !window.visible)).toBe(true);

    overlay.dispose();
  });

  it("keeps the border visible for an enabled session until it is disabled", async () => {
    const overlay = new ComputerUseDesktopOverlay({
      onExit: vi.fn<(threadIds: string[]) => void>(),
    });
    overlay.setActivity({ kind: "session", threadId: "thread-1", active: true });
    await Promise.resolve();
    const windows = [...electronMock.BrowserWindow.instances];

    overlay.setActivity({
      kind: "action",
      threadId: "thread-1",
      toolName: "click",
      delivery: "foreground",
      active: true,
    });
    overlay.setActivity({
      kind: "action",
      threadId: "thread-1",
      toolName: "click",
      delivery: "foreground",
      active: false,
    });
    vi.advanceTimersByTime(COMPUTER_USE_OVERLAY_RELEASE_DELAY_MS);
    expect(windows.every((window) => window.visible)).toBe(true);

    overlay.setActivity({ kind: "session", threadId: "thread-1", active: false });
    expect(windows.every((window) => !window.visible)).toBe(true);

    overlay.dispose();
  });

  it("interrupts active threads when Escape returns control to the user", async () => {
    const onExit = vi.fn<(threadIds: string[]) => void>();
    const overlay = new ComputerUseDesktopOverlay({ onExit });
    overlay.setActivity({
      kind: "action",
      threadId: "thread-1",
      toolName: "click",
      delivery: "foreground",
      active: true,
    });
    await Promise.resolve();

    electronMock.shortcuts.get("Escape")?.();

    expect(onExit).toHaveBeenCalledWith(["thread-1"]);
    expect(electronMock.BrowserWindow.instances.every((window) => !window.visible)).toBe(true);
    expect(electronMock.globalShortcut.unregister).toHaveBeenCalledWith("Escape");

    overlay.dispose();
  });

  it("does not intercept Escape while the agent is sending a keypress", async () => {
    const overlay = new ComputerUseDesktopOverlay({
      onExit: vi.fn<(threadIds: string[]) => void>(),
    });
    overlay.setActivity({
      kind: "action",
      threadId: "thread-1",
      toolName: "press_key",
      delivery: "foreground",
      active: true,
    });
    await Promise.resolve();

    expect(electronMock.shortcuts.has("Escape")).toBe(false);

    overlay.setActivity({
      kind: "action",
      threadId: "thread-1",
      toolName: "press_key",
      delivery: "foreground",
      active: false,
    });
    expect(electronMock.shortcuts.has("Escape")).toBe(true);

    overlay.dispose();
  });

  it("stays active until overlapping interactive calls have both finished", async () => {
    const overlay = new ComputerUseDesktopOverlay({
      onExit: vi.fn<(threadIds: string[]) => void>(),
    });
    overlay.setActivity({
      kind: "action",
      threadId: "thread-1",
      toolName: "click",
      delivery: "foreground",
      active: true,
    });
    overlay.setActivity({
      kind: "action",
      threadId: "thread-1",
      toolName: "press_key",
      delivery: "foreground",
      active: true,
    });
    await Promise.resolve();
    const windows = [...electronMock.BrowserWindow.instances];

    overlay.setActivity({
      kind: "action",
      threadId: "thread-1",
      toolName: "click",
      delivery: "foreground",
      active: false,
    });
    vi.advanceTimersByTime(COMPUTER_USE_OVERLAY_RELEASE_DELAY_MS);
    expect(windows.every((window) => window.visible)).toBe(true);
    expect(electronMock.shortcuts.has("Escape")).toBe(false);

    overlay.setActivity({
      kind: "action",
      threadId: "thread-1",
      toolName: "press_key",
      delivery: "foreground",
      active: false,
    });
    expect(electronMock.shortcuts.has("Escape")).toBe(true);
    vi.advanceTimersByTime(COMPUTER_USE_OVERLAY_RELEASE_DELAY_MS);
    expect(windows.every((window) => !window.visible)).toBe(true);

    overlay.dispose();
  });
});
