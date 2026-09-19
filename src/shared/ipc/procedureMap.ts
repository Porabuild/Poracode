import { agentCredentialProcedures } from "./procedures/agentCredentials";
import { appProcedures } from "./procedures/app";
import { browserProcedures } from "./procedures/browser";
import { dbProcedures } from "./procedures/db";
import { experimentProcedures } from "./procedures/experiment";
import { githubProcedures } from "./procedures/github";
import { gitProcedures } from "./procedures/git";
import { lspProcedures } from "./procedures/lsp";
import { liveVoiceProcedures } from "./procedures/liveVoice";
import { mcpProcedures } from "./procedures/mcp";
import { pluginProcedures } from "./procedures/plugins";
import { profileProcedures } from "./procedures/profile";
import { prWatchProcedures } from "./procedures/prWatches";
import { scheduleProcedures } from "./procedures/schedules";
import { skillProcedures } from "./procedures/skills";
import { projectTreeProcedures } from "./procedures/projectTree";
import { settingsProcedures } from "./procedures/settings";
import { sshProcedures } from "./procedures/ssh";
import { threadProcedures } from "./procedures/thread";
import { updatesProcedures } from "./procedures/updates";
import { usageProcedures } from "./procedures/usage";

export const groupedIpcProcedures = {
  app: appProcedures,
  thread: threadProcedures,
  liveVoice: liveVoiceProcedures,
  git: gitProcedures,
  experiment: experimentProcedures,
  github: githubProcedures,
  projectTree: projectTreeProcedures,
  settings: settingsProcedures,
  ssh: sshProcedures,
  db: dbProcedures,
  updates: updatesProcedures,
  lsp: lspProcedures,
  mcp: mcpProcedures,
  browser: browserProcedures,
  usage: usageProcedures,
  profile: profileProcedures,
  schedules: scheduleProcedures,
  prWatches: prWatchProcedures,
  skills: skillProcedures,
  plugins: pluginProcedures,
  agentCredentials: agentCredentialProcedures,
} as const;

export const ipcProcedureMap = {
  ...appProcedures,
  ...threadProcedures,
  ...liveVoiceProcedures,
  ...gitProcedures,
  ...experimentProcedures,
  ...githubProcedures,
  ...projectTreeProcedures,
  ...settingsProcedures,
  ...sshProcedures,
  ...dbProcedures,
  ...updatesProcedures,
  ...lspProcedures,
  ...mcpProcedures,
  ...browserProcedures,
  ...usageProcedures,
  ...profileProcedures,
  ...scheduleProcedures,
  ...prWatchProcedures,
  ...skillProcedures,
  ...pluginProcedures,
  ...agentCredentialProcedures,
} as const;

export type IpcProcedureMap = typeof ipcProcedureMap;
export type IpcProcedureName = keyof IpcProcedureMap;

/**
 * Version of the IPC procedure map — the closed name → transport/codec table
 * shared by the renderer bundle, the main handler maps, and (across the attach
 * boundary) the standalone owner's procedure dispatch (V5 plan 2.6).
 *
 * Bump when the map changes in a way an already-published peer cannot accept:
 * a removed procedure, a changed transport, or incompatible payload/result
 * semantics on an existing name. Purely additive names stay within a version
 * only because every peer loud-rejects unknown names; any map change at all
 * must also refresh the pinned fingerprint in `procedureMapVersion.test.ts`,
 * which forces the compat review even when the version itself stays.
 *
 * Version 1 is the map as first versioned. Peers that cannot declare a
 * version (legacy attach handshakes) count as version 0 and are rejected
 * typed by {@link assertIpcProcedureMapVersion} — a mismatch must surface as
 * a typed rejection, never as guessed semantics or a silent drop.
 */
export const IPC_PROCEDURE_MAP_VERSION = 1 as const;

/**
 * Deterministic fingerprint of the map's wire-visible shape: sorted
 * `name:transport` lines. Order-independent, so re-grouping procedures never
 * flips the pin; adding/removing a procedure or changing a transport does.
 */
export function ipcProcedureMapFingerprint(): string {
  return Object.entries(ipcProcedureMap)
    .map(([name, def]) => `${name}:${def.transport}`)
    .sort()
    .join("\n");
}

/** Typed rejection for a peer declaring a different procedure-map version. */
export class IpcProcedureMapVersionError extends Error {
  readonly peerVersion: number;
  readonly localVersion: number;

  constructor(peerVersion: number) {
    super(
      `IPC procedure map version mismatch: local ${IPC_PROCEDURE_MAP_VERSION}, peer ${peerVersion}. ` +
        "Refusing to guess procedure semantics across versions.",
    );
    this.name = "IpcProcedureMapVersionError";
    this.peerVersion = peerVersion;
    this.localVersion = IPC_PROCEDURE_MAP_VERSION;
  }
}

/**
 * Gate for a peer-declared procedure-map version. Absent, malformed, or
 * negative declarations count as version 0 (legacy peer) and reject typed.
 * The runtime exchange point (renderer ⇄ main bootstrap, renderer ⇄
 * standalone owner attach) is recorded in `.agents/docs/versioning.md`; this
 * guard is the single rejection primitive every exchange site must call.
 */
export function assertIpcProcedureMapVersion(peerVersion: unknown): void {
  const version =
    typeof peerVersion === "number" &&
    Number.isSafeInteger(peerVersion) &&
    peerVersion >= 0 &&
    peerVersion <= Number.MAX_SAFE_INTEGER
      ? peerVersion
      : 0;
  if (version !== IPC_PROCEDURE_MAP_VERSION) {
    throw new IpcProcedureMapVersionError(version);
  }
}

type ProcedureArgs<Name extends IpcProcedureName> = IpcProcedureMap[Name]["__types"]["args"];

export type IpcProcedurePayload<Name extends IpcProcedureName> =
  IpcProcedureMap[Name]["__types"]["payload"];

export type IpcProcedureResult<Name extends IpcProcedureName> =
  IpcProcedureMap[Name]["__types"]["result"];

export const MAIN_LOCAL_PROCEDURE_NAMES = [
  "pickFolder",
  "pickFiles",
  "detectProjectIcon",
  "listProjectIconFiles",
  "saveClipboardImage",
  "saveHandoffContext",
  "saveImageFile",
  "copyImageToClipboard",
  "readLocalImageFile",
  "createProjectDirectory",
  "openExternal",
  "openExternalNative",
  "openMicrophoneSettings",
  "focusWindow",
  "showNotification",
  "requestLegacyDataMigration",
  "relaunchApp",
  "getHomeScopeLocation",
  "getKeybindings",
  "setKeybindings",
  "setGlobalShortcutsSuspended",
  "setRendererEventInterests",
  "getRemoteAccessPairing",
  "getManagedLoopbackBootstrap",
  "refreshRemoteAccessPairing",
  "setRemoteAccessEnabled",
  "revokeRemoteAccessSession",
  "getRemoteAccessTailscaleStatus",
  "setRemoteAccessTailscaleHttps",
  "startTailscale",
  "setRemoteAccessAdvertisedUrl",
  "sshDiscoverHosts",
  "sshConnect",
  "sshDisconnect",
  "publishRemoteGitSummaries",
  "revealProjectEntry",
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
  "setWindowChrome",
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
  "dbPersistExperimentState",
  "dbGetThreadRuntimeItems",
  "dbGetThreadRuntimeItemsPage",
  "dbGetThreadsPage",
  "dbGetLatestThreadGoalItem",
  "dbTruncateThreadRuntimeAfter",
  "revertCheckpoint",
  "dbReplaceThreadRuntimeItems",
  "dbGetThreadCompletedTurns",
  "dbReplaceThreadCompletedTurns",
  "dbReplaceThreadRuntimeSnapshot",
  "dbGetThreadContextUsage",
  "dbGetProjectNotes",
  "dbSetProjectNotes",
  "getUpdateStatus",
  "checkForUpdate",
  "startUpdateDownload",
  "installUpdate",
  "browserGetState",
  "browserCreateTab",
  "browserCloseTab",
  "browserActivateTab",
  "browserMoveTab",
  "browserSetGroupCollapsed",
  "browserUngroupGroup",
  "browserCloseGroup",
  "browserNewTabInGroup",
  "browserRenameGroup",
  "browserSetGroupColor",
  "browserNavigate",
  "browserBack",
  "browserForward",
  "browserReload",
  "browserHardReload",
  "browserToggleDevTools",
  "browserClearHistory",
  "browserClearCookies",
  "browserClearCache",
  "browserCopyScreenshot",
  "browserCapturePreview",
  "browserAttachWebContents",
  "browserStartPicker",
  "browserCancelPicker",
  "browserSuggest",
  "browserAddBookmark",
  "browserRemoveBookmark",
  "browserSetBookmarkBarVisible",
  "browserRecentHistory",
  "browserExtractToWindow",
  "browserInjectToMain",
  "startUsageLogin",
  "cancelUsageLogin",
  "clearUsageLogin",
  "submitUsageApiKey",
  "resolveUsageLoginConfirmation",
  "getUsageLoginState",
  "getProfileCoreStats",
  "getProfileTokenStats",
  "getProfileDevices",
  "getProfileIdentity",
  "setProfileIdentity",
  "copyShareImage",
  "appendUsageEvents",
  "getSchedules",
  "createSchedule",
  "updateSchedule",
  "deleteSchedule",
  "runScheduleNow",
  "getScheduleRuns",
  "openPluginsFolder",
  "getPrWatch",
  "checkPrWatch",
  "upsertPrWatch",
  "deletePrWatch",
  "syncPrWatchAgent",
] as const satisfies readonly IpcProcedureName[];

export type MainLocalProcedureName = (typeof MAIN_LOCAL_PROCEDURE_NAMES)[number];
export type SupervisorProcedureName = Exclude<IpcProcedureName, MainLocalProcedureName>;

export type { ProcedureArgs };
