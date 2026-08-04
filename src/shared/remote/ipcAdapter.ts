import type {
  ControlThreadGoalPayload,
  ProjectNotes,
  PrWatchInput,
  PrWatchKey,
  ResizeTerminalPayload,
  ResolveThreadServerRequestPayload,
  SendThreadInputPayload,
  SetPendingSteerPayload,
  WriteTerminalPayload,
} from "../contracts";
import type { IpcProcedurePayload } from "../ipc";
import type { RemoteDesktopClient } from "./client";
import type { RemoteProcedureOwner } from "./procedures";

export const REMOTE_IPC_ADAPTER_SPECS = {
  dbGetProjectNotes: "project",
  dbSetProjectNotes: "project",
  getPrWatch: "project",
  checkPrWatch: "project",
  upsertPrWatch: "project",
  deletePrWatch: "project",
  dbGetThreadRuntimeItemsPage: "thread",
  dbTruncateThreadRuntimeAfter: "thread",
  sendThreadInput: "thread",
  interruptThread: "thread",
  controlThreadGoal: "thread",
  setPendingSteer: "thread",
  clearPendingSteer: "thread",
  resolveThreadServerRequest: "thread",
  writeTerminal: "terminal",
  resizeTerminal: "terminal",
} as const satisfies Record<string, RemoteProcedureOwner>;

export type RemoteIpcAdapterProcedureName = keyof typeof REMOTE_IPC_ADAPTER_SPECS;

export function isRemoteIpcAdapterProcedure(
  procedure: string,
): procedure is RemoteIpcAdapterProcedureName {
  return Object.hasOwn(REMOTE_IPC_ADAPTER_SPECS, procedure);
}

type RemoteIpcAdapterClient = Pick<
  RemoteDesktopClient,
  | "projectNotes"
  | "setProjectNotes"
  | "getPrWatch"
  | "checkPrWatch"
  | "upsertPrWatch"
  | "deletePrWatch"
  | "threadRuntimeItemsPage"
  | "truncateThreadRuntimeAfter"
  | "sendThreadInput"
  | "interruptThread"
  | "controlThreadGoal"
  | "setPendingSteer"
  | "clearPendingSteer"
  | "resolveRequest"
  | "writeTerminal"
  | "resizeTerminal"
>;

/** Shared translation from Electron IPC semantics to remote domain calls. */
export function invokeRemoteIpcProcedure(
  client: RemoteIpcAdapterClient,
  procedure: RemoteIpcAdapterProcedureName,
  payload: unknown,
): Promise<unknown> {
  switch (procedure) {
    case "dbGetProjectNotes":
      return client.projectNotes(String((payload as { readonly projectId: string }).projectId));
    case "dbSetProjectNotes":
      return client.setProjectNotes(payload as ProjectNotes);
    case "getPrWatch":
      return client.getPrWatch(payload as PrWatchKey);
    case "checkPrWatch":
      return client.checkPrWatch(payload as PrWatchKey);
    case "upsertPrWatch":
      return client.upsertPrWatch(payload as PrWatchInput);
    case "deletePrWatch":
      return client.deletePrWatch(payload as PrWatchKey);
    case "dbGetThreadRuntimeItemsPage":
      return client.threadRuntimeItemsPage(
        payload as Parameters<RemoteDesktopClient["threadRuntimeItemsPage"]>[0],
      );
    case "dbTruncateThreadRuntimeAfter":
      return client.truncateThreadRuntimeAfter(
        payload as Parameters<RemoteDesktopClient["truncateThreadRuntimeAfter"]>[0],
      );
    case "sendThreadInput":
      return client.sendThreadInput(payload as SendThreadInputPayload);
    case "interruptThread":
      return client.interruptThread(
        String((payload as IpcProcedurePayload<"interruptThread">).threadId),
      );
    case "controlThreadGoal":
      return client.controlThreadGoal(payload as ControlThreadGoalPayload);
    case "setPendingSteer":
      return client.setPendingSteer(payload as SetPendingSteerPayload);
    case "clearPendingSteer":
      return client.clearPendingSteer(
        String((payload as IpcProcedurePayload<"clearPendingSteer">).threadId),
      );
    case "resolveThreadServerRequest":
      return client.resolveRequest(payload as ResolveThreadServerRequestPayload);
    case "writeTerminal":
      return client.writeTerminal(payload as WriteTerminalPayload);
    case "resizeTerminal":
      return client.resizeTerminal(payload as ResizeTerminalPayload);
  }
}
