import { isMac, isWindows } from "@/renderer/bridge";

/**
 * Electron owns a native titlebar overlay / hidden-inset window controls.
 * The desktop web client and PWA render inside browser chrome, so they must
 * not reserve that inset even when the paired host is macOS or Windows.
 */
export function hasNativeWindowChrome(): boolean {
  return typeof window !== "undefined" && Boolean(window.poracodeHost);
}

/** Hidden-inset traffic lights exist only in the Electron macOS window. */
export function hasMacWindowChrome(): boolean {
  return isMac() && hasNativeWindowChrome();
}

/** titleBarOverlay window buttons exist only in the Electron Windows window. */
export function hasWindowsWindowChrome(): boolean {
  return isWindows() && hasNativeWindowChrome();
}
