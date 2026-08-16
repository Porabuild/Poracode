import type { PoracodeDiagnosticTags } from "./diagnostics/sentryPrivacy";
import type {
  ProfileCoreStats,
  ProfileDevicesResponse,
  ProfileIdentity,
  ProfileIdentityResponse,
  ProfileStatsRequest,
  ProfileTokenStats,
  PrWatch,
  PrWatchInput,
  RemoteThreadCommand,
  ScheduledTask,
  ScheduledTaskInput,
} from "./contracts";
import type { GitStatePatch } from "./gitState";
import type { UserNotification } from "./threadNotification";
import type {
  RemoteAccessPairingInfo,
  RemoteBrowserCommand,
  RemoteBrowserFrameMetadata,
  RemoteBrowserInput,
  RemoteBrowserMirrorStatus,
  RemoteBrowserState,
  RemoteGitSummaries,
  RemoteHostUpdateStatus,
} from "./remote";
import type { SharedSettings } from "./settings";
import type {
  IpcProcedurePayload,
  IpcProcedureResult,
  PrWatchStatusEvent,
  RemoteAccessTailscaleStatus,
  StartTailscaleResult,
  SupervisorEvent,
  SupervisorProcedureName,
  SupervisorRequest,
} from "./ipc";
import type { LiveEventInterests } from "./liveEventInterests";
import type { PoracodeChannel } from "./channel";

/** Increment whenever the desktop/backend-host IPC envelope becomes incompatible. */
// Version 3 carries renderer stream sequence numbers through the Electron IPC fallback.
export const BACKEND_HOST_PROTOCOL_VERSION = 3 as const;
export const BACKEND_RENDERER_STREAM_VERSION = 2 as const;

export interface BackendRendererStreamInfo {
  version: typeof BACKEND_RENDERER_STREAM_VERSION;
  url: string;
  token: string;
}

export type BackendRendererRequestOperation = "supervisor" | "database" | "service";

export interface BackendRendererRequest {
  version: typeof BACKEND_RENDERER_STREAM_VERSION;
  type: "request";
  id: string;
  operation: BackendRendererRequestOperation;
  name: string;
  payload: unknown;
}

export type BackendRendererReply =
  | {
      version: typeof BACKEND_RENDERER_STREAM_VERSION;
      type: "reply";
      id: string;
      ok: true;
      data: unknown;
    }
  | {
      version: typeof BACKEND_RENDERER_STREAM_VERSION;
      type: "reply";
      id: string;
      ok: false;
      error: string;
    };

export const BACKEND_DATABASE_PROCEDURE_NAMES = [
  "dbGetProjects",
  "dbGetThreads",
  "dbGetState",
  "dbSetState",
  "dbUpsertProject",
  "dbUpsertThread",
  "dbDeleteThread",
  "dbDeleteProject",
  "dbSyncAll",
  "dbPersistExperimentState",
  "dbGetThreadRuntimeItems",
  "dbGetThreadRuntimeItemsPage",
  "dbTruncateThreadRuntimeAfter",
  "dbReplaceThreadRuntimeItems",
  "dbGetThreadCompletedTurns",
  "dbReplaceThreadCompletedTurns",
  "dbReplaceThreadRuntimeSnapshot",
  "dbGetThreadContextUsage",
  "dbGetProjectNotes",
  "dbSetProjectNotes",
  "getScheduleRuns",
  "appendUsageEvents",
] as const;

export type BackendDatabaseProcedureName = (typeof BACKEND_DATABASE_PROCEDURE_NAMES)[number];

export function isDirectRendererDatabaseProcedure(
  name: string,
): name is BackendDatabaseProcedureName {
  return (
    (BACKEND_DATABASE_PROCEDURE_NAMES as readonly string[]).includes(name) &&
    name !== "dbDeleteThread" &&
    name !== "dbPersistExperimentState"
  );
}

export type BackendDatabaseCall = {
  [Name in BackendDatabaseProcedureName]: {
    name: Name;
    payload: IpcProcedurePayload<Name>;
  };
}[BackendDatabaseProcedureName];

export interface BackendHostInitializePayload {
  baseDir: string;
  dbPath: string;
  supervisor: {
    appVersion: string;
    isDev: boolean;
    supervisorPath: string;
    wslHelpersDir: string;
    bundledSkillsDir?: string;
    bundledPluginsDir?: string;
    secretStorageKey: string;
    preferUiResponsiveness?: boolean;
  };
  desktop?: {
    channel: "stable" | "nightly";
    settingsPath: string;
    devServerUrl?: string;
  };
}

export type BackendEventInterests = LiveEventInterests;

export interface BackendServiceProcedureMap {
  getRemoteAccessPairing: { payload: Record<string, never>; result: RemoteAccessPairingInfo };
  refreshRemoteAccessPairing: { payload: Record<string, never>; result: RemoteAccessPairingInfo };
  setRemoteAccessEnabled: { payload: { enabled: boolean }; result: RemoteAccessPairingInfo };
  getRemoteAccessTailscaleStatus: {
    payload: Record<string, never>;
    result: RemoteAccessTailscaleStatus;
  };
  setRemoteAccessTailscaleHttps: {
    payload: { enabled: boolean };
    result: RemoteAccessPairingInfo;
  };
  startTailscale: { payload: Record<string, never>; result: StartTailscaleResult };
  setRemoteAccessAdvertisedUrl: { payload: { url: string }; result: RemoteAccessPairingInfo };
  revokeRemoteAccessSession: { payload: { sessionId: string }; result: { revoked: boolean } };
  publishRemoteGitSummaries: { payload: { summaries: RemoteGitSummaries }; result: void };
  getSchedules: { payload: Record<string, never>; result: ScheduledTask[] };
  createSchedule: { payload: ScheduledTaskInput; result: ScheduledTask };
  updateSchedule: { payload: { id: string; task: ScheduledTaskInput }; result: ScheduledTask };
  deleteSchedule: { payload: { id: string }; result: void };
  runScheduleNow: { payload: { id: string }; result: ScheduledTask };
  getPrWatch: { payload: { projectId: string; prNumber: number }; result: PrWatch | null };
  checkPrWatch: { payload: { projectId: string; prNumber: number }; result: void };
  upsertPrWatch: { payload: PrWatchInput; result: PrWatch };
  deletePrWatch: { payload: { projectId: string; prNumber: number }; result: void };
  getProfileCoreStats: { payload: ProfileStatsRequest; result: ProfileCoreStats };
  getProfileTokenStats: { payload: ProfileStatsRequest; result: ProfileTokenStats };
  getProfileDevices: { payload: Record<string, never>; result: ProfileDevicesResponse };
  getProfileIdentity: { payload: Record<string, never>; result: ProfileIdentityResponse };
  setProfileIdentity: { payload: ProfileIdentity; result: ProfileIdentityResponse };
  updateStatusChanged: { payload: { status: RemoteHostUpdateStatus | null }; result: void };
  requestLegacyDataMigration: {
    payload: {
      baseDir: string;
      channel: PoracodeChannel;
      electronUserDataDir: string;
      legacyElectronUserDataDir: string;
      legacyBaseDir?: string;
      allowCustomDataRoot: boolean;
    };
    result: IpcProcedureResult<"requestLegacyDataMigration">;
  };
}

export const BACKEND_SERVICE_PROCEDURE_NAMES = [
  "getRemoteAccessPairing",
  "refreshRemoteAccessPairing",
  "setRemoteAccessEnabled",
  "getRemoteAccessTailscaleStatus",
  "setRemoteAccessTailscaleHttps",
  "startTailscale",
  "setRemoteAccessAdvertisedUrl",
  "revokeRemoteAccessSession",
  "publishRemoteGitSummaries",
  "getSchedules",
  "createSchedule",
  "updateSchedule",
  "deleteSchedule",
  "runScheduleNow",
  "getPrWatch",
  "checkPrWatch",
  "upsertPrWatch",
  "deletePrWatch",
  "getProfileCoreStats",
  "getProfileTokenStats",
  "getProfileDevices",
  "getProfileIdentity",
  "setProfileIdentity",
  "updateStatusChanged",
  "requestLegacyDataMigration",
] as const satisfies readonly (keyof BackendServiceProcedureMap)[];

export type BackendServiceProcedureName = keyof BackendServiceProcedureMap;

export function isDirectRendererServiceProcedure(
  name: string,
): name is BackendServiceProcedureName {
  return (
    (BACKEND_SERVICE_PROCEDURE_NAMES as readonly string[]).includes(name) &&
    name !== "requestLegacyDataMigration"
  );
}
export type BackendServicePayload<Name extends BackendServiceProcedureName> =
  BackendServiceProcedureMap[Name]["payload"];
export type BackendServiceResult<Name extends BackendServiceProcedureName> =
  BackendServiceProcedureMap[Name]["result"];

export type BackendServiceCall = {
  [Name in BackendServiceProcedureName]: {
    name: Name;
    payload: BackendServicePayload<Name>;
  };
}[BackendServiceProcedureName];

export type BackendNativeRequest =
  | { operation: "dispatch-thread-command"; payload: RemoteThreadCommand }
  | { operation: "open-thread"; payload: { threadId: string } }
  | { operation: "notify-user"; payload: { title: string; body: string; threadId: string } }
  | { operation: "check-for-update"; payload: Record<string, never> }
  | { operation: "install-update"; payload: Record<string, never> }
  | { operation: "browser-state"; payload: Record<string, never> }
  | { operation: "browser-command"; payload: RemoteBrowserCommand }
  | { operation: "browser-input"; payload: RemoteBrowserInput }
  | { operation: "browser-watch-start"; payload: Record<string, never> }
  | { operation: "browser-watch-stop"; payload: Record<string, never> }
  | { operation: "browser-refresh"; payload: Record<string, never> };

export type BackendBrowserEvent =
  | { type: "frame"; tabId: string; data: string; metadata: RemoteBrowserFrameMetadata }
  | { type: "state"; state: RemoteBrowserState }
  | { type: "status"; status: RemoteBrowserMirrorStatus };

export type BackendNativeEvent =
  | { type: "database-projection-changed" }
  | { type: "shared-settings-changed"; settings: SharedSettings }
  | { type: "remote-access-pairing-changed"; info: RemoteAccessPairingInfo }
  | { type: "projects-changed"; projects: IpcProcedureResult<"dbGetProjects"> }
  | { type: "pr-watch-status"; event: PrWatchStatusEvent }
  | {
      type: "pr-watch-merged";
      event: { projectId: string; prNumber: number; worktreePath?: string };
    }
  | { type: "git-state-changed"; patch: GitStatePatch }
  | { type: "user-notification"; notification: UserNotification };

interface BackendHostRequestBase {
  version: typeof BACKEND_HOST_PROTOCOL_VERSION;
  id: string;
}

export type BackendHostRequest =
  | (BackendHostRequestBase & {
      operation: "initialize";
      payload: BackendHostInitializePayload;
    })
  | (BackendHostRequestBase & {
      operation: "start-supervisor" | "restart-supervisor";
      payload: { extraEnv: Record<string, string> };
    })
  | (BackendHostRequestBase & {
      operation: "call-supervisor";
      payload: SupervisorRequest;
    })
  | (BackendHostRequestBase & {
      operation: "call-database";
      payload: BackendDatabaseCall;
    })
  | (BackendHostRequestBase & {
      operation: "call-service";
      payload: BackendServiceCall;
    })
  | (BackendHostRequestBase & {
      operation: "set-event-interests";
      payload: BackendEventInterests;
    })
  | (BackendHostRequestBase & {
      operation: "resolve-native-request";
      payload:
        | { requestId: string; ok: true; data: unknown }
        | { requestId: string; ok: false; error: string };
    })
  | (BackendHostRequestBase & {
      operation: "browser-event";
      payload: BackendBrowserEvent;
    })
  | (BackendHostRequestBase & {
      operation: "dispose";
      payload: Record<string, never>;
    });

export type BackendHostReply =
  | {
      version: typeof BACKEND_HOST_PROTOCOL_VERSION;
      kind: "reply";
      replyTo: string;
      ok: true;
      data: unknown;
    }
  | {
      version: typeof BACKEND_HOST_PROTOCOL_VERSION;
      kind: "reply";
      replyTo: string;
      ok: false;
      error: string;
    };

export type BackendHostOutboundMessage =
  | BackendHostReply
  | {
      version: typeof BACKEND_HOST_PROTOCOL_VERSION;
      kind: "supervisor-event";
      event: SupervisorEvent;
      rendererSequence?: number;
      rendererDeliveredDirect?: boolean;
    }
  | {
      version: typeof BACKEND_HOST_PROTOCOL_VERSION;
      kind: "supervisor-reset";
    }
  | {
      version: typeof BACKEND_HOST_PROTOCOL_VERSION;
      kind: "native-request";
      id: string;
      request: BackendNativeRequest;
    }
  | {
      version: typeof BACKEND_HOST_PROTOCOL_VERSION;
      kind: "native-event";
      event: BackendNativeEvent;
    }
  | {
      version: typeof BACKEND_HOST_PROTOCOL_VERSION;
      kind: "error";
      message: string;
      tags?: PoracodeDiagnosticTags;
    };

export function createBackendSupervisorRequest<Name extends SupervisorProcedureName>(
  id: string,
  name: Name,
  payload: IpcProcedurePayload<Name>,
): BackendHostRequest {
  return {
    version: BACKEND_HOST_PROTOCOL_VERSION,
    id,
    operation: "call-supervisor",
    payload: { id, type: name, payload } as SupervisorRequest,
  };
}

export function createBackendDatabaseRequest<Name extends BackendDatabaseProcedureName>(
  id: string,
  name: Name,
  payload: IpcProcedurePayload<Name>,
): BackendHostRequest {
  return {
    version: BACKEND_HOST_PROTOCOL_VERSION,
    id,
    operation: "call-database",
    payload: { name, payload } as BackendDatabaseCall,
  };
}

export function createBackendServiceRequest<Name extends BackendServiceProcedureName>(
  id: string,
  name: Name,
  payload: BackendServicePayload<Name>,
): BackendHostRequest {
  return {
    version: BACKEND_HOST_PROTOCOL_VERSION,
    id,
    operation: "call-service",
    payload: { name, payload } as BackendServiceCall,
  };
}

export interface BackendDatabaseCaller {
  callDatabase<Name extends BackendDatabaseProcedureName>(
    name: Name,
    payload: IpcProcedurePayload<Name>,
  ): Promise<IpcProcedureResult<Name>>;
}

export interface BackendServiceCaller {
  callService<Name extends BackendServiceProcedureName>(
    name: Name,
    payload: BackendServicePayload<Name>,
  ): Promise<BackendServiceResult<Name>>;
}

export function isBackendHostRequest(message: unknown): message is BackendHostRequest {
  if (!isRecord(message)) return false;
  if (
    message.version !== BACKEND_HOST_PROTOCOL_VERSION ||
    typeof message.id !== "string" ||
    typeof message.operation !== "string" ||
    !isRecord(message.payload)
  ) {
    return false;
  }
  switch (message.operation) {
    case "initialize":
      return (
        typeof message.payload.baseDir === "string" &&
        typeof message.payload.dbPath === "string" &&
        isRecord(message.payload.supervisor)
      );
    case "start-supervisor":
    case "restart-supervisor":
      return isStringRecord(message.payload.extraEnv);
    case "call-supervisor":
      return (
        typeof message.payload.id === "string" &&
        typeof message.payload.type === "string" &&
        "payload" in message.payload
      );
    case "call-database":
      return (
        typeof message.payload.name === "string" &&
        (BACKEND_DATABASE_PROCEDURE_NAMES as readonly string[]).includes(message.payload.name) &&
        "payload" in message.payload
      );
    case "call-service":
      return (
        typeof message.payload.name === "string" &&
        (BACKEND_SERVICE_PROCEDURE_NAMES as readonly string[]).includes(message.payload.name) &&
        "payload" in message.payload
      );
    case "set-event-interests":
      return (
        isStringArray(message.payload.terminalThreadIds) &&
        isStringArray(message.payload.runtimeThreadIds) &&
        typeof message.payload.allRuntimeEvents === "boolean"
      );
    case "resolve-native-request":
      return (
        typeof message.payload.requestId === "string" &&
        typeof message.payload.ok === "boolean" &&
        (message.payload.ok || typeof message.payload.error === "string")
      );
    case "browser-event":
      return (
        typeof message.payload.type === "string" &&
        ["frame", "state", "status"].includes(message.payload.type)
      );
    case "dispose":
      return true;
    default:
      return false;
  }
}

export function isBackendHostOutboundMessage(
  message: unknown,
): message is BackendHostOutboundMessage {
  if (!isRecord(message)) return false;
  if (message.version !== BACKEND_HOST_PROTOCOL_VERSION || typeof message.kind !== "string") {
    return false;
  }
  switch (message.kind) {
    case "reply":
      return (
        typeof message.replyTo === "string" &&
        typeof message.ok === "boolean" &&
        (message.ok || typeof message.error === "string")
      );
    case "supervisor-event":
      return (
        isRecord(message.event) &&
        typeof message.event.type === "string" &&
        (message.rendererSequence === undefined ||
          (typeof message.rendererSequence === "number" &&
            Number.isSafeInteger(message.rendererSequence) &&
            message.rendererSequence >= 0))
      );
    case "supervisor-reset":
      return true;
    case "native-request":
      return (
        typeof message.id === "string" &&
        isRecord(message.request) &&
        typeof message.request.operation === "string" &&
        [
          "dispatch-thread-command",
          "open-thread",
          "notify-user",
          "check-for-update",
          "install-update",
          "browser-state",
          "browser-command",
          "browser-input",
          "browser-watch-start",
          "browser-watch-stop",
          "browser-refresh",
        ].includes(message.request.operation) &&
        "payload" in message.request
      );
    case "native-event":
      return (
        isRecord(message.event) &&
        typeof message.event.type === "string" &&
        [
          "database-projection-changed",
          "shared-settings-changed",
          "remote-access-pairing-changed",
          "projects-changed",
          "pr-watch-status",
          "pr-watch-merged",
          "git-state-changed",
          "user-notification",
        ].includes(message.event.type)
      );
    case "error":
      return typeof message.message === "string";
    default:
      return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
