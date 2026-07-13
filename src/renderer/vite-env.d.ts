/// <reference types="vite/client" />

import type { PoracodeBridge } from "@/shared/ipc";

declare global {
  interface Window {
    poracode: PoracodeBridge;
  }
}
