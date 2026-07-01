import { homedir } from "node:os";
import { dirname } from "node:path";
import { clipboard, dialog, nativeImage, shell, type BrowserWindow } from "electron";
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
import type { RemoteAccessServer } from "../remote";
import type { AutoUpdaterController } from "../updates/autoUpdater";
import {
  defineMainLocalIpcHandlers,
  type MainLocalIpcHandlerMap,
  type WindowChromePayload,
  type WindowChromeResult,
} from "@/shared/ipc";
import { supportsNativeWindowMaterial, syncNativeThemeForMaterial } from "../window/windowMaterial";
import type { AgentInstanceConfig } from "@/shared/contracts";
import { headersToRecord, readBoundedResponseBody } from "@/shared/http";
import type { LightcodePaths } from "@/shared/lightcodePaths";
import { UsageLoginManager } from "../usageLogin/UsageLoginManager";

interface CreateLocalIpcHandlersOptions {
  getMainWindow(): BrowserWindow | null;
  getBrowserPanelManager(): BrowserPanelManager | null;
  getRemoteAccessServer(): RemoteAccessServer | null;
  setRemoteAccessEnabled(enabled: boolean): Promise<RemoteAccessPairingInfo>;
  requireLightcodePaths(): LightcodePaths;
  updatePowerSaveBlocker(): void;
  autoUpdater: AutoUpdaterController;
  onSharedSettingsChanged?(): void;
  /** Per-thread git/PR summaries mirrored from the renderer for remote clients. */
  onRemoteGitSummaries?(summaries: RemoteGitSummaries): void;
  extractBrowserToWindow(): void;
  injectBrowserToMain(): void;
  /** Relaunch the app (exposed via the relaunchApp IPC). */
  requestRelaunch(): void;
}

function requireBrowserPanel(getter: () => BrowserPanelManager | null): BrowserPanelManager {
  const mgr = getter();
  if (!mgr) {
    throw new Error("Browser panel manager is not initialized.");
  }
  return mgr;
}

export function getRemoteAccessPairingInfo(
  server: RemoteAccessServer | null,
): RemoteAccessPairingInfo {
  if (!server) {
    return { status: "disabled" };
  }
  const info = server.getInfo();
  if (!info) {
    return { status: "starting" };
  }
  return {
    status: "ready",
    httpBaseUrl: info.httpBaseUrl,
    wsBaseUrl: info.wsBaseUrl,
    pairingUrl: server.issuePairingUrl("Settings QR"),
    sessions: server.listAccessSessions(),
  };
}

let usageLoginManager: UsageLoginManager | null = null;
function getUsageLoginManager(
  requirePaths: () => LightcodePaths,
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
    // Desktop-as-client: proxy a remote Lightcode server request through the
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
      if (!win) return;
      if (win.isMinimized()) {
        win.restore();
      }
      win.focus();
    },
    relaunchApp: () => {
      options.requestRelaunch();
    },
    getHomeScopeLocation: () =>
      process.platform === "win32"
        ? { kind: "windows", path: homedir() }
        : { kind: "posix", path: homedir() },
    getKeybindings: () => readKeybindingsFile(options.requireLightcodePaths().keybindingsPath),
    setKeybindings: (file) =>
      writeKeybindingsFile(options.requireLightcodePaths().keybindingsPath, file),
    getRemoteAccessPairing: () => getRemoteAccessPairingInfo(options.getRemoteAccessServer()),
    setRemoteAccessEnabled: (payload) => options.setRemoteAccessEnabled(payload.enabled),
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
    getSharedSettings: () => readSharedSettingsFile(options.requireLightcodePaths().settingsPath),
    setSharedSettings: (settings) => {
      const settingsPath = options.requireLightcodePaths().settingsPath;
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
      writeSharedSettingsFile(settingsPath, {
        ...settings,
        acpRegistryInstalledAgents: onDisk.acpRegistryInstalledAgents,
        agentInstances: {
          ...rendererManagedInstances,
          ...supervisorManagedInstances,
        },
        agentHookSupport: onDisk.agentHookSupport,
      });
      options.updatePowerSaveBlocker();
      options.onSharedSettingsChanged?.();
    },
    setClaudeProfileEnvironment: (payload) => {
      const settingsPath = options.requireLightcodePaths().settingsPath;
      const { settings, instance } = applyClaudeProfileEnvironment(
        readSharedSettingsFile(settingsPath),
        payload,
        dirname(settingsPath),
      );
      writeSharedSettingsFile(settingsPath, settings);
      options.onSharedSettingsChanged?.();
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
          wantsMaterial ? "#00000000" : payload.appearance === "dark" ? "#141416" : "#f1f1f4",
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
    dbGetProjectNotes: ({ projectId }) => dbGetProjectNotes(projectId),
    dbSetProjectNotes: (notes) => dbSetProjectNotes(notes),
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
    submitUsageApiKey: (payload) =>
      getUsageLoginManager(
        options.requireLightcodePaths,
        options.getBrowserPanelManager,
      ).submitApiKey(payload.providerId, payload.apiKey),
    resolveUsageLoginConfirmation: (payload) => {
      requireBrowserPanel(options.getBrowserPanelManager).resolveUsageLoginConfirmation(payload);
    },
    getUsageLoginState: () =>
      getUsageLoginManager(
        options.requireLightcodePaths,
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
