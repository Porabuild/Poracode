import { agentCredentialProcedures } from "./procedures/agentCredentials";
import { modelProviderProcedures } from "./procedures/modelProviders";
import { appProcedures } from "./procedures/app";
import { browserProcedures } from "./procedures/browser";
import { dbProcedures } from "./procedures/db";
import { experimentProcedures } from "./procedures/experiment";
import { githubProcedures } from "./procedures/github";
import { forgeProcedures } from "./procedures/forge";
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
import { sessionImportProcedures } from "./procedures/sessionImport";
import { settingsProcedures } from "./procedures/settings";
import { sshProcedures } from "./procedures/ssh";
import { threadProcedures } from "./procedures/thread";
import { sessionActionProcedures } from "./procedures/sessionActions";
import { updatesProcedures } from "./procedures/updates";
import { usageProcedures } from "./procedures/usage";
import { CLIENT_HOST_HOP_VERSION } from "../clientHostHop";

export const groupedIpcProcedures = {
  app: appProcedures,
  thread: threadProcedures,
  sessionActions: sessionActionProcedures,
  liveVoice: liveVoiceProcedures,
  git: gitProcedures,
  experiment: experimentProcedures,
  github: githubProcedures,
  forge: forgeProcedures,
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
  modelProviders: modelProviderProcedures,
  sessionImport: sessionImportProcedures,
} as const;

export const ipcProcedureMap = {
  ...appProcedures,
  ...threadProcedures,
  ...sessionActionProcedures,
  ...liveVoiceProcedures,
  ...gitProcedures,
  ...experimentProcedures,
  ...githubProcedures,
  ...forgeProcedures,
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
  ...modelProviderProcedures,
  ...sessionImportProcedures,
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
 * Version 1 was the map as first versioned. V6 B.5 collapsed the renderer→host
 * hop so this constant aliases `CLIENT_HOST_HOP_VERSION` (16). Version 15
 * (V2 A2) removed `setRendererEventInterests`: the managed loopback WS reads
 * the renderer's retained interests locally, so no IPC interest sync remains.
 * Version 16 (V2) removed `dbPersistExperimentState`: the renderer experiment
 * store is a memory-only projection of the host's durable experiment
 * authority, so no renderer→host experiment persist remains. Version 17
 * carries the hop's checked invocation envelope: the version declared in the
 * renderer-supplied envelope is asserted by main before dispatch — the map's
 * own wire-visible shape is unchanged (see `clientHostHop.ts`). Previously
 * published map version 1 is an old reader. Peers that cannot
 * declare a version (legacy attach handshakes) count as version 0 and are
 * rejected typed by {@link assertIpcProcedureMapVersion} — a mismatch must
 * surface as a typed rejection, never as guessed semantics or a silent drop.
 * Network enablement adds a main-local name only; existing operations stay compatible.
 * Model-provider management is additive; older peers reject the unknown name
 * before effects. Native configuration and credential formats remain provider-owned.
 * Review marks, owned-comment edits and guides add negotiated names only;
 * existing peers reject unknown names before effects, so hop 18 stays compatible.
 */
export const IPC_PROCEDURE_MAP_VERSION = CLIENT_HOST_HOP_VERSION;

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
 * standalone owner attach) is recorded in `docs/versioning-history.md`; this
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
  "getRemoteAccessPairing",
  "getManagedLoopbackBootstrap",
  "probeTlsCertificateFingerprint",
  "refreshRemoteAccessPairing",
  "setRemoteAccessEnabled",
  "setRemoteAccessLanEnabled",
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
  "dbGetThreadRuntimeItems",
  "dbGetThreadRuntimeItemsPage",
  "dbGetThreadPromptIndex",
  "dbGetThreadsPage",
  "dbGetLatestThreadGoalItem",
  "dbTruncateThreadRuntimeAfter",
  "revertCheckpoint",
  "dbReplaceThreadRuntimeItems",
  "dbGetThreadCompletedTurns",
  "dbReplaceThreadCompletedTurns",
  "dbReplaceThreadRuntimeSnapshot",
  "dbGetThreadContextUsage",
  "dbGetThreadTokenUsage",
  "dbGetProjectNotes",
  "dbSetProjectNotes",
  "getUpdateStatus",
  "checkForUpdate",
  "startUpdateDownload",
  "installUpdate",
  "browserGetState",
  "browserCreateTab",
  "browserOpenInternalPage",
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
  "browserFindInPage",
  "browserStopFindInPage",
  "browserPrint",
  "browserSetZoomFactor",
  "browserSetDeviceEmulation",
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
  "browserGetDownloads",
  "browserDownloadAction",
  "browserListCredentials",
  "browserGetCredentialPassword",
  "browserUpsertCredential",
  "browserDeleteCredential",
  "browserListImportSources",
  "browserImportData",
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
  "getAutomationsSnapshot",
  "getScheduleRunInbox",
  "updateScheduleRunState",
  "cancelScheduleRun",
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
  "upsertForgePrWatch",
  "deletePrWatch",
  "syncPrWatchAgent",
] as const satisfies readonly IpcProcedureName[];

export type MainLocalProcedureName = (typeof MAIN_LOCAL_PROCEDURE_NAMES)[number];
export type SupervisorProcedureName = Exclude<IpcProcedureName, MainLocalProcedureName>;

export type { ProcedureArgs };
