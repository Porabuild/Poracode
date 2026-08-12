import type { BackendRendererStreamInfo } from "./backendHostProtocol";
import type { IpcProcedureName, PoracodeBridge, PoracodeInvokeBridge } from "./ipc";

// Version 5 adds sequenced Electron supervisor-event fallback delivery.
export const PORACODE_CLIENT_RUNTIME_VERSION = 5 as const;

export type ClientHost = "electron" | "browser";
export type ClientSurface = "adaptive";
export type ClientTransport = "electron-backend-host" | "remote-http-websocket";

export interface ClientCapabilities {
  readonly localBackend: boolean;
  readonly manageRemoteEnvironments: boolean;
  readonly nativeAppUpdates: boolean;
  readonly nativeBrowserWebContents: boolean;
  readonly nativeShell: boolean;
  readonly nativeSsh: boolean;
}

/**
 * Versioned renderer host contract. Domain procedures and native-shell
 * capabilities are separate so the canonical UI can run without Electron.
 */
export interface ClientRuntime {
  readonly version: typeof PORACODE_CLIENT_RUNTIME_VERSION;
  readonly host: ClientHost;
  readonly surface: ClientSurface;
  readonly transport: ClientTransport;
  readonly capabilities: ClientCapabilities;
  readonly procedures: PoracodeInvokeBridge;
  readonly native: PoracodeNativeBridge;
}

export type PoracodeNativeBridge = Omit<PoracodeBridge, keyof PoracodeInvokeBridge>;

/** Minimal Electron preload surface. It owns native shell IPC, never agents or SQLite. */
export type ElectronHostBridge = PoracodeNativeBridge & {
  invokeProcedure(name: IpcProcedureName, args: unknown[]): Promise<unknown>;
  getBackendRendererStreamInfo(): Promise<BackendRendererStreamInfo | null>;
  onBackendRendererStreamChanged(listener: (info: BackendRendererStreamInfo) => void): () => void;
};
