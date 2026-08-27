import type { IpcProcedureName } from "@/shared/ipc";
import { REMOTE_IPC_ADAPTER_SPECS } from "@/shared/remote";
import {
  REMOTE_NOOP_PROCEDURES,
  REMOTE_PROCEDURE_SPECS,
  type RemoteNoopProcedureName,
  type RemoteProcedureName,
  type RemoteProcedureOwner,
} from "@/shared/remote/procedures";

export type RemoteRouteHandler =
  | "passthrough"
  | "noop"
  | "adapter"
  | "thread-clipboard-image"
  | "thread-handoff-context"
  | "shell-start"
  | "shell-close";

export interface RemoteProcedureRouteSpec {
  readonly owner: RemoteProcedureOwner;
  readonly handler: RemoteRouteHandler;
}

const passthroughRoutes = Object.fromEntries(
  Object.entries(REMOTE_PROCEDURE_SPECS).map(([procedure, spec]) => [
    procedure,
    { owner: spec.owner, handler: "passthrough" },
  ]),
) as Record<RemoteProcedureName, RemoteProcedureRouteSpec>;

const noopRoutes = Object.fromEntries(
  Object.entries(REMOTE_NOOP_PROCEDURES).map(([procedure, owner]) => [
    procedure,
    { owner, handler: "noop" },
  ]),
) as Record<RemoteNoopProcedureName, RemoteProcedureRouteSpec>;

const adapterRoutes = Object.fromEntries(
  Object.entries(REMOTE_IPC_ADAPTER_SPECS).map(([procedure, owner]) => [
    procedure,
    { owner, handler: "adapter" },
  ]),
) as Record<keyof typeof REMOTE_IPC_ADAPTER_SPECS, RemoteProcedureRouteSpec>;

/** Single policy table for choosing the host and transport for project-aware IPC. */
export const REMOTE_PROCEDURE_ROUTES = {
  ...passthroughRoutes,
  ...noopRoutes,
  ...adapterRoutes,
  saveClipboardImage: { owner: "thread", handler: "thread-clipboard-image" },
  saveHandoffContext: { owner: "thread", handler: "thread-handoff-context" },
  startShell: { owner: "projectLocation", handler: "shell-start" },
  closeThread: { owner: "terminal", handler: "shell-close" },
} as const satisfies Partial<Record<IpcProcedureName, RemoteProcedureRouteSpec>>;

/** Project-aware procedures intentionally dispatched or disabled outside the bridge router. */
export const NON_ROUTER_PROJECT_PROCEDURES = {
  startThread: "explicit-remote-thread-launch",
  cloneRepo: "remote-projects-use-project-command",
  relocateProject: "explicit-remote-project-command",
  extractContext: "remote-control-hidden",
  cancelExtractContext: "remote-control-hidden",
  createExperimentWorktrees: "remote-control-hidden",
  removeExperimentWorktrees: "remote-control-hidden",
  captureExperimentSnapshot: "remote-control-hidden",
  judgeExperimentSnapshot: "remote-control-hidden",
  getExperimentCandidateStats: "remote-control-hidden",
  cancelJudgeExperiment: "remote-control-hidden",
  lspStart: "remote-control-disabled",
  lspStop: "remote-control-disabled",
  lspSendMessage: "remote-control-disabled",
  getSchedules: "device-owned-control",
  createSchedule: "remote-projects-excluded",
  updateSchedule: "remote-projects-excluded",
  deleteSchedule: "remote-projects-excluded",
  runScheduleNow: "remote-projects-excluded",
  getScheduleRuns: "remote-projects-excluded",
  dbUpsertProject: "remote-mirrors-not-persisted",
  dbDeleteProject: "remote-mirrors-not-persisted",
  dbUpsertThread: "remote-mirrors-not-persisted",
  dbDeleteThread: "remote-mirrors-not-persisted",
  dbSyncAll: "remote-mirrors-not-persisted",
  dbGetThreadRuntimeItems: "remote-runtime-mirror-local",
  dbGetLatestThreadGoalItem: "remote-runtime-snapshot-provided",
  dbReplaceThreadRuntimeItems: "remote-runtime-mirror-local",
  dbGetThreadCompletedTurns: "remote-runtime-mirror-local",
  dbReplaceThreadCompletedTurns: "remote-runtime-mirror-local",
  dbReplaceThreadRuntimeSnapshot: "remote-runtime-mirror-local",
  dbGetThreadContextUsage: "remote-runtime-mirror-local",
  readTerminalScrollback: "remote-thread-snapshot-provided",
  readTerminalSize: "remote-server-internal",
  dbPersistExperimentState: "remote-experiments-excluded",
  browserStartPicker: "device-owned-browser-control",
  showNotification: "device-owned-notification",
  detectProjectIcon: "remote-mirrors-skip-file-icons",
  listProjectIconFiles: "remote-mirrors-skip-file-icons",
} as const satisfies Partial<Record<IpcProcedureName, string>>;

export type RemoteRoutableProcedureName = keyof typeof REMOTE_PROCEDURE_ROUTES;

export function isRemoteRoutableProcedure(
  procedure: string,
): procedure is RemoteRoutableProcedureName {
  return Object.hasOwn(REMOTE_PROCEDURE_ROUTES, procedure);
}
