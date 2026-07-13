import { watch } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  session as electronSession,
} from "electron";
import { resolveThemeMode } from "@/shared/themeMode";
import {
  closeDatabase,
  dbDeleteThread,
  dbGetProject,
  dbGetThread,
  dbGetThreads,
  dbInsertScheduleRun,
  dbInterruptScheduleRuns,
  dbUpdateScheduleRun,
  dbUpsertThread,
  initDatabase,
} from "./db";
import { cleanupOrphanedAttachments, preparePoracodeDataRoot } from "./poracodeData";
import { handleOrchestratorThreadCreated } from "./orchestratorThreadBridge";
import { createLocalIpcHandlers, showAddFilesDialog } from "./ipc/localHandlers";
import { registerIpcHandlers } from "./ipc/registerHandlers";
import { createSleepInhibitor } from "./sleepInhibitor";
import {
  installLocalFileProtocolHandler,
  registerLocalFileProtocolScheme,
} from "./attachments/localFiles";
import {
  BrowserMcpIngress,
  BrowserPanelManager,
  ChromeBridgeServer,
  ChromeMcpIngress,
  installPickerProtocolHandler,
  registerPickerProtocolScheme,
} from "./browser";
import { buildBrowserUserAgent } from "./browser/userAgent";
import {
  ComputerUseDesktopOverlay,
  ComputerUseMcpIngress,
  type ComputerUseMcpIngressInfo,
} from "./computer-use";
import { SupervisorClient } from "./supervisor/SupervisorClient";
import { createAutoUpdaterController } from "./updates/autoUpdater";
import { createMainWindow } from "./window/createMainWindow";
import {
  createQuickComposerWindow,
  showQuickComposerWindow,
} from "./window/createQuickComposerWindow";
import { showAndFocusWindow } from "./window/showAndFocusWindow";
import { createTray, type TrayHandle } from "./tray";
import { readKeybindingsFile } from "./keybindingsFile";
import { QuickComposerShortcutManager } from "./quickComposerShortcut";
import { shouldStartMinimized, syncWindowsStartupRegistration } from "./startupSettings";
import { type PoracodePaths, resolvePoracodeBaseDir } from "@/shared/poracodePaths";
import { getAppName } from "@/shared/appName";
import { productNameFor, resolvePoracodeChannel } from "@/shared/channel";
import {
  IPC_EVENT_CHANNELS,
  IPC_WINDOW_CHANNELS,
  isAgentStatusSupervisorEvent,
  quickComposerSubmissionSchema,
  type QuickComposerSubmission,
  type SupervisorEvent,
} from "@/shared/ipc";
import type { SharedSettings } from "@/shared/settings";
import { readSharedSettingsFile } from "./sharedSettingsFile";
import { WindowsJobObjectManager } from "./windowsJobObject";
import { captureMainException, initializeMainSentry } from "./diagnostics/sentry";
import { configureSecretStorageKey } from "@/shared/secretStorage";
import { readOrCreateSafeStorageSecretKey } from "./secretStorageKey";
import { createDesktopRemoteAccessController, type DesktopRemoteAccessController } from "./remote";
import { SshConnectionManager } from "./ssh/SshConnectionManager";
import {
  createDeviceScheduleService,
  ensureHomeProjectRow,
  ScheduleRunCoordinator,
} from "./schedules";
import { AppControlsMcpIngress } from "./app-controls";
import { legacyProductNameFor, resolveLegacyElectronUserDataDir } from "./legacyDataMigration";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const channel = resolvePoracodeChannel();
const baseDirOverride = process.env.PORACODE_BASE_DIR;
const legacyBaseDirOverride = process.env.LIGHTCODE_BASE_DIR?.trim() || undefined;
const defaultElectronUserDataDir = app.getPath("userData");
const legacyElectronUserDataDir = legacyBaseDirOverride
  ? join(legacyBaseDirOverride, "userData")
  : resolveLegacyElectronUserDataDir(defaultElectronUserDataDir, channel, isDev);

// Electron keys macOS Keychain and Linux secret-store entries by app name.
// Initialize Chromium's crypto under the pre-rebrand technical identity so
// migrated secrets and browser sessions remain decryptable. The visible name
// is restored after Electron captures the crypto configuration during startup.
const preserveLegacySafeStorageIdentity = !isDev && process.platform !== "win32";
if (preserveLegacySafeStorageIdentity) {
  app.setName(legacyProductNameFor(channel));
  app.setPath("userData", defaultElectronUserDataDir);
}

if (process.env.PORACODE_CDP_PORT) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.PORACODE_CDP_PORT);
}

// Windows HDR can make DWM acrylic visibly change opacity when Chromium starts
// compositing image content in the display color space. Keep Chromium in sRGB so
// acrylic stays translucent without breathing as image planes appear/disappear.
if (process.platform === "win32") {
  app.commandLine.appendSwitch("force-color-profile", "srgb");
}
if (process.platform === "linux") {
  app.commandLine.appendSwitch("enable-features", "GlobalShortcutsPortal");
}

const browserUserAgent = buildBrowserUserAgent(app.userAgentFallback);
app.userAgentFallback = browserUserAgent;

if (baseDirOverride) {
  app.setPath("userData", join(baseDirOverride, "userData"));
} else if (isDev) {
  app.setPath("userData", join(app.getPath("userData"), "Dev"));
}

const hasSingleInstanceLock = isDev || app.requestSingleInstanceLock();
let poracodePaths: PoracodePaths | null = null;
if (hasSingleInstanceLock) {
  const electronUserDataDir = app.getPath("userData");
  poracodePaths = preparePoracodeDataRoot(
    baseDirOverride ?? (isDev ? join(homedir(), ".poracode-dev") : resolvePoracodeBaseDir(channel)),
    {
      channel,
      electronUserDataDir,
      legacyElectronUserDataDir,
      ...(legacyBaseDirOverride ? { legacyBaseDir: legacyBaseDirOverride } : {}),
      allowCustomDataRoot: app.isPackaged,
    },
  );
}

const sentryEnabled = initializeMainSentry({ appVersion: app.getVersion(), isDev, channel });

// Fallback global handlers so a stray throw in any main-process callback
// (IPC handler, Electron event listener, timer) is reported rather than
// silently taking the whole app — and the supervisor and all windows — down.
// Sentry's Electron integration also hooks these, but only when a DSN is
// configured and initialization succeeded; this guarantees coverage otherwise.
process.on("uncaughtException", (error) => {
  console.error("[poracode] uncaught exception:", error);
  captureMainException(error, { "poracode.feature_area": "main" });
});
process.on("unhandledRejection", (reason) => {
  console.error("[poracode] unhandled rejection:", reason);
  captureMainException(reason, { "poracode.feature_area": "main" });
});
const posthogEnabled = process.env.POSTHOG_ENABLED !== "0";
const posthogKey = posthogEnabled ? (process.env.POSTHOG_KEY ?? "").trim() : "";
const posthogHost = (process.env.POSTHOG_HOST ?? "").trim();
const posthogEnableDev = process.env.POSTHOG_ENABLE_DEV === "1";

const WINDOW_CHROME_HEIGHT = 32;

let mainWindow: BrowserWindow | null = null;
let quickComposerWindow: BrowserWindow | null = null;
let quickComposerDialogOpen = false;
let quickComposerDismissTimer: ReturnType<typeof setTimeout> | null = null;
let revealMainAfterQuickComposerDismiss = false;
let mainRendererReady = false;
const pendingQuickComposerSubmissions: QuickComposerSubmission[] = [];
let windowsJobObjectManager: WindowsJobObjectManager | null = null;
let browserPanelManager: BrowserPanelManager | null = null;
let browserMcpIngress: BrowserMcpIngress | null = null;
let computerUseMcpIngress: ComputerUseMcpIngress | null = null;
let appControlsMcpIngress: AppControlsMcpIngress | null = null;
let computerUseDesktopOverlay: ComputerUseDesktopOverlay | null = null;
let chromeBridgeServer: ChromeBridgeServer | null = null;
let chromeMcpIngress: ChromeMcpIngress | null = null;
let browserExtractWindow: BrowserWindow | null = null;
// Retained module-scope so the native Tray icon stays reachable from GC.
let tray: TrayHandle | null = null;
let quickComposerShortcutManager: QuickComposerShortcutManager | null = null;
let isQuitting = false;

function isCloseToTrayEnabled(): boolean {
  if (!poracodePaths) return false;
  try {
    return readSharedSettingsFile(poracodePaths.settingsPath).closeToTray;
  } catch {
    return false;
  }
}

/**
 * Resolves the saved appearance + opt-in translucent ("liquid glass") sidebar in
 * a single settings read, so the window opens already matching the theme and
 * material (flash-free first paint) before the renderer paints.
 */
function resolveWindowChromeOptions(): {
  appearance: "light" | "dark";
  sidebarTranslucency: boolean;
} {
  let mode: "system" | "light" | "dark" = "dark";
  let wantGlass = false;
  if (poracodePaths) {
    try {
      const settings = readSharedSettingsFile(poracodePaths.settingsPath);
      mode = settings.themeMode;
      wantGlass = settings.sidebarTranslucency === true;
    } catch {
      // Fall back to dark / opaque.
    }
  }
  return {
    appearance: resolveThemeMode(mode, nativeTheme.shouldUseDarkColors),
    sidebarTranslucency: wantGlass,
  };
}

function primeBrowserAllowFlags(settings?: SharedSettings): void {
  if (!poracodePaths) return;
  let allowEval = false;
  let allowDataAccess = false;
  try {
    const s = settings ?? readSharedSettingsFile(poracodePaths.settingsPath);
    allowEval = s.browser?.allowEval === true;
    allowDataAccess = s.browser?.allowDataAccess === true;
  } catch {
    allowEval = false;
    allowDataAccess = false;
  }
  // The embedded browser and the external Chrome bridge share the same
  // eval / data-access gates from browser settings.
  browserMcpIngress?.setAllowEval(allowEval);
  browserMcpIngress?.setAllowDataAccess(allowDataAccess);
  chromeMcpIngress?.setAllowEval(allowEval);
  chromeMcpIngress?.setAllowDataAccess(allowDataAccess);
}

// setLoginItemSettings writes the HKCU Run registry key on Windows; skip it
// when launchAtStartup hasn't changed so routine settings saves stay cheap.
let lastAppliedLaunchAtStartup: boolean | null = null;

function syncStartupSettings(settings?: SharedSettings): void {
  if (!poracodePaths) return;
  try {
    const s = settings ?? readSharedSettingsFile(poracodePaths.settingsPath);
    if (s.launchAtStartup === lastAppliedLaunchAtStartup) return;
    syncWindowsStartupRegistration(app, s, process.platform, isDev);
    lastAppliedLaunchAtStartup = s.launchAtStartup;
  } catch (error) {
    console.warn("[poracode] failed to update Windows startup registration", error);
  }
}

function handleSharedSettingsChanged(settings: SharedSettings): void {
  primeBrowserAllowFlags(settings);
  syncStartupSettings(settings);
}

function handleMainWindowClose(event: Electron.Event): void {
  if (isQuitting) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!isCloseToTrayEnabled()) return;
  event.preventDefault();
  mainWindow.hide();
}

function quickComposerWindowFor(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window && window === quickComposerWindow && !window.isDestroyed() ? window : null;
}

function flushQuickComposerSubmissions(): void {
  if (!mainRendererReady || !mainWindow || mainWindow.isDestroyed()) return;
  for (const submission of pendingQuickComposerSubmissions.splice(0)) {
    mainWindow.webContents.send(IPC_EVENT_CHANNELS.quickComposerSubmit, submission);
  }
}

function ensureMainWindow(showOnReady = true): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  mainRendererReady = false;
  mainWindow = createMainAppWindow(showOnReady);
  browserPanelManager?.bindHost(mainWindow);
  return mainWindow;
}

function finishQuickComposerDismiss(window: BrowserWindow): void {
  if (quickComposerDismissTimer) {
    clearTimeout(quickComposerDismissTimer);
    quickComposerDismissTimer = null;
  }
  if (!window.isDestroyed()) window.hide();
  if (!revealMainAfterQuickComposerDismiss) return;
  revealMainAfterQuickComposerDismiss = false;
  const target = ensureMainWindow();
  if (target.webContents.isLoading()) {
    target.once("ready-to-show", () => showAndFocusWindow(target));
  } else {
    showAndFocusWindow(target);
  }
}

function requestQuickComposerDismiss(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  window.webContents.send(IPC_EVENT_CHANNELS.quickComposerDismissRequested);
  if (quickComposerDismissTimer) clearTimeout(quickComposerDismissTimer);
  quickComposerDismissTimer = setTimeout(() => finishQuickComposerDismiss(window), 240);
}

// Window options shared by every app-renderer window (main + quick composer);
// each factory adds only the fields distinct to its surface.
function commonAppWindowOptions() {
  return {
    title: getAppName(channel, isDev),
    isDev,
    channel,
    preloadPath: join(__dirname, "preload.cjs"),
    rendererHtmlPath: join(__dirname, "../renderer/index.html"),
    appVersion: app.getVersion(),
    posthogEnableDev,
    posthogEnabled,
    posthogHost,
    posthogKey,
    sentryEnabled,
    browserUserAgent,
    ...(process.env.VITE_DEV_SERVER_URL ? { devServerUrl: process.env.VITE_DEV_SERVER_URL } : {}),
  };
}

function createQuickComposerAppWindow(): BrowserWindow {
  const window = createQuickComposerWindow({
    ...commonAppWindowOptions(),
    onClosed: () => {
      if (quickComposerWindow === window) quickComposerWindow = null;
    },
    onRendererProcessGone: (details) => {
      captureMainException(new Error(`Quick composer renderer gone: ${details.reason}`), {
        "poracode.feature_area": "quick-composer",
        "poracode.process": "renderer",
      });
    },
  });
  window.on("blur", () => {
    setTimeout(() => {
      if (
        !quickComposerDialogOpen &&
        !window.isDestroyed() &&
        window.isVisible() &&
        !window.isFocused()
      ) {
        requestQuickComposerDismiss(window);
      }
    }, 0);
  });
  window.webContents.on("before-input-event", (event, input) => {
    if (input.key !== "Escape" || input.type !== "keyDown") return;
    event.preventDefault();
    requestQuickComposerDismiss(window);
  });
  return window;
}

function toggleQuickComposerWindow(): void {
  if (quickComposerWindow && !quickComposerWindow.isDestroyed()) {
    if (quickComposerWindow.isVisible()) {
      requestQuickComposerDismiss(quickComposerWindow);
    } else {
      showQuickComposerWindow(quickComposerWindow);
    }
    return;
  }
  quickComposerWindow = createQuickComposerAppWindow();
}

function forwardAgentStatusEventToQuickComposer(event: SupervisorEvent): void {
  if (!isAgentStatusSupervisorEvent(event)) return;
  // The overlay refetches agent statuses on focus, so a hidden window has no use
  // for the live stream — skip the cross-process send until it's actually shown.
  if (
    quickComposerWindow &&
    !quickComposerWindow.isDestroyed() &&
    quickComposerWindow.isVisible()
  ) {
    quickComposerWindow.webContents.send(IPC_EVENT_CHANNELS.supervisorEvent, event);
  }
}

function createMainAppWindow(showOnReady = true): BrowserWindow {
  const windowChrome = resolveWindowChromeOptions();
  const window = createMainWindow({
    ...commonAppWindowOptions(),
    windowChromeHeight: WINDOW_CHROME_HEIGHT,
    appearance: windowChrome.appearance,
    sidebarTranslucency: windowChrome.sidebarTranslucency,
    showOnReady,
    onClosed: () => {
      if (mainWindow === window) mainWindow = null;
      mainRendererReady = false;
    },
    onClose: handleMainWindowClose,
    onRendererProcessGone: (details) => {
      mainRendererReady = false;
      captureMainException(new Error(`Renderer process gone: ${details.reason}`), {
        "poracode.feature_area": "renderer",
        "poracode.process": "renderer",
      });
    },
  });
  window.webContents.on("did-start-loading", () => {
    if (mainWindow === window) mainRendererReady = false;
  });
  return window;
}

function focusBrowserExtractWindow(): void {
  if (!browserExtractWindow || browserExtractWindow.isDestroyed()) return;
  showAndFocusWindow(browserExtractWindow);
}

function revealBrowserInMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showAndFocusWindow(mainWindow);
  }
  browserPanelManager?.notifyState();
  browserPanelManager?.revealPanel();
}

function createBrowserExtractWindow(): BrowserWindow {
  const windowChrome = resolveWindowChromeOptions();
  const window = createMainWindow({
    title: `${getAppName(channel, isDev)} Browser`,
    windowKind: "browserExtract",
    boundsStateKey: "browser-extract-window-bounds",
    defaultWidth: 1120,
    defaultHeight: 760,
    minWidth: 520,
    minHeight: 420,
    isDev,
    channel,
    preloadPath: join(__dirname, "preload.cjs"),
    rendererHtmlPath: join(__dirname, "../renderer/index.html"),
    appVersion: app.getVersion(),
    posthogEnableDev,
    posthogEnabled,
    posthogHost,
    posthogKey,
    sentryEnabled,
    windowChromeHeight: WINDOW_CHROME_HEIGHT,
    browserUserAgent,
    appearance: windowChrome.appearance,
    sidebarTranslucency: windowChrome.sidebarTranslucency,
    openDevTools: false,
    ...(process.env.VITE_DEV_SERVER_URL ? { devServerUrl: process.env.VITE_DEV_SERVER_URL } : {}),
    onClosed: () => {
      browserExtractWindow = null;
      browserPanelManager?.notifyState();
      // Closing the window — whether via the OS controls or "bring back to
      // panel" (injectBrowserToMain) — returns the browser to the main window.
      if (!isQuitting) {
        revealBrowserInMainWindow();
      }
    },
    onRendererProcessGone: (details) => {
      captureMainException(new Error(`Browser renderer process gone: ${details.reason}`), {
        "poracode.feature_area": "browser",
        "poracode.process": "renderer",
      });
    },
  });
  return window;
}

function extractBrowserToWindow(): void {
  if (browserExtractWindow && !browserExtractWindow.isDestroyed()) {
    browserPanelManager?.notifyState();
    focusBrowserExtractWindow();
    return;
  }
  browserExtractWindow = createBrowserExtractWindow();
  // Bind the host (which emits state) only after `browserExtractWindow` is
  // assigned, so the snapshot's `extracted` flag reads true. Otherwise the main
  // window keeps showing its own browser until the next unrelated state emit.
  browserPanelManager?.bindHost(browserExtractWindow);
  focusBrowserExtractWindow();
}

function injectBrowserToMain(): void {
  const window = browserExtractWindow;
  if (!window || window.isDestroyed()) {
    browserExtractWindow = null;
    revealBrowserInMainWindow();
    return;
  }
  // The window's `onClosed` handler returns the browser to the main window.
  window.close();
}

const workingThreads = new Set<string>();
const sleepInhibitor = createSleepInhibitor();

function requirePoracodePaths(): PoracodePaths {
  if (!poracodePaths) {
    throw new Error("Poracode paths are not initialized.");
  }
  return poracodePaths;
}

function updatePowerSaveBlocker(): void {
  const enabled = poracodePaths
    ? readSharedSettingsFile(poracodePaths.settingsPath).preventSleepWhileWorking
    : true;
  sleepInhibitor.setActive(enabled && workingThreads.size > 0);
}

function handleSupervisorEventForSleep(event: SupervisorEvent): void {
  if (event.type === "thread-state") {
    const active = event.status === "working" || event.status === "launching";
    if (active) {
      workingThreads.add(event.threadId);
    } else {
      workingThreads.delete(event.threadId);
    }
    updatePowerSaveBlocker();
    return;
  }
  if (event.type === "thread-exited") {
    workingThreads.delete(event.threadId);
    updatePowerSaveBlocker();
  }
}

registerLocalFileProtocolScheme();
registerPickerProtocolScheme();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    if (!app.isReady()) return;
    if (
      poracodePaths &&
      shouldStartMinimized(
        readSharedSettingsFile(poracodePaths.settingsPath),
        commandLine,
        process.platform,
      )
    ) {
      return;
    }
    showAndFocusWindow(ensureMainWindow());
  });

  void app
    .whenReady()
    .then(async () => {
      if (preserveLegacySafeStorageIdentity) app.setName(productNameFor(channel));
      Menu.setApplicationMenu(null);

      installLocalFileProtocolHandler();
      installPickerProtocolHandler();
      // Keep the pre-rebrand partition so browser cookies and sign-ins survive.
      electronSession.fromPartition("persist:lightcode-browser").setUserAgent(browserUserAgent);

      const paths = requirePoracodePaths();
      const initialSettings = readSharedSettingsFile(paths.settingsPath);
      syncStartupSettings(initialSettings);
      const showMainWindowOnReady = !shouldStartMinimized(
        initialSettings,
        process.argv,
        process.platform,
      );
      let jobObjectReady: Promise<void> = Promise.resolve();
      if (process.platform === "win32") {
        const manager = new WindowsJobObjectManager();
        windowsJobObjectManager = manager;
        jobObjectReady = manager.start().catch((error) => {
          console.error(
            "[poracode] Windows Job Object helper unavailable:",
            error instanceof Error ? error.message : String(error),
          );
          captureMainException(error, { "poracode.feature_area": "process-lifecycle" });
          if (windowsJobObjectManager === manager) {
            windowsJobObjectManager = null;
          }
        });
      }

      initDatabase(paths.dbPath);
      const secretStorageKey = readOrCreateSafeStorageSecretKey(paths.baseDir);
      // Configure the same key in main so it can seal captured secrets (e.g. usage
      // login cookies); the supervisor configures it from the env var it receives.
      configureSecretStorageKey(secretStorageKey);

      const supervisorPath = join(__dirname, "supervisor.cjs");
      const wslHelpersDir = app.isPackaged
        ? join(process.resourcesPath, "wsl-helpers")
        : join(__dirname, "..", "..", "resources", "wsl-helpers");
      const bundledSkillsDir = app.isPackaged
        ? join(process.resourcesPath, "skills")
        : join(__dirname, "..", "..", "resources", "skills");
      const sshConnectionManager = new SshConnectionManager({
        mainBundleDir: __dirname,
        agentPluginsDir: app.isPackaged
          ? join(process.resourcesPath, "agent-plugins")
          : join(__dirname, "..", "..", "resources", "agent-plugins"),
        wslHelpersDir,
        bundledSkillsDir,
        cacheDir: join(paths.baseDir, "ssh-runtime-bundles"),
      });

      // Assigned after the browser services are composed and before the
      // supervisor starts emitting events.
      let remoteAccessController: DesktopRemoteAccessController | null = null;
      // Assigned right after the supervisor client below; the `onEvent` tap only
      // fires once the supervisor is started, by which point it is set.
      let scheduleRunCoordinator: ScheduleRunCoordinator | null = null;
      const supervisorClient = new SupervisorClient({
        appVersion: app.getVersion(),
        isDev,
        supervisorPath,
        wslHelpersDir,
        bundledSkillsDir,
        secretStorageKey,
        resolveExtraEnv: () => {
          const env: Record<string, string> = {};
          const browserInfo = browserMcpIngress?.getInfo();
          if (browserInfo) {
            env.PORACODE_BROWSER_MCP_URL = browserInfo.url;
            env.PORACODE_BROWSER_MCP_TOKEN = browserInfo.token;
          }
          const chromeInfo = chromeMcpIngress?.getInfo();
          if (chromeInfo) {
            env.PORACODE_CHROME_MCP_URL = chromeInfo.url;
            env.PORACODE_CHROME_MCP_TOKEN = chromeInfo.token;
          }
          const computerUseInfo = computerUseMcpIngress?.getInfo();
          if (computerUseInfo) {
            env.PORACODE_COMPUTER_USE_MCP_URL = computerUseInfo.url;
            env.PORACODE_COMPUTER_USE_MCP_TOKEN = computerUseInfo.token;
          }
          const appControlsInfo = appControlsMcpIngress?.getInfo();
          if (appControlsInfo) {
            env.PORACODE_APP_CONTROLS_MCP_URL = appControlsInfo.url;
            env.PORACODE_APP_CONTROLS_MCP_TOKEN = appControlsInfo.token;
          }
          return env;
        },
        assignPid: async (pid) => {
          await windowsJobObjectManager?.assignPid(pid);
        },
        reportError: (error, tags) => {
          captureMainException(error, tags);
        },
        onEvent: (event) => {
          // Orchestrator create_thread requests are consumed here (DB upsert,
          // renderer mirror, startThread call-back) and never fanned out.
          if (event.type === "orchestrator-thread-created") {
            void handleOrchestratorThreadCreated(event, {
              startThread: (payload) => supervisorClient.call("startThread", payload),
              sendThreadCommand: (command) => {
                if (!mainWindow) return false;
                mainWindow.webContents.send(IPC_EVENT_CHANNELS.remoteThreadCommand, command);
                return true;
              },
            });
            return;
          }
          handleSupervisorEventForSleep(event);
          scheduleRunCoordinator?.observeSupervisorEvent(event);
          remoteAccessController?.handleSupervisorEvent(event);
          mainWindow?.webContents.send(IPC_EVENT_CHANNELS.supervisorEvent, event);
          forwardAgentStatusEventToQuickComposer(event);
        },
        onReset: () => {
          workingThreads.clear();
          updatePowerSaveBlocker();
        },
      });
      const scheduleCoordinator = new ScheduleRunCoordinator({
        startThread: (payload) => supervisorClient.call("startThread", payload),
        getAgentStatuses: (wslDistros) => supervisorClient.call("getAgentStatuses", { wslDistros }),
        sendThreadCommand: (command) => {
          if (!mainWindow) return false;
          mainWindow.webContents.send(IPC_EVENT_CHANNELS.remoteThreadCommand, command);
          return true;
        },
        ensureHomeProject: ensureHomeProjectRow,
        getProject: dbGetProject,
        getSharedSettings: () => readSharedSettingsFile(requirePoracodePaths().settingsPath),
        upsertThread: dbUpsertThread,
        deleteThread: dbDeleteThread,
        threadExists: (threadId) => dbGetThread(threadId) != null,
        insertRun: dbInsertScheduleRun,
        updateRun: dbUpdateScheduleRun,
      });
      scheduleRunCoordinator = scheduleCoordinator;
      const scheduleService = createDeviceScheduleService({
        runTask: (task) => scheduleCoordinator.runScheduleAsThread(task),
        onStartupInterrupted: (scheduleId) =>
          dbInterruptScheduleRuns(scheduleId, new Date().toISOString()),
      });
      appControlsMcpIngress = new AppControlsMcpIngress(scheduleService, dbGetThread);

      const autoUpdaterController = createAutoUpdaterController(
        (status) => {
          mainWindow?.webContents.send(IPC_EVENT_CHANNELS.updateStatus, status);
        },
        channel,
        isDev,
        captureMainException,
        () => {
          isQuitting = true;
        },
      );

      browserPanelManager = new BrowserPanelManager(paths, browserUserAgent, {
        isExtracted: () => browserExtractWindow !== null && !browserExtractWindow.isDestroyed(),
        focusExtractedWindow: focusBrowserExtractWindow,
      });
      browserMcpIngress = new BrowserMcpIngress();
      browserMcpIngress.setManagerAccessor(() => browserPanelManager);
      // External-Chrome control: a localhost WS bridge the companion extension
      // connects to, plus a `chrome` MCP ingress agents reach the same way as the
      // embedded `browser` server. They live side by side.
      chromeBridgeServer = new ChromeBridgeServer({
        pairingFilePath: join(paths.baseDir, "chrome-bridge.json"),
      });
      chromeMcpIngress = new ChromeMcpIngress();
      chromeMcpIngress.setConnectionAccessor(() => chromeBridgeServer?.getConnection() ?? null);
      primeBrowserAllowFlags(initialSettings);
      const mcpInfoReady = browserMcpIngress.start().catch((err) => {
        console.error("[poracode] browser MCP ingress failed to start:", err);
        return null;
      });
      const chromeMcpReady = chromeMcpIngress.start().catch((err) => {
        console.error("[poracode] chrome MCP ingress failed to start:", err);
        return null;
      });
      const appControlsMcpReady = appControlsMcpIngress.start().catch((err) => {
        console.error("[poracode] app controls MCP ingress failed to start:", err);
        return null;
      });
      chromeBridgeServer.start().catch((err) => {
        console.error("[poracode] chrome bridge server failed to start:", err);
      });
      // Computer-use drives the host desktop and is only supported on macOS and
      // Windows (matches createComputerUseDriver). On other platforms the ingress
      // would advertise tools that all fail and would still inject a token into
      // launches, so skip it entirely — resolveExtraEnv then naturally yields
      // nothing because getInfo() stays null.
      let computerUseMcpInfoReady: Promise<ComputerUseMcpIngressInfo | null> =
        Promise.resolve(null);
      if (process.platform === "win32" || process.platform === "darwin") {
        computerUseDesktopOverlay = new ComputerUseDesktopOverlay({
          onExit: (threadIds) => {
            computerUseMcpIngress?.interruptActiveActions();
            for (const threadId of threadIds) {
              void supervisorClient.call("interruptThread", { threadId }).catch((error) => {
                console.error(
                  `[poracode] failed to interrupt computer-use thread ${threadId}:`,
                  error,
                );
              });
            }
          },
        });
        computerUseMcpIngress = new ComputerUseMcpIngress({
          onActivity: (event) => computerUseDesktopOverlay?.setActivity(event),
        });
        computerUseMcpInfoReady = computerUseMcpIngress.start().catch((err) => {
          console.error("[poracode] computer use MCP ingress failed to start:", err);
          return null;
        });
      }

      const controller = createDesktopRemoteAccessController({
        appVersion: app.getVersion(),
        paths,
        ...(process.env.VITE_DEV_SERVER_URL
          ? { devServerUrl: process.env.VITE_DEV_SERVER_URL }
          : {}),
        callSupervisor: (name, payload) => supervisorClient.call(name, payload),
        dispatchThreadCommand: (command) => {
          if (!mainWindow) return false;
          mainWindow.webContents.send(IPC_EVENT_CHANNELS.remoteThreadCommand, command);
          return true;
        },
        getBrowserPanelManager: () => browserPanelManager,
        notifySharedSettingsChanged: (settings) => {
          mainWindow?.webContents.send(IPC_EVENT_CHANNELS.sharedSettingsChanged, settings);
        },
        reportError: captureMainException,
        scheduleService,
      });
      remoteAccessController = controller;

      quickComposerShortcutManager = new QuickComposerShortcutManager(
        globalShortcut,
        process.platform,
        toggleQuickComposerWindow,
        (accelerator) => {
          tray?.setQuickComposerShortcut(accelerator);
          if (accelerator) {
            console.log(`[poracode] registered ${accelerator} for quick composer`);
          }
        },
      );
      try {
        quickComposerShortcutManager.apply(
          readKeybindingsFile(requirePoracodePaths().keybindingsPath).file,
        );
      } catch (error) {
        console.warn("[poracode] failed to register the quick composer shortcut", error);
      }

      registerIpcHandlers({
        localHandlers: createLocalIpcHandlers({
          getMainWindow: () => mainWindow,
          getBrowserPanelManager: () => browserPanelManager,
          getRemoteAccessServer: controller.getServer,
          setRemoteAccessEnabled: controller.setEnabled,
          getRemoteAccessTailscaleStatus: controller.getTailscaleStatus,
          setRemoteAccessTailscaleHttps: controller.setTailscaleHttps,
          startTailscale: controller.startTailscale,
          setRemoteAccessAdvertisedUrl: controller.setAdvertisedUrl,
          sshConnectionManager,
          requirePoracodePaths,
          legacyElectronUserDataDir,
          ...(legacyBaseDirOverride ? { legacyBaseDir: legacyBaseDirOverride } : {}),
          updatePowerSaveBlocker,
          autoUpdater: autoUpdaterController,
          onSharedSettingsChanged: handleSharedSettingsChanged,
          onKeybindingsChanged: (file) => quickComposerShortcutManager?.apply(file),
          setGlobalShortcutsSuspended: (suspended) => globalShortcut.setSuspended(suspended),
          onRemoteGitSummaries: controller.updateGitSummaries,
          extractBrowserToWindow,
          injectBrowserToMain,
          requestRelaunch: () => {
            isQuitting = true;
            app.relaunch();
            app.quit();
          },
          scheduleService,
        }),
        callSupervisor: (name, payload) => supervisorClient.call(name, payload),
      });

      ipcMain.handle(IPC_WINDOW_CHANNELS.quickComposerSubmit, (event, payload: unknown) => {
        const overlay = quickComposerWindowFor(event);
        if (!overlay) return;
        const submission = quickComposerSubmissionSchema.parse(payload);
        pendingQuickComposerSubmissions.push(submission);
        revealMainAfterQuickComposerDismiss = true;
        ensureMainWindow(false);
        flushQuickComposerSubmissions();
        if (quickComposerDismissTimer) clearTimeout(quickComposerDismissTimer);
        quickComposerDismissTimer = setTimeout(() => finishQuickComposerDismiss(overlay), 800);
      });
      ipcMain.handle(IPC_WINDOW_CHANNELS.quickComposerDismiss, (event) => {
        const overlay = quickComposerWindowFor(event);
        if (overlay) finishQuickComposerDismiss(overlay);
      });
      ipcMain.handle(IPC_WINDOW_CHANNELS.quickComposerPickFiles, async (event) => {
        const overlay = quickComposerWindowFor(event);
        if (!overlay) return null;
        quickComposerDialogOpen = true;
        const wasVisible = overlay.isVisible();
        try {
          return await showAddFilesDialog(overlay);
        } finally {
          quickComposerDialogOpen = false;
          if (wasVisible && !overlay.isDestroyed()) showQuickComposerWindow(overlay);
        }
      });
      ipcMain.handle(IPC_WINDOW_CHANNELS.quickComposerMainReady, (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window || window !== mainWindow || window.isDestroyed()) return;
        mainRendererReady = true;
        flushQuickComposerSubmissions();
      });

      const initialMainWindow = ensureMainWindow(showMainWindowOnReady);

      tray = createTray({
        channel,
        appName: getAppName(channel, isDev),
        onShow: () => showAndFocusWindow(ensureMainWindow()),
        onQuickComposer: toggleQuickComposerWindow,
        onQuit: () => {
          isQuitting = true;
          app.quit();
        },
      });
      tray.setQuickComposerShortcut(quickComposerShortcutManager.active[0] ?? null);

      await jobObjectReady;

      const hookDebugOn =
        Boolean(process.env.PORACODE_HOOK_DEBUG) && process.env.PORACODE_HOOK_DEBUG !== "0";
      if (hookDebugOn) {
        console.log(
          "[poracode] PORACODE_HOOK_DEBUG is on — watch for [supervisor] hook-debug lines (HookIngress, WSL bridge, L1/L2 spawn, envelopes).",
        );
      }

      await Promise.all([
        mcpInfoReady,
        chromeMcpReady,
        computerUseMcpInfoReady,
        appControlsMcpReady,
      ]);
      supervisorClient.start(paths.baseDir);
      scheduleService.start();

      void controller.startIfEnabled();

      initialMainWindow.once("ready-to-show", () => {
        setTimeout(() => {
          const attachmentPaths = requirePoracodePaths();
          cleanupOrphanedAttachments(
            attachmentPaths.attachmentsDir,
            dbGetThreads().map((thread) => thread.id),
          );
        }, 0);
      });

      if (!isDev) {
        autoUpdaterController.initialize();
      }

      if (isDev) {
        let debounce: ReturnType<typeof setTimeout> | null = null;
        watch(supervisorPath, () => {
          if (debounce) {
            clearTimeout(debounce);
          }
          debounce = setTimeout(() => {
            console.log("[poracode] supervisor changed, restarting…");
            supervisorClient.start(requirePoracodePaths().baseDir);
          }, 200);
        });
      }

      app.on("activate", () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          showAndFocusWindow(mainWindow);
          return;
        }
        ensureMainWindow();
      });

      app.on("before-quit", () => {
        isQuitting = true;
        quickComposerShortcutManager?.dispose();
        quickComposerShortcutManager = null;
        if (quickComposerDismissTimer) clearTimeout(quickComposerDismissTimer);
        quickComposerDismissTimer = null;
        pendingQuickComposerSubmissions.length = 0;
        scheduleService.dispose();
        supervisorClient.dispose();
        windowsJobObjectManager?.dispose();
        windowsJobObjectManager = null;
        browserMcpIngress?.dispose();
        browserMcpIngress = null;
        computerUseMcpIngress?.dispose();
        computerUseMcpIngress = null;
        appControlsMcpIngress?.dispose();
        appControlsMcpIngress = null;
        computerUseDesktopOverlay?.dispose();
        computerUseDesktopOverlay = null;
        chromeMcpIngress?.dispose();
        chromeMcpIngress = null;
        chromeBridgeServer?.dispose();
        chromeBridgeServer = null;
        void controller.dispose();
        void sshConnectionManager.dispose();
        browserExtractWindow?.close();
        browserExtractWindow = null;
        quickComposerWindow?.close();
        quickComposerWindow = null;
        browserPanelManager?.dispose();
        browserPanelManager = null;
        sleepInhibitor.dispose();
        tray?.destroy();
        tray = null;
      });
    })
    .catch((error: unknown) => {
      console.error("[poracode] failed to initialize:", error);
      captureMainException(error, { "poracode.feature_area": "main-initialization" });
      app.quit();
    });
}

app.on("will-quit", () => {
  closeDatabase();
});

app.on("window-all-closed", () => {
  if (process.platform === "darwin" || tray?.available) return;
  app.quit();
});
