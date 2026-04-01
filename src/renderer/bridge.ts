import type { LightcodeBridge } from "../shared/ipc";

export function readBridge(): LightcodeBridge {
  return window.lightcode;
}

export function isWindows(): boolean {
  return readBridge().platform === "win32";
}

export function isMac(): boolean {
  return readBridge().platform === "darwin";
}
