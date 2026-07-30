import { appProcedures } from "./procedures/app";
import { browserProcedures } from "./procedures/browser";
import { dbProcedures } from "./procedures/db";
import { githubProcedures } from "./procedures/github";
import { gitProcedures } from "./procedures/git";
import { lspProcedures } from "./procedures/lsp";
import { mcpProcedures } from "./procedures/mcp";
import { profileProcedures } from "./procedures/profile";
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
  skills: skillProcedures,
} as const;

export const ipcProcedureMap = {
  ...appProcedures,
  ...threadProcedures,
  ...gitProcedures,
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
  ...skillProcedures,
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
  "saveClipboardImage",
  "saveHandoffContext",
  "saveImageFile",
  "copyImageToClipboard",
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
  "setClaudeProfileEnvironment",
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
  "getSchedules",
  "createSchedule",
  "updateSchedule",
  "deleteSchedule",
  "runScheduleNow",
  "getScheduleRuns",
] as const satisfies readonly IpcProcedureName[];

export type MainLocalProcedureName = (typeof MAIN_LOCAL_PROCEDURE_NAMES)[number];
export type SupervisorProcedureName = Exclude<IpcProcedureName, MainLocalProcedureName>;

export type { ProcedureArgs };
