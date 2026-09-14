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
  backendRendererStreamChanged: createChannel("backendRendererStreamChanged"),
  backendSupervisorEventGap: createChannel("backendSupervisorEventGap"),
  /** Per-window generation-fenced direct-stream recovery barrier. */
  rendererStreamRecovery: createChannel("rendererStreamRecovery"),
} as const;

export const IPC_WINDOW_CHANNELS = {
  clientProcedureInvoke: createChannel("clientProcedureInvoke"),
  backendRendererStreamInfo: createChannel("backendRendererStreamInfo"),
  /** Per-window direct-stream ownership grant; main mints it for event.sender only. */
  rendererStreamOwnershipGrant: createChannel("rendererStreamOwnershipGrant"),
  quickComposerSubmit: createChannel("quickComposerWindowSubmit"),
  quickComposerDismiss: createChannel("quickComposerWindowDismiss"),
  quickComposerPickFiles: createChannel("quickComposerWindowPickFiles"),
  quickComposerMainReady: createChannel("quickComposerMainReady"),
  rendererReload: createChannel("rendererReload"),
} as const;
