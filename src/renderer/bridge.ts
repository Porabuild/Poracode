import type { LightcodeBridge } from "../shared/ipc";

export function readBridge(): LightcodeBridge {
  return window.lightcode;
}
