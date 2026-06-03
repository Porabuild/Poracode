import { homedir } from "node:os";
import { clipboard, dialog, nativeImage, shell, type BrowserWindow } from "electron";
import type { BrowserPanelManager } from "../browser";
import { openMicrophoneSettings } from "../browser/permissions";
import { showAndFocusWindow } from "../window/showAndFocusWindow";
import {
  dbDeleteProject,
  dbDeleteThread,
  dbGetProjects,
  dbGetState,
  dbGetThreadCompletedTurns,
  dbGetThreadContextUsage,
  dbGetThreadRuntimeItems,
  dbGetThreads,
  dbReplaceThreadCompletedTurns,
  dbReplaceThreadRuntimeSnapshot,
  dbReplaceThreadRuntimeItems,
  dbSetState,
  dbSyncAll,
  dbUpsertProject,
  dbUpsertThread,
} from "../db";
import {
  deleteThreadAttachments,
  resolveProjectFsPath,
  saveClipboardImageFile,
  saveHandoffContextFile,
} from "../attachments/localFiles";
import { readSharedSettingsFile, writeSharedSettingsFile } from "../sharedSettingsFile";
import { readKeybindingsFile } from "../keybindingsFile";
import type { AutoUpdaterController } from "../updates/autoUpdater";
import {
  defineMainLocalIpcHandlers,
  type MainLocalIpcHandlerMap,
  type WindowChromePayload,
} from "@/shared/ipc";
import type { LightcodePaths } from "@/shared/lightcodePaths";
import { UsageLoginManager } from "../usageLogin/UsageLoginManager";

interface CreateLocalIpcHandlersOptions {
  getMainWindow(): BrowserWindow | null;
  getBrowserPanelManager(): BrowserPanelManager | null;
  requireLightcodePaths(): LightcodePaths;
  updatePowerSaveBlocker(): void;
  autoUpdater: AutoUpdaterController;
  onSharedSettingsChanged?(): void;
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
  requirePaths: () => LightcodePaths,
  getBrowserPanel: () => BrowserPanelManager | null,
): UsageLoginManager {
  usageLoginManager ??= new UsageLoginManager(requirePaths(), getBrowserPanel);
  return usageLoginManager;
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

export function createLocalIpcHandlers(
  options: CreateLocalIpcHandlersOptions,
): MainLocalIpcHandlerMap {
  return defineMainLocalIpcHandlers({
    pickFolder: async (defaultPath) => {
      const result = await dialog.showOpenDialog(options.getMainWindow()!, {
        properties: ["openDirectory"],
        title: "Add Project",
        ...(defaultPath ? { defaultPath } : {}),
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    pickFiles: async (payload) => {
      const result = await dialog.showOpenDialog(options.getMainWindow()!, {
        properties: ["openFile", "multiSelections"],
        title: payload?.title ?? "Add files or photos",
        filters: payload?.filters ?? [{ name: "All Files", extensions: ["*"] }],
      });
      return result.canceled ? null : result.filePaths;
    },
    saveClipboardImage: (payload) =>
      saveClipboardImageFile(options.requireLightcodePaths(), payload),
    saveHandoffContext: (payload) =>
      saveHandoffContextFile(options.requireLightcodePaths(), payload),
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
      if (win) showAndFocusWindow(win);
    },
    getHomeScopeLocation: () =>
      process.platform === "win32"
        ? { kind: "windows", path: homedir() }
        : { kind: "posix", path: homedir() },
    getKeybindings: () => readKeybindingsFile(options.requireLightcodePaths().keybindingsPath),
    revealProjectEntry: async (payload) => {
      shell.showItemInFolder(resolveProjectFsPath(payload));
    },
    getSharedSettings: () => readSharedSettingsFile(options.requireLightcodePaths().settingsPath),
    setSharedSettings: (settings) => {
      const settingsPath = options.requireLightcodePaths().settingsPath;
      // Preserve supervisor-managed fields so the renderer's persist cycle
      // doesn't clobber writes made out-of-band by the supervisor.
      const onDisk = readSharedSettingsFile(settingsPath);
      writeSharedSettingsFile(settingsPath, {
        ...settings,
        acpRegistryInstalledAgents: onDisk.acpRegistryInstalledAgents,
        agentInstances: onDisk.agentInstances,
        agentHookSupport: onDisk.agentHookSupport,
      });
      options.updatePowerSaveBlocker();
      options.onSharedSettingsChanged?.();
    },
    setWindowChrome: async (payload: WindowChromePayload) => {
      const mainWindow = options.getMainWindow();
      if (!mainWindow) {
        return;
      }
      if (process.platform === "win32" || process.platform === "linux") {
        mainWindow.setTitleBarOverlay({
          color: payload.backgroundColor,
          symbolColor: payload.symbolColor,
          height: 32,
        });
      }
    },
    dbGetProjects: () => dbGetProjects(),
    dbGetThreads: () => dbGetThreads(),
    dbGetState: (key) => dbGetState(key),
    dbSetState: ({ key, value }) => dbSetState(key, value),
    dbUpsertProject: (project) => dbUpsertProject(project, 0),
    dbUpsertThread: (thread) => dbUpsertThread(thread, 0),
    dbDeleteThread: ({ threadId }) => {
      dbDeleteThread(threadId);
      deleteThreadAttachments(options.requireLightcodePaths(), threadId);
    },
    dbDeleteProject: ({ projectId }) => dbDeleteProject(projectId),
    dbSyncAll: ({ projects, threads, viewJson }) => dbSyncAll(projects, threads, viewJson),
    dbGetThreadRuntimeItems: ({ threadId }) => dbGetThreadRuntimeItems(threadId),
    dbReplaceThreadRuntimeItems: ({ threadId, items }) =>
      dbReplaceThreadRuntimeItems(threadId, items),
    dbGetThreadCompletedTurns: ({ threadId }) => dbGetThreadCompletedTurns(threadId),
    dbReplaceThreadCompletedTurns: ({ threadId, turns }) =>
      dbReplaceThreadCompletedTurns(threadId, turns),
    dbReplaceThreadRuntimeSnapshot: ({ threadId, items, turns, contextUsage }) =>
      dbReplaceThreadRuntimeSnapshot(threadId, items, turns, contextUsage),
    dbGetThreadContextUsage: ({ threadId }) => dbGetThreadContextUsage(threadId),
    checkForUpdate: () => options.autoUpdater.checkForUpdate(),
    startUpdateDownload: () => options.autoUpdater.startUpdateDownload(),
    installUpdate: () => options.autoUpdater.installUpdate(),
    browserGetState: () => requireBrowserPanel(options.getBrowserPanelManager).snapshot(),
    browserCreateTab: (payload) =>
      requireBrowserPanel(options.getBrowserPanelManager).createTab({
        ...(payload.url !== undefined ? { url: payload.url } : {}),
        ...(payload.activate !== undefined ? { activate: payload.activate } : {}),
      }),
    browserCloseTab: ({ tabId }) =>
      requireBrowserPanel(options.getBrowserPanelManager).closeTab(tabId),
    browserActivateTab: ({ tabId }) => {
      requireBrowserPanel(options.getBrowserPanelManager).setActiveTab(tabId);
    },
    browserMoveTab: ({ tabId, targetTabId, position }) => {
      requireBrowserPanel(options.getBrowserPanelManager).moveTab(tabId, targetTabId, position);
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
        clipboard.writeImage(nativeImage.createFromBuffer(bytes));
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
    startUsageLogin: (payload) =>
      getUsageLoginManager(
        options.requireLightcodePaths,
        options.getBrowserPanelManager,
      ).startLogin(payload.providerId),
    cancelUsageLogin: (payload) => {
      getUsageLoginManager(
        options.requireLightcodePaths,
        options.getBrowserPanelManager,
      ).cancelLogin(payload.providerId);
    },
    clearUsageLogin: (payload) =>
      getUsageLoginManager(
        options.requireLightcodePaths,
        options.getBrowserPanelManager,
      ).clearLogin(payload.providerId),
    resolveUsageLoginConfirmation: (payload) => {
      requireBrowserPanel(options.getBrowserPanelManager).resolveUsageLoginConfirmation(payload);
    },
    getUsageLoginState: () =>
      getUsageLoginManager(
        options.requireLightcodePaths,
        options.getBrowserPanelManager,
      ).getLoginState(),
  });
}
