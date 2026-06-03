import type { BrowserWindow } from "electron";

/**
 * Bring a window to the foreground: un-minimize, un-hide, then focus. Shared by
 * the second-instance handler, the `focusWindow` IPC, and the tray menu so the
 * restore/show/focus sequence stays consistent.
 */
export function showAndFocusWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (win.isMinimized()) {
    win.restore();
  }
  if (!win.isVisible()) {
    win.show();
  }
  win.focus();
}
