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
  backendRendererStreamChanged: createChannel("backendRendererStreamChanged"),
} as const;

export const IPC_WINDOW_CHANNELS = {
  clientProcedureInvoke: createChannel("clientProcedureInvoke"),
  backendRendererStreamInfo: createChannel("backendRendererStreamInfo"),
  quickComposerSubmit: createChannel("quickComposerWindowSubmit"),
  quickComposerDismiss: createChannel("quickComposerWindowDismiss"),
  quickComposerPickFiles: createChannel("quickComposerWindowPickFiles"),
  quickComposerMainReady: createChannel("quickComposerMainReady"),
  rendererReload: createChannel("rendererReload"),
} as const;
