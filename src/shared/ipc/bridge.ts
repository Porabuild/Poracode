import type { PoracodeChannel } from "../channel";
import type { RemoteThreadCommand } from "../contracts";
import type { RemoteAccessPairingInfo } from "../remote";
import type { SharedSettings } from "../settings";
import type { UserNotification } from "../threadNotification";
import type { GitStatePatch } from "../gitState";
import type { PoracodeWindowKind } from "./channels";
import {
  ipcProcedureMap,
  type IpcProcedureName,
  type IpcProcedurePayload,
  type IpcProcedureResult,
  type MainLocalProcedureName,
  type SupervisorProcedureName,
} from "./procedureMap";
import type {
  BrowserEvent,
  PrWatchMergedEvent,
  PrWatchStatusEvent,
  ProjectStateChangedEvent,
  SupervisorEvent,
  ThreadOpenRequestedEvent,
  UpdateStatus,
} from "./events";
import type { QuickComposerSubmission } from "./schemas";

export {
  IPC_EVENT_CHANNELS,
  IPC_WINDOW_CHANNELS,
  PORACODE_WINDOW_KINDS,
  type PoracodeWindowKind,
} from "./channels";

type ProcedureArgs<Name extends IpcProcedureName> =
  (typeof ipcProcedureMap)[Name]["__types"]["args"];

export type PoracodeInvokeBridge = {
  [Name in IpcProcedureName]: (...args: ProcedureArgs<Name>) => Promise<IpcProcedureResult<Name>>;
};

export type PoracodeBridge = PoracodeInvokeBridge & {
  platform: NodeJS.Platform;
  appVersion: string;
  arch: string;
  chromeVersion: string;
  isDev: boolean;
  windowKind: PoracodeWindowKind;
  channel: PoracodeChannel;
  /**
   * Host user home directory (`os.homedir()`). Used to resolve Grok session
   * media paths (`~/.grok/sessions/…`) for chat markdown images. Optional so
   * remote/mobile bridge shims can omit it.
   */
  homeDir?: string;
  electronVersion: string;
  nodeVersion: string;
  posthogEnableDev: boolean;
  posthogEnabled: boolean;
  posthogHost: string;
  posthogKey: string;
  sentryEnabled: boolean;
  getDroppedFilePaths(files: File[]): string[];
  onSupervisorEvent(
    listener: (event: SupervisorEvent, rendererSequence?: number) => void,
  ): () => void;
  onUpdateStatus(listener: (status: UpdateStatus) => void): () => void;
  onBrowserEvent(listener: (event: BrowserEvent) => void): () => void;
  /** Thread-metadata mutations issued by paired browser clients. */
  onRemoteThreadCommand(listener: (command: RemoteThreadCommand) => void): () => void;
  /** Active remote-access code or paired-device state changed in main. */
  onRemoteAccessPairingChanged(listener: (info: RemoteAccessPairingInfo) => void): () => void;
  /** Shared settings rewritten outside this renderer (e.g. by a remote client). */
  onSharedSettingsChanged(listener: (settings: SharedSettings) => void): () => void;
  onProjectStateChanged(listener: (event: ProjectStateChangedEvent) => void): () => void;
  onGitStateChanged(listener: (patch: GitStatePatch) => void): () => void;
  onUserNotification(listener: (notification: UserNotification) => void): () => void;
  onPrWatchMerged(listener: (event: PrWatchMergedEvent) => void): () => void;
  /** Live PR state observed by the PR-watch loop, so watched PRs stay fresh. */
  onPrWatchStatus(listener: (event: PrWatchStatusEvent) => void): () => void;
  onThreadOpenRequested(listener: (event: ThreadOpenRequestedEvent) => void): () => void;
  submitQuickComposer(submission: QuickComposerSubmission): Promise<void>;
  dismissQuickComposer(): Promise<void>;
  pickQuickComposerFiles(): Promise<string[] | null>;
  notifyQuickComposerMainReady(): Promise<void>;
  reloadRenderer(): Promise<void>;
  onQuickComposerSubmit(listener: (submission: QuickComposerSubmission) => void): () => void;
  onQuickComposerDismissRequested(listener: () => void): () => void;
};

export function createInvokeBridge(
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>,
): PoracodeInvokeBridge {
  return createProcedureBridge((name, args) => {
    const procedure = ipcProcedureMap[name];
    return invoke(procedure.channel, ...args);
  });
}

/** Builds every typed procedure method while preserving its canonical name. */
export function createProcedureBridge(
  invoke: (name: IpcProcedureName, args: unknown[]) => Promise<unknown>,
): PoracodeInvokeBridge {
  const bridge = {} as PoracodeInvokeBridge;
  const names = Object.keys(ipcProcedureMap) as IpcProcedureName[];
  for (const name of names) {
    (bridge as Record<IpcProcedureName, unknown>)[name] = (...args: unknown[]) =>
      invoke(name, args);
  }
  return bridge;
}

export function parseIpcProcedureArgs<Name extends IpcProcedureName>(
  name: Name,
  args: unknown[],
): IpcProcedurePayload<Name> {
  const procedure = ipcProcedureMap[name];
  return (procedure.parseArgs as (...args: unknown[]) => IpcProcedurePayload<Name>)(...args);
}

export type MainLocalIpcHandlerMap = {
  [Name in MainLocalProcedureName]: (
    payload: IpcProcedurePayload<Name>,
  ) => Promise<IpcProcedureResult<Name>> | IpcProcedureResult<Name>;
};

export type SupervisorIpcHandlerMap = {
  [Name in SupervisorProcedureName]: (
    payload: IpcProcedurePayload<Name>,
  ) => Promise<IpcProcedureResult<Name>> | IpcProcedureResult<Name>;
};

export function defineMainLocalIpcHandlers<THandlers extends MainLocalIpcHandlerMap>(
  handlers: THandlers,
): THandlers {
  return handlers;
}

export function defineSupervisorIpcHandlers<THandlers extends SupervisorIpcHandlerMap>(
  handlers: THandlers,
): THandlers {
  return handlers;
}
