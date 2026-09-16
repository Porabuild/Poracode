import { mkdir } from "node:fs/promises";
import {
  app,
  clipboard,
  ClipboardItem,
  dialog,
  nativeImage,
  shell,
  type BrowserWindow,
} from "electron";
import type { BrowserPanelManager } from "../browser";
import { openMicrophoneSettings } from "../browser/permissions";
import {
  deleteThreadAttachments,
  deleteThreadAttachmentsAsync,
  readLocalImageFile,
  resolveProjectFsPath,
  saveClipboardImageFile,
  saveHandoffContextFile,
  writeImageFile,
} from "../attachments/localFiles";
import { createProjectDirectory } from "../projectDirectory";
import { detectProjectIconFile, listProjectIconFiles } from "../projectIconDetect";
import { showOsNotification } from "../osNotifications";
import { showAndFocusWindow } from "../window/showAndFocusWindow";
import { readKeybindingsFile, writeKeybindingsFile } from "../keybindingsFile";
import type { KeybindingsFile } from "@/shared/keybindings";
import type { RendererEventSender } from "../backend/rendererEventInterestRegistry";
import type { AutoUpdaterController } from "../updates/autoUpdater";
import {
  defineMainLocalIpcHandlers,
  type IpcProcedurePayload,
  type IpcProcedureResult,
  type MainLocalIpcHandlerMap,
  type WindowChromePayload,
  type WindowChromeResult,
} from "@/shared/ipc";
import type {
  BackendDatabaseCaller,
  BackendDatabaseProcedureName,
  BackendServiceCaller,
} from "@/shared/backendHostProtocol";
import { supportsNativeWindowMaterial, syncNativeThemeForMaterial } from "../window/windowMaterial";
import type { CheckpointRevertResult } from "@/shared/contracts";
import type { PoracodePaths } from "@/shared/poracodePaths";
import { UsageLoginManager } from "../usageLogin/UsageLoginManager";
import type { SshConnectionManager } from "../ssh/SshConnectionManager";
import { homeScopeLocation } from "@/shared/homeScopeLocation";
import { resolvePoracodeChannel } from "@/shared/channel";
import { resolveLegacyElectronUserDataDir } from "@/shared/legacyProductPaths";

interface CreateLocalIpcHandlersOptions {
  getMainWindow(): BrowserWindow | null;
  getBrowserPanelManager(): BrowserPanelManager | null;
  sshConnectionManager: SshConnectionManager;
  requirePoracodePaths(): PoracodePaths;
  legacyElectronUserDataDir?: string;
  legacyBaseDir?: string;
  updatePowerSaveBlocker(): void;
  autoUpdater: AutoUpdaterController;
  /** Called with the keybindings just written, so consumers don't re-read the file. */
  onKeybindingsChanged?(file: KeybindingsFile): void;
  setGlobalShortcutsSuspended?(suspended: boolean): void;
  setRendererEventInterests(
    interests: IpcProcedurePayload<"setRendererEventInterests">,
    sender?: RendererEventSender,
  ): Promise<void>;
  extractBrowserToWindow(): void;
  injectBrowserToMain(): void;
  /** Relaunch the app (exposed via the relaunchApp IPC). */
  requestRelaunch(): void;
  database: BackendDatabaseCaller;
  backendServices: BackendServiceCaller;
  /** WS2 stage 4: forwards the compound checkpoint revert to the backend host. */
  revertCheckpoint(input: {
    threadId: string;
    checkpointItemId: string;
    operationKey: string;
  }): Promise<CheckpointRevertResult>;
}

function requireBrowserPanel(getter: () => BrowserPanelManager | null): BrowserPanelManager {
  const mgr = getter();
  if (!mgr) {
    throw new Error("Browser panel manager is not initialized.");
  }
  return mgr;
}

let usageLoginManager: UsageLoginManager | null = null;
function getUsageLoginManager(
  requirePaths: () => PoracodePaths,
  getBrowserPanel: () => BrowserPanelManager | null,
): UsageLoginManager {
  usageLoginManager ??= new UsageLoginManager(requirePaths(), getBrowserPanel);
  return usageLoginManager;
}

function roundRect(rect: { x: number; y: number; width: number; height: number }) {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function assertSafeExternalUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid external URL");
  }

  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`External URL protocol is not allowed: ${parsed.protocol}`);
  }
  return parsed.toString();
}

/** The composer "attach files" picker, shared by the main window and the quick composer. */
export async function showAddFilesDialog(
  parent: BrowserWindow,
  payload?: { title?: string; filters?: Electron.FileFilter[]; defaultPath?: string },
): Promise<string[] | null> {
  const result = await dialog.showOpenDialog(parent, {
    properties: ["openFile", "multiSelections"],
    title: payload?.title ?? "Add files or photos",
    filters: payload?.filters ?? [{ name: "All Files", extensions: ["*"] }],
    ...(payload?.defaultPath ? { defaultPath: payload.defaultPath } : {}),
  });
  return result.canceled ? null : result.filePaths;
}

export function createLocalIpcHandlers(
  options: CreateLocalIpcHandlersOptions,
): MainLocalIpcHandlerMap {
  const callService = options.backendServices.callService.bind(options.backendServices);
  const callDatabase = <Name extends BackendDatabaseProcedureName>(
    name: Name,
    payload: IpcProcedurePayload<Name>,
  ): Promise<IpcProcedureResult<Name>> | IpcProcedureResult<Name> => {
    return options.database.callDatabase(name, payload);
  };
  return defineMainLocalIpcHandlers({
    pickFolder: async (defaultPath) => {
      const result = await dialog.showOpenDialog(options.getMainWindow()!, {
        properties: ["openDirectory"],
        title: "Add Project",
        ...(defaultPath ? { defaultPath } : {}),
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    pickFiles: (payload) =>
      showAddFilesDialog(options.getMainWindow()!, {
        ...(payload?.title ? { title: payload.title } : {}),
        ...(payload?.filters ? { filters: payload.filters } : {}),
        ...(payload?.defaultPath ? { defaultPath: payload.defaultPath } : {}),
      }),
    detectProjectIcon: ({ projectLocation }) => detectProjectIconFile(projectLocation),
    listProjectIconFiles: ({ projectLocation }) => listProjectIconFiles(projectLocation),
    saveClipboardImage: (payload) =>
      saveClipboardImageFile(options.requirePoracodePaths(), payload),
    saveHandoffContext: (payload) =>
      saveHandoffContextFile(options.requirePoracodePaths(), payload),
    saveImageFile: async ({ data, suggestedName }) => {
      const win = options.getMainWindow();
      const result = await dialog.showSaveDialog(win!, {
        title: "Save image",
        defaultPath: suggestedName,
        filters: [
          { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"] },
        ],
      });
      if (result.canceled || !result.filePath) return null;
      writeImageFile(result.filePath, data);
      return result.filePath;
    },
    copyImageToClipboard: async ({ data }) => {
      // `nativeImage.createFromBuffer` only decodes PNG/JPEG; the renderer
      // converts other formats to PNG first. Report whether anything landed on
      // the clipboard so the UI doesn't claim success on an empty image.
      const image = nativeImage.createFromBuffer(Buffer.from(data));
      if (image.isEmpty()) return false;
      await clipboard.write([
        new ClipboardItem({ "image/png": new Blob([Uint8Array.from(image.toPNG())]) }),
      ]);
      return true;
    },
    readLocalImageFile: ({ url }) => readLocalImageFile(url),
    createProjectDirectory: (payload) => createProjectDirectory(payload),
    openExternal: async (url) => {
      const safeUrl = assertSafeExternalUrl(url);
      const browserPanel = options.getBrowserPanelManager();
      if (browserPanel && (await browserPanel.openLink(safeUrl))) {
        return;
      }
      await shell.openExternal(safeUrl);
    },
    openExternalNative: async (url) => {
      await shell.openExternal(assertSafeExternalUrl(url));
    },
    openMicrophoneSettings: () => openMicrophoneSettings(),
    focusWindow: () => {
      const win = options.getMainWindow();
      if (!win || win.isDestroyed()) return;
      showAndFocusWindow(win);
    },
    showNotification: (payload) => showOsNotification(payload, options.getMainWindow),
    requestLegacyDataMigration: () => {
      const baseDir = options.requirePoracodePaths().baseDir;
      const channel = resolvePoracodeChannel();
      const electronUserDataDir = app.getPath("userData");
      return callService("requestLegacyDataMigration", {
        baseDir,
        channel,
        electronUserDataDir,
        legacyElectronUserDataDir:
          options.legacyElectronUserDataDir ??
          resolveLegacyElectronUserDataDir(electronUserDataDir, channel),
        ...(options.legacyBaseDir ? { legacyBaseDir: options.legacyBaseDir } : {}),
        allowCustomDataRoot: app.isPackaged,
      });
    },
    relaunchApp: () => {
      options.requestRelaunch();
    },
    getHomeScopeLocation: () => homeScopeLocation(),
    getKeybindings: () => readKeybindingsFile(options.requirePoracodePaths().keybindingsPath),
    setKeybindings: (file) => {
      const path = options.requirePoracodePaths().keybindingsPath;
      options.setGlobalShortcutsSuspended?.(false);
      options.onKeybindingsChanged?.(file);
      try {
        return writeKeybindingsFile(path, file);
      } catch (error) {
        try {
          // The write is atomic, so on failure the file still holds the
          // previous bindings — re-apply them to roll the shortcuts back.
          options.onKeybindingsChanged?.(readKeybindingsFile(path).file);
        } catch (restoreError) {
          console.error("[poracode] failed to restore global shortcuts:", restoreError);
        }
        throw error;
      }
    },
    setGlobalShortcutsSuspended: (payload) =>
      options.setGlobalShortcutsSuspended?.(payload.suspended),
    setRendererEventInterests: async (interests, sender?: RendererEventSender) =>
      options.setRendererEventInterests(interests, sender),
    getRemoteAccessPairing: () => callService("getRemoteAccessPairing", {}),
    refreshRemoteAccessPairing: () => callService("refreshRemoteAccessPairing", {}),
    setRemoteAccessEnabled: (payload) => callService("setRemoteAccessEnabled", payload),
    sshDiscoverHosts: () => options.sshConnectionManager.discoverHosts(),
    sshConnect: (payload) => options.sshConnectionManager.connect(payload),
    sshDisconnect: ({ connectionId }) => options.sshConnectionManager.disconnect(connectionId),
    getRemoteAccessTailscaleStatus: () => callService("getRemoteAccessTailscaleStatus", {}),
    setRemoteAccessTailscaleHttps: (payload) =>
      callService("setRemoteAccessTailscaleHttps", payload),
    startTailscale: () => callService("startTailscale", {}),
    setRemoteAccessAdvertisedUrl: (payload) => callService("setRemoteAccessAdvertisedUrl", payload),
    revokeRemoteAccessSession: (payload) => callService("revokeRemoteAccessSession", payload),
    revealProjectEntry: async (payload) => {
      shell.showItemInFolder(resolveProjectFsPath(payload));
    },
    openPluginsFolder: async () => {
      // Created on demand so the folder is always there to drop a package into,
      // even on a fresh install that has never loaded a user plugin.
      const pluginsDir = options.requirePoracodePaths().pluginsDir;
      await mkdir(pluginsDir, { recursive: true });
      await shell.openPath(pluginsDir);
    },
    publishRemoteGitSummaries: (payload) => {
      return callService("publishRemoteGitSummaries", payload);
    },
    getSharedSettings: () => callService("getSharedSettings", {}),
    setSharedSettings: (settings) => callService("setSharedSettings", settings),
    settingsTransactionMutate: (payload) => callService("settingsTransactionMutate", payload),
    settingsTransactionSnapshot: () => callService("settingsTransactionSnapshot", {}),
    setAgentSecretSetting: (payload) => callService("setAgentSecretSetting", payload),
    removeCrossagentRoutingOverride: (payload) =>
      callService("removeCrossagentRoutingOverride", payload),
    removeCrossagentMemoryEntry: (payload) => callService("removeCrossagentMemoryEntry", payload),
    updateCrossagentMemoryEntryTags: (payload) =>
      callService("updateCrossagentMemoryEntryTags", payload),
    setProfileEnvironment: (payload) => callService("setProfileEnvironment", payload),
    createProfile: (payload) => callService("createProfile", payload),
    setWindowChrome: async (payload: WindowChromePayload): Promise<WindowChromeResult> => {
      const nativeCapable = supportsNativeWindowMaterial();
      const mainWindow = options.getMainWindow();
      if (!mainWindow) {
        return { nativeCapable };
      }
      if (process.platform === "win32" || process.platform === "linux") {
        mainWindow.setTitleBarOverlay({
          color: payload.backgroundColor,
          symbolColor: payload.symbolColor,
          height: 32,
        });
      }
      // Toggle the native translucency material live. macOS vibrancy is created
      // with the window and revealed/hidden purely via CSS, so there is nothing
      // to switch here. Windows acrylic is toggled at runtime (no relaunch).
      const wantsMaterial = payload.materialEnabled === true && nativeCapable;
      if (process.platform === "win32") {
        mainWindow.setBackgroundMaterial(wantsMaterial ? "acrylic" : "none");
        mainWindow.setBackgroundColor(
          wantsMaterial ? "#00000000" : payload.appearance === "dark" ? "#070709" : "#f1f1f4",
        );
      }
      if (wantsMaterial && payload.appearance) {
        syncNativeThemeForMaterial(payload.appearance);
      }
      return { nativeCapable };
    },
    dbGetProjects: (payload) => callDatabase("dbGetProjects", payload),
    dbGetThreads: (payload) => callDatabase("dbGetThreads", payload),
    dbGetState: (payload) => callDatabase("dbGetState", payload),
    dbSetState: (payload) => callDatabase("dbSetState", payload),
    dbUpsertProject: async (project) => {
      await callDatabase("dbUpsertProject", project);
    },
    dbUpsertThread: async (thread) => {
      await callDatabase("dbUpsertThread", thread);
    },
    dbDeleteThread: async (payload) => {
      await callDatabase("dbDeleteThread", payload);
      const { threadId } = payload;
      deleteThreadAttachments(options.requirePoracodePaths(), threadId);
    },
    dbDeleteProject: async (payload) => {
      await callDatabase("dbDeleteProject", payload);
    },
    dbSyncAll: async (payload) => {
      await callDatabase("dbSyncAll", payload);
    },
    dbSyncChanges: async (payload) => {
      await callDatabase("dbSyncChanges", payload);
    },
    dbPersistExperimentState: async (payload) => {
      await callDatabase("dbPersistExperimentState", payload);
      const paths = options.requirePoracodePaths();
      await Promise.all(
        payload.deletedThreadIds.map((threadId) => deleteThreadAttachmentsAsync(paths, threadId)),
      );
    },
    dbGetThreadRuntimeItems: (payload) => callDatabase("dbGetThreadRuntimeItems", payload),
    dbGetThreadRuntimeItemsPage: (payload) => callDatabase("dbGetThreadRuntimeItemsPage", payload),
    dbGetLatestThreadGoalItem: (payload) => callDatabase("dbGetLatestThreadGoalItem", payload),
    dbTruncateThreadRuntimeAfter: (payload) =>
      callDatabase("dbTruncateThreadRuntimeAfter", payload),
    revertCheckpoint: (payload) => options.revertCheckpoint(payload),
    dbReplaceThreadRuntimeItems: (payload) => callDatabase("dbReplaceThreadRuntimeItems", payload),
    dbGetThreadCompletedTurns: (payload) => callDatabase("dbGetThreadCompletedTurns", payload),
    dbReplaceThreadCompletedTurns: (payload) =>
      callDatabase("dbReplaceThreadCompletedTurns", payload),
    dbReplaceThreadRuntimeSnapshot: (payload) =>
      callDatabase("dbReplaceThreadRuntimeSnapshot", payload),
    dbGetThreadContextUsage: (payload) => callDatabase("dbGetThreadContextUsage", payload),
    dbGetProjectNotes: (payload) => callDatabase("dbGetProjectNotes", payload),
    dbSetProjectNotes: (payload) => callDatabase("dbSetProjectNotes", payload),
    getSchedules: () => callService("getSchedules", {}),
    createSchedule: (task) => callService("createSchedule", task),
    updateSchedule: (payload) => callService("updateSchedule", payload),
    deleteSchedule: (payload) => callService("deleteSchedule", payload),
    runScheduleNow: (payload) => callService("runScheduleNow", payload),
    getScheduleRuns: (payload) => callDatabase("getScheduleRuns", payload),
    getPrWatch: (payload) => callService("getPrWatch", payload),
    checkPrWatch: (payload) => callService("checkPrWatch", payload),
    upsertPrWatch: (watch) => callService("upsertPrWatch", watch),
    deletePrWatch: (payload) => callService("deletePrWatch", payload),
    syncPrWatchAgent: (agent) => callService("syncPrWatchAgent", agent),
    getUpdateStatus: () => options.autoUpdater.getStatus(),
    checkForUpdate: () => options.autoUpdater.checkForUpdate(),
    startUpdateDownload: () => options.autoUpdater.startUpdateDownload(),
    installUpdate: () => options.autoUpdater.installUpdate(),
    browserGetState: () => requireBrowserPanel(options.getBrowserPanelManager).snapshot(),
    browserCreateTab: (payload) =>
      requireBrowserPanel(options.getBrowserPanelManager).createTab({
        ...(payload.url !== undefined ? { url: payload.url } : {}),
        ...(payload.activate !== undefined ? { activate: payload.activate } : {}),
        ...(payload.reveal !== undefined ? { reveal: payload.reveal } : {}),
      }),
    browserCloseTab: ({ tabId }) =>
      requireBrowserPanel(options.getBrowserPanelManager).closeTab(tabId),
    browserActivateTab: ({ tabId }) => {
      requireBrowserPanel(options.getBrowserPanelManager).setActiveTab(tabId);
    },
    browserMoveTab: ({ tabId, targetTabId, position }) => {
      requireBrowserPanel(options.getBrowserPanelManager).moveTab(tabId, targetTabId, position);
    },
    browserSetGroupCollapsed: ({ groupId, collapsed }) => {
      requireBrowserPanel(options.getBrowserPanelManager).setGroupCollapsed(groupId, collapsed);
    },
    browserUngroupGroup: ({ groupId }) => {
      requireBrowserPanel(options.getBrowserPanelManager).ungroupGroup(groupId);
    },
    browserCloseGroup: ({ groupId }) =>
      requireBrowserPanel(options.getBrowserPanelManager).closeGroup(groupId),
    browserNewTabInGroup: async ({ groupId }) => {
      await requireBrowserPanel(options.getBrowserPanelManager).newTabInGroup(groupId);
    },
    browserRenameGroup: ({ groupId, title }) => {
      requireBrowserPanel(options.getBrowserPanelManager).renameGroup(groupId, title);
    },
    browserSetGroupColor: ({ groupId, color }) => {
      requireBrowserPanel(options.getBrowserPanelManager).setGroupColor(groupId, color);
    },
    browserNavigate: ({ tabId, url }) =>
      requireBrowserPanel(options.getBrowserPanelManager).navigate(tabId, url),
    browserBack: ({ tabId }) => requireBrowserPanel(options.getBrowserPanelManager).back(tabId),
    browserForward: ({ tabId }) =>
      requireBrowserPanel(options.getBrowserPanelManager).forward(tabId),
    browserReload: ({ tabId }) => requireBrowserPanel(options.getBrowserPanelManager).reload(tabId),
    browserHardReload: ({ tabId }) =>
      requireBrowserPanel(options.getBrowserPanelManager).hardReload(tabId),
    browserToggleDevTools: ({ tabId }) =>
      requireBrowserPanel(options.getBrowserPanelManager).toggleDevTools(tabId),
    browserClearHistory: ({ tabId }) =>
      requireBrowserPanel(options.getBrowserPanelManager).clearHistory(tabId),
    browserClearCookies: ({ tabId }) =>
      requireBrowserPanel(options.getBrowserPanelManager).clearCookies(tabId),
    browserClearCache: ({ tabId }) =>
      requireBrowserPanel(options.getBrowserPanelManager).clearCache(tabId),
    browserCopyScreenshot: async ({ tabId }) => {
      const bytes = await requireBrowserPanel(options.getBrowserPanelManager).capturePng(tabId);
      if (bytes) {
        await clipboard.write([
          new ClipboardItem({ "image/png": new Blob([Uint8Array.from(bytes)]) }),
        ]);
      }
    },
    browserCapturePreview: async ({ tabId }) => {
      const bytes = await requireBrowserPanel(options.getBrowserPanelManager).capturePng(tabId);
      if (!bytes) return { dataUrl: null };
      return { dataUrl: `data:image/png;base64,${bytes.toString("base64")}` };
    },
    browserAttachWebContents: ({ tabId, webContentsId }) => {
      requireBrowserPanel(options.getBrowserPanelManager).attachWebContents(tabId, webContentsId);
    },
    browserStartPicker: (payload) =>
      requireBrowserPanel(options.getBrowserPanelManager).startPicker(payload),
    browserCancelPicker: () => {
      requireBrowserPanel(options.getBrowserPanelManager).cancelPicker();
    },
    browserSuggest: ({ query }) =>
      requireBrowserPanel(options.getBrowserPanelManager).suggest(query),
    browserAddBookmark: ({ url, title, faviconUrl }) => {
      requireBrowserPanel(options.getBrowserPanelManager).addBookmark({
        url,
        title,
        createdAt: Date.now(),
        ...(faviconUrl ? { faviconUrl } : {}),
      });
    },
    browserRemoveBookmark: ({ url }) => {
      requireBrowserPanel(options.getBrowserPanelManager).removeBookmark(url);
    },
    browserSetBookmarkBarVisible: ({ visible }) => {
      requireBrowserPanel(options.getBrowserPanelManager).setBookmarkBarVisible(visible);
    },
    browserRecentHistory: ({ limit }) =>
      requireBrowserPanel(options.getBrowserPanelManager).recentHistory(limit),
    browserExtractToWindow: () => {
      options.extractBrowserToWindow();
    },
    browserInjectToMain: () => {
      options.injectBrowserToMain();
    },
    startUsageLogin: (payload) =>
      getUsageLoginManager(options.requirePoracodePaths, options.getBrowserPanelManager).startLogin(
        payload.providerId,
      ),
    cancelUsageLogin: (payload) => {
      getUsageLoginManager(
        options.requirePoracodePaths,
        options.getBrowserPanelManager,
      ).cancelLogin(payload.providerId);
    },
    clearUsageLogin: (payload) =>
      getUsageLoginManager(options.requirePoracodePaths, options.getBrowserPanelManager).clearLogin(
        payload.providerId,
      ),
    submitUsageApiKey: (payload) =>
      getUsageLoginManager(
        options.requirePoracodePaths,
        options.getBrowserPanelManager,
      ).submitApiKey(payload.providerId, payload.apiKey),
    resolveUsageLoginConfirmation: (payload) => {
      requireBrowserPanel(options.getBrowserPanelManager).resolveUsageLoginConfirmation(payload);
    },
    getUsageLoginState: () =>
      getUsageLoginManager(
        options.requirePoracodePaths,
        options.getBrowserPanelManager,
      ).getLoginState(),
    getProfileCoreStats: (req) => callService("getProfileCoreStats", req),
    getProfileTokenStats: (req) => callService("getProfileTokenStats", req),
    getProfileDevices: () => callService("getProfileDevices", {}),
    getProfileIdentity: () => callService("getProfileIdentity", {}),
    setProfileIdentity: (identity) => callService("setProfileIdentity", identity),
    copyShareImage: async (rect) => {
      const win = options.getMainWindow();
      if (!win) return;
      const image = await win.webContents.capturePage(roundRect(rect));
      if (!image.isEmpty()) {
        await clipboard.write([
          new ClipboardItem({ "image/png": new Blob([Uint8Array.from(image.toPNG())]) }),
        ]);
      }
    },
    appendUsageEvents: (payload) => callDatabase("appendUsageEvents", payload),
  });
}
