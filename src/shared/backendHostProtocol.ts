import type { PoracodeDiagnosticTags } from "./diagnostics/sentryPrivacy";
import { CLIENT_HOST_HOP_VERSION } from "./clientHostHop";
import type {
  ProfileCoreStats,
  ProfileDevicesResponse,
  ProfileIdentity,
  ProfileIdentityResponse,
  ProfileStatsRequest,
  ProfileTokenStats,
  PrWatch,
  PrWatchAgentSync,
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
  SupervisorProcedureName,
  SupervisorRequest,
} from "./ipc";
import type { ManagedLoopbackBootstrap } from "./managedLoopback";
import type { PoracodeChannel } from "./channel";

/** Increment whenever the desktop/backend-host IPC envelope becomes incompatible. */
// Version 3 carried renderer stream sequence numbers through the Electron IPC fallback.
// Version 4 added the `supervisor-event-gap` control kind announced when the host sheds
// desktop-IPC copies of bulk renderer events. Version 5 added the `revert-checkpoint`
// renderer operation (WS2 stage 4). Version 6 / renderer stream 3 carried authoritative
// content.delta.replace. Version 7 moved durable settings/routing ownership and
// acknowledgements out of Electron main.
// Versions 8-12 remain RESERVED for the V4 activations recorded in
// .agents/docs/versioning.md (owner bootstrap, settings authority, superseded two-parent
// combination, private usage-secret service) — this milestone deliberately does not
// consume them.
// Version 13 is the per-window delivery-ownership boundary (V4 F7 correction). It is an
// incompatible handoff, not an additive one: `set-renderer-stream-ownership` now carries a
// per-window grant+interests table (every entry minted, plus the shell-remainder role that
// keeps one window's controls exact-once), `supervisor-event` envelopes gained a targeted
// `windowId`/`generation` recipient, the new `renderer-stream-recovery` kind announces a
// generation-fenced loss window through the ordered fallback path, the untargeted
// shell copy no longer carries a sequence, and `call-supervisor` carries an
// authenticated `originWindowId` that scopes terminal-bootstrap retention to the
// requesting window. A pre-13 peer would silently misroute bulk or
// ignore recovery barriers, so the bump makes mixed pairings fail loudly instead of
// losing events quietly. Host and main always ship in one bundle; a stale host child from
// an older build is rejected by the version gate on both sides.
// The later F7 single-path correction (quick-composer agent statuses are delivered only by
// the shell forward; the redundant targeted copy is dropped in main's dispatcher) is
// main-local dispatch semantics: no envelope field, operation, or ordering rule changes,
// so this boundary deliberately stayed at 13.
// Version 14 is the renderer-stream leg deletion (V5 plan 2.5 / H4): the direct
// renderer stream, its per-window delivery-ownership table and grants, the
// targeted fallback-copy envelopes, and the generation-fenced recovery
// barriers are GONE. The desktop-IPC relay is the sole desktop event path and
// carries the legacy full-relay shape again: every `supervisor-event` envelope
// is untargeted and carries its `rendererSequence`, windows dedupe by
// sequence, and shedding recovers through `supervisor-event-gap` (unchanged).
// A stale backend child that still speaks 13 fails the version gate in both
// directions instead of half-serving a deleted operation.
// Version 15 (V2 A2 / host correction): the backend→main BULK copy is gone.
// `supervisor-event` and `supervisor-event-gap` are removed from this union
// together with the `set-event-interests` request; live renderer content
// crosses only the loopback WS, and main learns native sleep state through the
// bounded, coalesced `native-thread-activity` projection. The same correction
// removes the `projects-changed` native event: full `Project[]` rows no longer
// cross the backend→main hop for the renderer mirror either — project
// mutations publish the bounded `remote-projects-changed` membership event on
// the loopback WS and main keeps only the `database-projection-changed` tray
// refresh. A stale backend child that still emits removed vocabulary is
// rejected by the version gate instead of being half-decoded.
// Version 16 (V2): the legacy `dbPersistExperimentState` database call is
// removed from the renderer-persistence subset — the renderer experiment
// store is memory-only and the host experiment authority owns persistence.
// A hop-15 backend child still dispatches the removed name, so the version
// gate rejects that pairing instead of half-serving it.
export const BACKEND_HOST_PROTOCOL_VERSION = CLIENT_HOST_HOP_VERSION;

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
  "dbSyncChanges",
  "dbGetThreadRuntimeItems",
  "dbGetThreadRuntimeItemsPage",
  "dbGetThreadsPage",
  "dbGetLatestThreadGoalItem",
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

/** Input of the backend-owned compound checkpoint revert (WS2 stage 4). */
export interface RevertCheckpointHostCall {
  threadId: string;
  checkpointItemId: string;
  operationKey: string;
}

export function isDirectRendererDatabaseProcedure(
  name: string,
): name is BackendDatabaseProcedureName {
  return (
    (BACKEND_DATABASE_PROCEDURE_NAMES as readonly string[]).includes(name) &&
    name !== "dbDeleteThread"
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
    /**
     * Data-custody fence path (`<ns>.host-data.sqlite`, `hostDataFence.ts`).
     * Desktop main resolves it from the same canonical root mapping as the
     * owner lease, so the forked backend child takes the fence before opening
     * SQLite. Absent in compositions that do not fork a backend process
     * (headless owns its database in-process). Additive same-build field:
     * main and the backend child ship in one bundle, so no protocol bump.
     */
    dataFencePath?: string;
    /** Additive asset declaration. Older senders omit it and do not compose
     * host-owned SSH environments; device-local SSH remains separate. */
    environmentAssets?: {
      agentPluginsDir: string;
      preassembledArchiveDir?: string;
    };
    /**
     * V6 C.2: host-declared service capabilities snapshot for GET
     * `/api/host/describe`. Additive same-build field.
     */
    hostCapabilities?: import("./hostControlProtocol").HostServiceCapabilities;
  };
}

export const BACKEND_SETTINGS_PROCEDURE_NAMES = [
  "getSharedSettings",
  "setSharedSettings",
  "settingsTransactionMutate",
  "settingsTransactionSnapshot",
  "setAgentSecretSetting",
  "removeCrossagentRoutingOverride",
  "removeCrossagentMemoryEntry",
  "updateCrossagentMemoryEntryTags",
  "setProfileEnvironment",
  "createProfile",
] as const;
export type BackendSettingsProcedureName = (typeof BACKEND_SETTINGS_PROCEDURE_NAMES)[number];
type BackendSettingsProcedureMap = {
  [Name in BackendSettingsProcedureName]: {
    payload: Name extends "getSharedSettings" ? Record<string, never> : IpcProcedurePayload<Name>;
    result: IpcProcedureResult<Name>;
  };
};

export interface BackendServiceProcedureMap extends BackendSettingsProcedureMap {
  getRemoteAccessPairing: { payload: Record<string, never>; result: RemoteAccessPairingInfo };
  // V5 plan 2.5 completion: the managed flavor's always-on loopback attach
  // payload (endpoint + single-use credential) resolved behind readiness.
  // Additive same-build procedure: main and the backend child ship in one
  // bundle, so the backend-host protocol version is unchanged.
  getManagedLoopbackBootstrap: {
    payload: Record<string, never>;
    result: ManagedLoopbackBootstrap | null;
  };
  refreshRemoteAccessPairing: {
    payload: { preset?: "operator" | "viewer" };
    result: RemoteAccessPairingInfo;
  };
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
  syncPrWatchAgent: { payload: PrWatchAgentSync; result: void };
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
  ...BACKEND_SETTINGS_PROCEDURE_NAMES,
  "getRemoteAccessPairing",
  "getManagedLoopbackBootstrap",
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
  "syncPrWatchAgent",
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
      operation: "revert-checkpoint";
      payload: { name: "revertCheckpoint"; payload: RevertCheckpointHostCall };
    })
  | (BackendHostRequestBase & {
      operation: "call-service";
      payload: BackendServiceCall;
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

/** One thread's native working-state transition in a coalesced activity batch. */
export interface NativeThreadActivityChange {
  threadId: string;
  active: boolean;
}

export type BackendHostOutboundMessage =
  | BackendHostReply
  | {
      version: typeof BACKEND_HOST_PROTOCOL_VERSION;
      kind: "native-thread-activity";
      /**
       * Bounded, coalesced per-thread activity deltas (last writer wins). Main
       * applies them to its sleep-blocker working set; the backend host never
       * serializes transcript or terminal content across this hop.
       */
      changes: NativeThreadActivityChange[];
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

/**
 * Builds a `call-supervisor` request.
 */
export function createBackendSupervisorRequest<Name extends SupervisorProcedureName>(
  id: string,
  name: Name,
  payload: IpcProcedurePayload<Name>,
): BackendHostRequest {
  return {
    version: BACKEND_HOST_PROTOCOL_VERSION,
    id,
    operation: "call-supervisor",
    payload: {
      id,
      type: name,
      payload,
    } as SupervisorRequest,
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

export function createBackendRevertCheckpointRequest(
  id: string,
  payload: RevertCheckpointHostCall,
): BackendHostRequest {
  return {
    version: BACKEND_HOST_PROTOCOL_VERSION,
    id,
    operation: "revert-checkpoint",
    payload: { name: "revertCheckpoint", payload },
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
    case "revert-checkpoint":
      return (
        message.payload.name === "revertCheckpoint" &&
        typeof message.payload.payload === "object" &&
        message.payload.payload !== null &&
        typeof (message.payload.payload as RevertCheckpointHostCall).threadId === "string" &&
        typeof (message.payload.payload as RevertCheckpointHostCall).checkpointItemId ===
          "string" &&
        typeof (message.payload.payload as RevertCheckpointHostCall).operationKey === "string"
      );
    case "call-service":
      return (
        typeof message.payload.name === "string" &&
        (BACKEND_SERVICE_PROCEDURE_NAMES as readonly string[]).includes(message.payload.name) &&
        "payload" in message.payload
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
    case "native-thread-activity":
      return (
        Array.isArray(message.changes) &&
        message.changes.every(
          (change) =>
            isRecord(change) &&
            typeof change.threadId === "string" &&
            typeof change.active === "boolean",
        )
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
