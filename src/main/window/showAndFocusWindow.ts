import type { BrowserWindow } from "electron";

/**
 * Reveal and focus a window: un-minimize it, make it visible if it was hidden
 * (e.g. closed to tray), then give it focus. Callers are responsible for
 * guarding against a destroyed window before calling.
 */
export function showAndFocusWindow(window: BrowserWindow): void {
  if (window.isMinimized()) {
    window.restore();
  }
  if (!window.isVisible()) {
    window.show();
  }
  window.focus();
}
