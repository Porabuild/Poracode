import type { LightcodeBridge } from "../shared/ipc";

export function readBridge(): LightcodeBridge {
  return window.lightcode;
}

export function isWindows(): boolean {
  return navigator.userAgent.includes("Windows");
}
