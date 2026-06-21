import type { LightcodeBridge } from "@/shared/ipc";

export function readBridge(): LightcodeBridge {
  return window.lightcode;
}

export function isWindows(): boolean {
  return readBridge().platform === "win32";
}

export function isMac(): boolean {
  return readBridge().platform === "darwin";
}

export function isDevApp(): boolean {
  return readBridge().isDev === true;
}

/**
 * True when the renderer runs against the remote-session bridge shim (the
 * mobile PWA paired to a desktop) instead of the local Electron bridge.
 * Desktop-only controls (system sleep, tray, agent installs, …) should be
 * hidden in that case — the shim swallows or rejects their bridge calls.
 */
export function isRemoteSession(): boolean {
  return typeof window !== "undefined" && window.lightcode?.appVersion === "remote";
}
