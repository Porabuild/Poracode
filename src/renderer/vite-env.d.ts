/// <reference types="vite/client" />

import type { LightcodeBridge } from "../shared/ipc";

declare global {
  interface Window {
    lightcode: LightcodeBridge;
  }
}
