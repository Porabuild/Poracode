import type { BrowserWindow } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  // The reveal guard is one-way per process; every test starts from a fresh module.
  vi.resetModules();
});

function createWindow({ minimized = false, visible = true } = {}) {
  return {
    isMinimized: vi.fn<() => boolean>(() => minimized),
    isVisible: vi.fn<() => boolean>(() => visible),
    restore: vi.fn<() => void>(),
    show: vi.fn<() => void>(),
    focus: vi.fn<() => void>(),
  };
}

describe("showAndFocusWindow", () => {
  it("restores and reveals a minimized window, then focuses it", async () => {
    const { showAndFocusWindow } = await import("./showAndFocusWindow");
    const window = createWindow({ minimized: true, visible: false });

    showAndFocusWindow(window as unknown as BrowserWindow);

    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
  });

  it("only focuses a window that is already on screen", async () => {
    const { showAndFocusWindow } = await import("./showAndFocusWindow");
    const window = createWindow();

    showAndFocusWindow(window as unknown as BrowserWindow);

    expect(window.restore).not.toHaveBeenCalled();
    expect(window.show).not.toHaveBeenCalled();
    expect(window.focus).toHaveBeenCalledOnce();
  });

  it("brings nothing back once a quit took the UI off screen", async () => {
    const { keepWindowsHiddenForQuit, showAndFocusWindow } = await import("./showAndFocusWindow");
    const window = createWindow({ minimized: true, visible: false });
    keepWindowsHiddenForQuit();

    showAndFocusWindow(window as unknown as BrowserWindow);

    expect(window.restore).not.toHaveBeenCalled();
    expect(window.show).not.toHaveBeenCalled();
    expect(window.focus).not.toHaveBeenCalled();
  });
});
