import { appProcedures } from "./procedures/app";
import { browserProcedures } from "./procedures/browser";
import { dbProcedures } from "./procedures/db";
import { githubProcedures } from "./procedures/github";
import { gitProcedures } from "./procedures/git";
import { lspProcedures } from "./procedures/lsp";
import { profileProcedures } from "./procedures/profile";
import { projectTreeProcedures } from "./procedures/projectTree";
import { settingsProcedures } from "./procedures/settings";
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
  db: dbProcedures,
  updates: updatesProcedures,
  lsp: lspProcedures,
  browser: browserProcedures,
  usage: usageProcedures,
  profile: profileProcedures,
} as const;

export const ipcProcedureMap = {
  ...appProcedures,
  ...threadProcedures,
  ...gitProcedures,
  ...githubProcedures,
  ...projectTreeProcedures,
  ...settingsProcedures,
  ...dbProcedures,
  ...updatesProcedures,
  ...lspProcedures,
  ...browserProcedures,
  ...usageProcedures,
  ...profileProcedures,
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
  "relaunchApp",
  "getHomeScopeLocation",
  "getKeybindings",
  "setKeybindings",
  "getRemoteAccessPairing",
  "setRemoteAccessEnabled",
  "revokeRemoteAccessSession",
  "getRemoteAccessTailscaleStatus",
  "setRemoteAccessTailscaleHttps",
  "startTailscale",
  "setRemoteAccessAdvertisedUrl",
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
] as const satisfies readonly IpcProcedureName[];

export type MainLocalProcedureName = (typeof MAIN_LOCAL_PROCEDURE_NAMES)[number];
export type SupervisorProcedureName = Exclude<IpcProcedureName, MainLocalProcedureName>;

export type { ProcedureArgs };
