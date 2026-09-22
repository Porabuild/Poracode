import type {
  ControlThreadGoalPayload,
  ProjectNotes,
  PrWatchAgentSync,
  PrWatchInput,
  PrWatchKey,
  ResizeTerminalPayload,
  ResolveThreadServerRequestPayload,
  ScheduledTaskInput,
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
  syncPrWatchAgent: "project",
  dbGetThreadRuntimeItemsPage: "thread",
  dbTruncateThreadRuntimeAfter: "thread",
  // R1: the bounded thread-history derived reads. Each maps onto the EXISTING
  // bounded `/history` route (goal item, context usage) plus the `ct1.`
  // older-turn walk — never onto a raw/unbounded database read. A walk that
  // would exceed its budget refuses typed instead of returning a partial tail
  // as complete.
  dbGetLatestThreadGoalItem: "thread",
  dbGetThreadCompletedTurns: "thread",
  dbGetThreadContextUsage: "thread",
  revertCheckpoint: "thread",
  sendThreadInput: "thread",
  interruptThread: "thread",
  controlThreadGoal: "thread",
  setPendingSteer: "thread",
  clearPendingSteer: "thread",
  resolveThreadServerRequest: "thread",
  writeTerminal: "terminal",
  resizeTerminal: "terminal",
  // V6 B.2: schedules already have HTTP; the renderer procedure is the same
  // registry call the PWA remote bridge uses. Owner `desktop` routes the
  // device-local rows to the host this runtime is attached to (managed
  // loopback, attach desktop, or paired browser host) — one data plane.
  getSchedules: "desktop",
  createSchedule: "desktop",
  updateSchedule: "desktop",
  deleteSchedule: "desktop",
  runScheduleNow: "desktop",
  getScheduleRuns: "desktop",
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
  | "syncPrWatchAgent"
  | "threadRuntimeItemsPage"
  | "truncateThreadRuntimeAfter"
  | "latestThreadGoalItem"
  | "threadCompletedTurns"
  | "threadContextUsage"
  | "checkpointRevert"
  | "sendThreadInput"
  | "interruptThread"
  | "controlThreadGoal"
  | "setPendingSteer"
  | "clearPendingSteer"
  | "resolveRequest"
  | "writeTerminal"
  | "resizeTerminal"
  | "schedules"
  | "createSchedule"
  | "updateSchedule"
  | "deleteSchedule"
  | "runScheduleNow"
  | "scheduleRuns"
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
    case "syncPrWatchAgent":
      return client.syncPrWatchAgent(payload as PrWatchAgentSync);
    case "dbGetThreadRuntimeItemsPage":
      return client.threadRuntimeItemsPage(
        payload as Parameters<RemoteDesktopClient["threadRuntimeItemsPage"]>[0],
      );
    case "dbTruncateThreadRuntimeAfter":
      return client.truncateThreadRuntimeAfter(
        payload as Parameters<RemoteDesktopClient["truncateThreadRuntimeAfter"]>[0],
      );
    case "dbGetLatestThreadGoalItem":
      return client.latestThreadGoalItem(
        String((payload as { readonly threadId: string }).threadId),
      );
    case "dbGetThreadCompletedTurns":
      return client.threadCompletedTurns(
        String((payload as { readonly threadId: string }).threadId),
      );
    case "dbGetThreadContextUsage":
      return client.threadContextUsage(String((payload as { readonly threadId: string }).threadId));
    case "revertCheckpoint":
      return client.checkpointRevert(
        payload as Parameters<RemoteDesktopClient["checkpointRevert"]>[0],
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
    case "getSchedules":
      return client.schedules();
    case "createSchedule":
      return client.createSchedule(payload as ScheduledTaskInput);
    case "updateSchedule": {
      const input = payload as IpcProcedurePayload<"updateSchedule">;
      return client.updateSchedule(input.id, input.task);
    }
    case "deleteSchedule":
      return client.deleteSchedule((payload as IpcProcedurePayload<"deleteSchedule">).id);
    case "runScheduleNow":
      return client.runScheduleNow((payload as IpcProcedurePayload<"runScheduleNow">).id);
    case "getScheduleRuns":
      return client.scheduleRuns((payload as IpcProcedurePayload<"getScheduleRuns">).id);
  }
}
