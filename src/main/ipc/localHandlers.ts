import { dirname } from "node:path";
import { app, clipboard, dialog, nativeImage, shell, type BrowserWindow } from "electron";
import type { BrowserPanelManager } from "../browser";
import { openMicrophoneSettings } from "../browser/permissions";
import {
  dbAppendUsageEvents,
  dbDeleteProject,
  dbDeleteThread,
  dbGetProjectNotes,
  dbGetProjects,
  dbGetState,
  dbGetThreadCompletedTurns,
  dbGetThreadContextUsage,
  dbGetThreadRuntimeItems,
  dbGetThreads,
  dbListScheduleRuns,
  dbReplaceThreadCompletedTurns,
  dbReplaceThreadRuntimeSnapshot,
  dbReplaceThreadRuntimeItems,
  dbSetProjectNotes,
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
  writeImageFile,
} from "../attachments/localFiles";
import { createProjectDirectory } from "../projectDirectory";
import { showOsNotification } from "../osNotifications";
import { showAndFocusWindow } from "../window/showAndFocusWindow";
import {
  getProfileCoreStats,
  getProfileDevicesResponse,
  getProfileIdentityResponse,
  getProfileTokenStats,
  setProfileIdentityResponse,
} from "../profile";
import {
  applyClaudeProfileEnvironment,
  readSharedSettingsFile,
  writeSharedSettingsFile,
} from "../sharedSettingsFile";
import type { RemoteAccessPairingInfo, RemoteGitSummaries } from "@/shared/remote";
import { readKeybindingsFile, writeKeybindingsFile } from "../keybindingsFile";
import type { KeybindingsFile } from "@/shared/keybindings";
import type { RemoteAccessServer } from "../remote";
import { getRemoteAccessPairingInfo } from "../remote/pairingInfo";
import type { AutoUpdaterController } from "../updates/autoUpdater";
import {
  defineMainLocalIpcHandlers,
  type MainLocalIpcHandlerMap,
  type RemoteAccessTailscaleStatus,
  type StartTailscaleResult,
  type WindowChromePayload,
  type WindowChromeResult,
} from "@/shared/ipc";
import { supportsNativeWindowMaterial, syncNativeThemeForMaterial } from "../window/windowMaterial";
import type { AgentInstanceConfig } from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";
import { headersToRecord, readBoundedResponseBody } from "@/shared/http";
import type { PoracodePaths } from "@/shared/poracodePaths";
import { UsageLoginManager } from "../usageLogin/UsageLoginManager";
import type { SshConnectionManager } from "../ssh/SshConnectionManager";
import type { ScheduleService } from "../schedules/ScheduleService";
import { homeScopeLocation } from "../schedules";
import { resolvePoracodeChannel } from "@/shared/channel";
import {
  requestLegacyDataMigration,
  resolveLegacyElectronUserDataDir,
} from "../legacyDataMigration";

interface CreateLocalIpcHandlersOptions {
  getMainWindow(): BrowserWindow | null;
  getBrowserPanelManager(): BrowserPanelManager | null;
  getRemoteAccessServer(): RemoteAccessServer | null;
  setRemoteAccessEnabled(enabled: boolean): Promise<RemoteAccessPairingInfo>;
  getRemoteAccessTailscaleStatus(): Promise<RemoteAccessTailscaleStatus>;
  setRemoteAccessTailscaleHttps(enabled: boolean): Promise<RemoteAccessPairingInfo>;
  startTailscale(): Promise<StartTailscaleResult>;
  setRemoteAccessAdvertisedUrl(url: string): Promise<RemoteAccessPairingInfo>;
  sshConnectionManager: SshConnectionManager;
  requirePoracodePaths(): PoracodePaths;
  legacyElectronUserDataDir?: string;
  legacyBaseDir?: string;
  updatePowerSaveBlocker(): void;
  autoUpdater: AutoUpdaterController;
  /** Called with the settings just written, so consumers don't re-read the file. */
  onSharedSettingsChanged?(settings: SharedSettings): void;
  onKeybindingsChanged?(file: KeybindingsFile): void;
  setGlobalShortcutsSuspended?(suspended: boolean): void;
  /** Per-thread git/PR summaries mirrored from the renderer for remote clients. */
  onRemoteGitSummaries?(summaries: RemoteGitSummaries): void;
  extractBrowserToWindow(): void;
  injectBrowserToMain(): void;
  /** Relaunch the app (exposed via the relaunchApp IPC). */
  requestRelaunch(): void;
  scheduleService: ScheduleService;
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
const REMOTE_HTTP_RESPONSE_MAX_BYTES = 64 * 1024 * 1024;
const REMOTE_HTTP_REQUEST_TIMEOUT_MS = 60_000;

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
  payload?: { title?: string; filters?: Electron.FileFilter[] },
): Promise<string[] | null> {
  const result = await dialog.showOpenDialog(parent, {
    properties: ["openFile", "multiSelections"],
    title: payload?.title ?? "Add files or photos",
    filters: payload?.filters ?? [{ name: "All Files", extensions: ["*"] }],
  });
  return result.canceled ? null : result.filePaths;
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
    pickFiles: (payload) =>
      showAddFilesDialog(options.getMainWindow()!, {
        ...(payload?.title ? { title: payload.title } : {}),
        ...(payload?.filters ? { filters: payload.filters } : {}),
      }),
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
    copyImageToClipboard: ({ data }) => {
      // `nativeImage.createFromBuffer` only decodes PNG/JPEG; the renderer
      // converts other formats to PNG first. Report whether anything landed on
      // the clipboard so the UI doesn't claim success on an empty image.
      const image = nativeImage.createFromBuffer(Buffer.from(data));
      if (image.isEmpty()) return false;
      clipboard.writeImage(image);
      return true;
    },
    createProjectDirectory: (payload) => createProjectDirectory(payload),
    // Desktop-as-client: proxy a remote Poracode server request through the
    // main process (no browser CORS). Restricted to http(s) and a bounded
    // response so a hostile/buggy peer can't exfiltrate via odd schemes or
    // exhaust memory. (The remote is one the user explicitly paired with.)
    remoteHttpRequest: async (payload) => {
      const protocol = new URL(payload.url).protocol;
      if (protocol !== "http:" && protocol !== "https:") {
        throw new Error(`remoteHttpRequest only supports http(s), got "${protocol}".`);
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REMOTE_HTTP_REQUEST_TIMEOUT_MS);
      timeout.unref?.();

      try {
        const response = await fetch(payload.url, {
          method: payload.method ?? "GET",
          signal: controller.signal,
          ...(payload.headers ? { headers: payload.headers } : {}),
          ...(payload.body !== undefined ? { body: payload.body } : {}),
        });
        const buffer = await readBoundedResponseBody(response, REMOTE_HTTP_RESPONSE_MAX_BYTES);
        return {
          status: response.status,
          headers: headersToRecord(response.headers),
          body: Buffer.from(buffer).toString("utf8"),
        };
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error(`Remote request timed out after ${REMOTE_HTTP_REQUEST_TIMEOUT_MS}ms.`, {
            cause: error,
          });
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    },
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
      return requestLegacyDataMigration({
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
    getRemoteAccessPairing: () => getRemoteAccessPairingInfo(options.getRemoteAccessServer()),
    setRemoteAccessEnabled: (payload) => options.setRemoteAccessEnabled(payload.enabled),
    sshDiscoverHosts: () => options.sshConnectionManager.discoverHosts(),
    sshConnect: (payload) => options.sshConnectionManager.connect(payload),
    sshDisconnect: ({ connectionId }) => options.sshConnectionManager.disconnect(connectionId),
    getRemoteAccessTailscaleStatus: () => options.getRemoteAccessTailscaleStatus(),
    setRemoteAccessTailscaleHttps: (payload) =>
      options.setRemoteAccessTailscaleHttps(payload.enabled),
    startTailscale: () => options.startTailscale(),
    setRemoteAccessAdvertisedUrl: (payload) => options.setRemoteAccessAdvertisedUrl(payload.url),
    revokeRemoteAccessSession: (payload) => {
      const server = options.getRemoteAccessServer();
      if (!server) {
        return { revoked: false };
      }
      return { revoked: server.revokeAccessSession(payload.sessionId) };
    },
    revealProjectEntry: async (payload) => {
      shell.showItemInFolder(resolveProjectFsPath(payload));
    },
    publishRemoteGitSummaries: (payload) => {
      options.onRemoteGitSummaries?.(payload.summaries);
    },
    getSharedSettings: () => readSharedSettingsFile(options.requirePoracodePaths().settingsPath),
    setSharedSettings: (settings) => {
      const settingsPath = options.requirePoracodePaths().settingsPath;
      // Preserve supervisor-managed fields so the renderer's persist cycle
      // doesn't clobber writes made out-of-band by the supervisor.
      const onDisk = readSharedSettingsFile(settingsPath);
      const rendererManagedInstances = Object.fromEntries(
        Object.entries(settings.agentInstances)
          .filter(([, instance]) => instance.driver !== "acp-generic")
          .map(([id, instance]): [string, AgentInstanceConfig] => {
            // A Claude profile's `environment` is owned by the encrypting
            // `setClaudeProfileEnvironment` path. Pin it to disk so the
            // renderer's plaintext-capable persist cycle can never write a
            // secret in the clear or clear a saved one. Other drivers keep
            // their existing renderer-managed behavior.
            if (instance.driver !== "claude") return [id, instance];
            const onDiskEnv = onDisk.agentInstances[id]?.environment;
            const next: AgentInstanceConfig = { ...instance };
            if (onDiskEnv) next.environment = onDiskEnv;
            else delete next.environment;
            return [id, next];
          }),
      );
      const supervisorManagedInstances = Object.fromEntries(
        Object.entries(onDisk.agentInstances).filter(
          ([, instance]) => instance.driver === "acp-generic",
        ),
      );
      const merged: SharedSettings = {
        ...settings,
        acpRegistryInstalledAgents: onDisk.acpRegistryInstalledAgents,
        agentInstances: {
          ...rendererManagedInstances,
          ...supervisorManagedInstances,
        },
        agentHookSupport: onDisk.agentHookSupport,
      };
      writeSharedSettingsFile(settingsPath, merged);
      options.updatePowerSaveBlocker();
      options.onSharedSettingsChanged?.(merged);
    },
    setClaudeProfileEnvironment: (payload) => {
      const settingsPath = options.requirePoracodePaths().settingsPath;
      const { settings, instance } = applyClaudeProfileEnvironment(
        readSharedSettingsFile(settingsPath),
        payload,
        dirname(settingsPath),
      );
      writeSharedSettingsFile(settingsPath, settings);
      options.onSharedSettingsChanged?.(settings);
      return instance;
    },
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
    dbGetProjects: () => dbGetProjects(),
    dbGetThreads: () => dbGetThreads(),
    dbGetState: (key) => dbGetState(key),
    dbSetState: ({ key, value }) => dbSetState(key, value),
    dbUpsertProject: (project) => dbUpsertProject(project, 0),
    dbUpsertThread: (thread) => dbUpsertThread(thread, 0),
    dbDeleteThread: ({ threadId }) => {
      dbDeleteThread(threadId);
      deleteThreadAttachments(options.requirePoracodePaths(), threadId);
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
    dbGetProjectNotes: ({ projectId }) => dbGetProjectNotes(projectId),
    dbSetProjectNotes: (notes) => dbSetProjectNotes(notes),
    getSchedules: () => options.scheduleService.list(),
    createSchedule: (task) => options.scheduleService.create(task),
    updateSchedule: ({ id, task }) => options.scheduleService.update(id, task),
    deleteSchedule: ({ id }) => options.scheduleService.delete(id),
    runScheduleNow: ({ id }) => options.scheduleService.runNow(id),
    getScheduleRuns: ({ id }) => dbListScheduleRuns(id),
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
    getProfileCoreStats: (req) => getProfileCoreStats(req),
    getProfileTokenStats: (req) => getProfileTokenStats(req),
    getProfileDevices: () => getProfileDevicesResponse(),
    getProfileIdentity: () => getProfileIdentityResponse(),
    setProfileIdentity: (identity) => setProfileIdentityResponse(identity),
    copyShareImage: async (rect) => {
      const win = options.getMainWindow();
      if (!win) return;
      const image = await win.webContents.capturePage(roundRect(rect));
      if (!image.isEmpty()) clipboard.writeImage(image);
    },
    appendUsageEvents: ({ events }) => dbAppendUsageEvents(events),
  });
}
