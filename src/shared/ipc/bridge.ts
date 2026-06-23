import type { LightcodeChannel } from "../channel";
import { createChannel } from "./core";
import {
  ipcProcedureMap,
  type IpcProcedureName,
  type IpcProcedurePayload,
  type IpcProcedureResult,
  type MainLocalProcedureName,
  type SupervisorProcedureName,
} from "./procedureMap";
import type { BrowserEvent, SupervisorEvent, UpdateStatus } from "./events";

export type LightcodeWindowKind = "main" | "browserExtract";

type ProcedureArgs<Name extends IpcProcedureName> =
  (typeof ipcProcedureMap)[Name]["__types"]["args"];

export type LightcodeInvokeBridge = {
  [Name in IpcProcedureName]: (...args: ProcedureArgs<Name>) => Promise<IpcProcedureResult<Name>>;
};

export type LightcodeBridge = LightcodeInvokeBridge & {
  platform: NodeJS.Platform;
  appVersion: string;
  arch: string;
  chromeVersion: string;
  isDev: boolean;
  windowKind: LightcodeWindowKind;
  channel: LightcodeChannel;
  electronVersion: string;
  nodeVersion: string;
  posthogEnableDev: boolean;
  posthogEnabled: boolean;
  posthogHost: string;
  posthogKey: string;
  sentryEnabled: boolean;
  getDroppedFilePaths(files: File[]): string[];
  onSupervisorEvent(listener: (event: SupervisorEvent) => void): () => void;
  onUpdateStatus(listener: (status: UpdateStatus) => void): () => void;
  onBrowserEvent(listener: (event: BrowserEvent) => void): () => void;
};

export function createInvokeBridge(
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>,
): LightcodeInvokeBridge {
  const bridge = {} as LightcodeInvokeBridge;
  const names = Object.keys(ipcProcedureMap) as IpcProcedureName[];
  for (const name of names) {
    const procedure = ipcProcedureMap[name];
    (bridge as Record<IpcProcedureName, unknown>)[name] = (...args: unknown[]) =>
      invoke(procedure.channel, ...args);
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

export const IPC_EVENT_CHANNELS = {
  supervisorEvent: createChannel("supervisorEvent"),
  updateStatus: createChannel("updateStatus"),
  browserEvent: createChannel("browserEvent"),
} as const;
