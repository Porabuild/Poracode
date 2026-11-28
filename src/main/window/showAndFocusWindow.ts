import type { BrowserWindow } from "electron";

let hiddenForQuit = false;

/**
 * Bring nothing back once a quit took the UI off screen. Every caller of
 * {@link showAndFocusWindow} — a notification click, a thread asked for by an
 * agent, the tray — would otherwise reveal a window whose backend is retiring.
 * One-way: it is only ever set by the quit that hides the UI.
 */
export function keepWindowsHiddenForQuit(): void {
  hiddenForQuit = true;
}

/** True once a quit took the UI off screen; nothing may be shown again then. */
export function windowsKeptHiddenForQuit(): boolean {
  return hiddenForQuit;
}

/**
 * Reveal and focus a window: un-minimize it, make it visible if it was hidden
 * (e.g. closed to tray), then give it focus. Callers are responsible for
 * guarding against a destroyed window before calling.
 */
export function showAndFocusWindow(window: BrowserWindow): void {
  if (hiddenForQuit) return;
  if (window.isMinimized()) {
    window.restore();
  }
  if (!window.isVisible()) {
    window.show();
  }
  window.focus();
}
