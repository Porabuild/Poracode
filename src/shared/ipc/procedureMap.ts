import { appProcedures } from "./procedures/app";
import { browserProcedures } from "./procedures/browser";
import { dbProcedures } from "./procedures/db";
import { experimentProcedures } from "./procedures/experiment";
import { githubProcedures } from "./procedures/github";
import { gitProcedures } from "./procedures/git";
import { lspProcedures } from "./procedures/lsp";
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
} as const;

export const ipcProcedureMap = {
  ...appProcedures,
  ...threadProcedures,
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
} as const;

export type IpcProcedureMap = typeof ipcProcedureMap;
export type IpcProcedureName = keyof IpcProcedureMap;

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
  "remoteHttpRequest",
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
  "dbPersistExperimentState",
  "dbGetThreadRuntimeItems",
  "dbGetThreadRuntimeItemsPage",
  "dbGetLatestThreadGoalItem",
  "dbTruncateThreadRuntimeAfter",
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
