import type { StandaloneAttachInfo } from "./standaloneAttach";
import type {
  BackendRendererStreamInfo,
  RendererStreamOwnershipGrant,
  RendererStreamRecoveryBarrier,
  SupervisorEventGap,
} from "./backendHostProtocol";
import type { IpcProcedureName, PoracodeBridge, PoracodeInvokeBridge } from "./ipc";
import type {
  RemoteHttpBridgeCancelRequest,
  RemoteHttpBridgeOpenRequest,
  RemoteHttpBridgeOpenResult,
} from "./remote/httpBridgeProtocol";
import { REMOTE_HTTP_BRIDGE_VERSION } from "./remote/httpBridgeProtocol";

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
// Version 11 is the off-main remote HTTP bridge boundary (V4 F8): the preload
// must expose the versioned bridge marker plus open/cancel and forward the
// per-request `MessagePort` into the main world. A version-10 preload cannot
// deliver request ports, so the renderer's remote HTTP transport has no
// fallback and the version gate rejects the pairing loudly.
// Version 12 is the settings-authority activation boundary (Gates 2-3 batch 1):
// the renderer procedure map gains the settings-transaction procedures
// (`settingsTransactionMutate`/`settingsTransactionSnapshot`). The preload
// invoke surface is generic and needs no new API, but renderer bundles and
// preloads must move in lockstep with the procedure map, so the gate rejects a
// version-11 preload instead of letting its older bundle disagree about the
// available settings procedures. See .agents/docs/versioning.md.
// Version 13 is the bounded thread-list hydration boundary (Gate 4 hazard #3):
// the renderer procedure map gains the additive main-local procedure
// `dbGetThreadsPage` (cursor-paginated, project-scoped counterpart of
// `dbGetThreads`). The preload invoke surface stays generic, but renderer
// bundles and preloads must move in lockstep with the procedure map, so the
// gate rejects a version-12 preload instead of letting an older bundle
// disagree about which db procedures exist. No persisted state, remote wire,
// or backend-host version change; the new procedure is an additive name inside
// the existing envelopes.
export const PORACODE_CLIENT_RUNTIME_VERSION = 13 as const;

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
  /**
   * Frame-set version of the off-main remote HTTP bridge. Required at facade
   * version 11: the remote transport itself is port-based, so a preload that
   * cannot deliver request ports must fail the facade gate instead of silently
   * routing full response bodies through main.
   */
  readonly remoteHttpBridgeVersion: typeof REMOTE_HTTP_BRIDGE_VERSION;
  /** Admit one remote HTTP request; main replies with the generation it minted. */
  openRemoteHttpBridge(request: RemoteHttpBridgeOpenRequest): Promise<RemoteHttpBridgeOpenResult>;
  /** Cancel fallback for a request whose per-request port has not attached yet. */
  cancelRemoteHttpBridge(request: RemoteHttpBridgeCancelRequest): Promise<void>;
  /**
   * Standalone-attach bootstrap (additive, facade stays 11): present only in
   * Electron builds that can be a client of an already-running headless
   * owner. Resolves to the authenticated owner endpoint + fresh pairing URL,
   * or null when this launch follows the managed-local path. Absence on an
   * older preload means managed-local. Process-lifetime only, never persisted.
   */
  getStandaloneAttachInfo?(): Promise<StandaloneAttachInfo | null>;
};
