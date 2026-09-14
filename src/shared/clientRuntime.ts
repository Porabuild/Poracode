import type {
  BackendRendererStreamInfo,
  RendererStreamOwnershipGrant,
  RendererStreamRecoveryBarrier,
  SupervisorEventGap,
} from "./backendHostProtocol";
import type { IpcProcedureName, PoracodeBridge, PoracodeInvokeBridge } from "./ipc";

// Version 5 added sequenced Electron supervisor-event fallback delivery.
// Version 6 added the supervisor-event-gap signal that makes desktop windows
// rebuild after the backend host shed queued IPC copies under backpressure.
// Version 8 added native quick-composer show events and a checked preload
// version. Version 9 stays RESERVED for the settings-authority activation
// (see .agents/docs/versioning.md); this milestone deliberately skips it.
// Version 10 is the per-window delivery-ownership boundary (V4 F7
// correction): the facade now requires the generation-fenced recovery-barrier
// listener and the per-window ownership grant. An older preload cannot honor
// recovery barriers, so pairing it with a version-10 renderer would silently
// strand the window on a stale cursor after socket loss — the version gate
// rejects that pairing loudly instead.
export const PORACODE_CLIENT_RUNTIME_VERSION = 10 as const;

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
  readonly clientRuntimeVersion: typeof PORACODE_CLIENT_RUNTIME_VERSION;
  invokeProcedure(name: IpcProcedureName, args: unknown[]): Promise<unknown>;
  getBackendRendererStreamInfo(): Promise<BackendRendererStreamInfo | null>;
  onBackendRendererStreamChanged(listener: (info: BackendRendererStreamInfo) => void): () => void;
  onSupervisorEventGap(listener: (gap: SupervisorEventGap) => void): () => void;
  /**
   * Generation-fenced recovery barrier for THIS window's direct-stream loss.
   * Required at facade version 10: a renderer that cannot honor it would
   * trust a cursor advanced past missing bulk after socket loss.
   */
  onRendererStreamRecovery(listener: (barrier: RendererStreamRecoveryBarrier) => void): () => void;
  /**
   * Direct-stream ownership grant for THIS window, minted by main from the
   * authoritative `event.sender.id`. Null when the mint failed — the window
   * then stays a fallback consumer and fences barriers by generation 0.
   */
  getRendererStreamOwnershipGrant(): Promise<RendererStreamOwnershipGrant | null>;
};
