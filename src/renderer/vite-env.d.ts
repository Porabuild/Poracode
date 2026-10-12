/// <reference types="vite/client" />

import type { ElectronHostBridge } from "@/shared/clientRuntime";
import type { PoracodeBridge } from "@/shared/ipc";

declare global {
  interface Window {
    poracode: PoracodeBridge;
    poracodeHost?: ElectronHostBridge;
  }
}
