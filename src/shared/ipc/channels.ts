import { createChannel } from "./core";

export const PORACODE_WINDOW_KINDS = ["main", "browserExtract", "quickComposer"] as const;
export type PoracodeWindowKind = (typeof PORACODE_WINDOW_KINDS)[number];

export const IPC_EVENT_CHANNELS = {
  supervisorEvent: createChannel("supervisorEvent"),
  updateStatus: createChannel("updateStatus"),
  browserEvent: createChannel("browserEvent"),
  remoteThreadCommand: createChannel("remoteThreadCommand"),
  remoteAccessPairingChanged: createChannel("remoteAccessPairingChanged"),
  sharedSettingsChanged: createChannel("sharedSettingsChanged"),
  projectStateChanged: createChannel("projectStateChanged"),
  gitStateChanged: createChannel("gitStateChanged"),
  userNotification: createChannel("userNotification"),
  prWatchMerged: createChannel("prWatchMerged"),
  prWatchStatus: createChannel("prWatchStatus"),
  threadOpenRequested: createChannel("threadOpenRequested"),
  quickComposerSubmit: createChannel("quickComposerSubmit"),
  quickComposerDismissRequested: createChannel("quickComposerDismissRequested"),
  quickComposerShown: createChannel("quickComposerShown"),
  backendSupervisorEventGap: createChannel("backendSupervisorEventGap"),
  /**
   * Backend reset (V5 2.5): the desktop-IPC relay sequence space restarts
   * with a new backend child, so renderer windows drop their dedupe cursor
   * and rebuild subscribed state.
   */
  backendSupervisorReset: createChannel("backendSupervisorReset"),
} as const;

export const IPC_WINDOW_CHANNELS = {
  clientProcedureInvoke: createChannel("clientProcedureInvoke"),
  /** Off-main remote HTTP bridge admission (window-scoped native channel). */
  remoteHttpBridgeOpen: createChannel("remoteHttpBridgeOpen"),
  /** Main-side cancel fallback before a renderer's request port attaches. */
  remoteHttpBridgeCancel: createChannel("remoteHttpBridgeCancel"),
  /** Per-request port delivery; only `WebContents.postMessage` can transfer it. */
  remoteHttpBridgePort: createChannel("remoteHttpBridgePort"),
  /**
   * Standalone-attach bootstrap (additive, process-lifetime): main resolves
   * to the authenticated owner endpoint + fresh pairing URL, or null on the
   * managed-local path. Same-build only; never persisted.
   */
  standaloneAttachInfo: createChannel("standaloneAttachInfo"),
  quickComposerSubmit: createChannel("quickComposerWindowSubmit"),
  quickComposerDismiss: createChannel("quickComposerWindowDismiss"),
  quickComposerPickFiles: createChannel("quickComposerWindowPickFiles"),
  quickComposerMainReady: createChannel("quickComposerMainReady"),
  rendererReload: createChannel("rendererReload"),
} as const;
