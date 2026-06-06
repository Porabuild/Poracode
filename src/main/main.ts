import { watch } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeTheme } from "electron";
import { resolveThemeMode } from "@/shared/themeMode";
import { closeDatabase, dbGetThreads, initDatabase } from "./db";
import { cleanupOrphanedAttachments, prepareLightcodeDataRoot } from "./lightcodeData";
import { createLocalIpcHandlers } from "./ipc/localHandlers";
import { registerIpcHandlers } from "./ipc/registerHandlers";
import { createSleepInhibitor } from "./sleepInhibitor";
import {
  installLocalFileProtocolHandler,
  registerLocalFileProtocolScheme,
} from "./attachments/localFiles";
import {
  BrowserMcpIngress,
  BrowserPanelManager,
  installPickerProtocolHandler,
  registerPickerProtocolScheme,
} from "./browser";
import { SupervisorClient } from "./supervisor/SupervisorClient";
import { createAutoUpdaterController } from "./updates/autoUpdater";
import { createMainWindow } from "./window/createMainWindow";
import {
  createQuickComposerWindow,
  setQuickComposerWindowExpanded,
} from "./window/createQuickComposerWindow";
import { showAndFocusWindow } from "./window/showAndFocusWindow";
import { createTray, type TrayHandle } from "./tray";
import type { SupervisorEvent } from "@/shared/ipc";
import { type LightcodePaths, resolveLightcodeBaseDir } from "@/shared/lightcodePaths";
import { getAppName } from "@/shared/appName";
import { resolveLightcodeChannel } from "@/shared/channel";
import { IPC_EVENT_CHANNELS, IPC_WINDOW_CHANNELS } from "@/shared/ipc";
import { readSharedSettingsFile } from "./sharedSettingsFile";
import { WindowsJobObjectManager } from "./windowsJobObject";
import { captureMainException, initializeMainSentry } from "./diagnostics/sentry";
import { configureSecretStorageKey } from "@/shared/secretStorage";
import { readOrCreateSafeStorageSecretKey } from "./secretStorageKey";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const channel = resolveLightcodeChannel();
const baseDirOverride = process.env.LIGHTCODE_BASE_DIR;

if (process.env.LIGHTCODE_CDP_PORT) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.LIGHTCODE_CDP_PORT);
}

if (baseDirOverride) {
  app.setPath("userData", join(baseDirOverride, "userData"));
} else if (isDev) {
  app.setPath("userData", join(app.getPath("userData"), "Dev"));
}

const sentryEnabled = initializeMainSentry({ appVersion: app.getVersion(), isDev, channel });

// Fallback global handlers so a stray throw in any main-process callback
// (IPC handler, Electron event listener, timer) is reported rather than
// silently taking the whole app — and the supervisor and all windows — down.
// Sentry's Electron integration also hooks these, but only when a DSN is
// configured and initialization succeeded; this guarantees coverage otherwise.
process.on("uncaughtException", (error) => {
  console.error("[lightcode] uncaught exception:", error);
  captureMainException(error, { "lightcode.feature_area": "main" });
});
process.on("unhandledRejection", (reason) => {
  console.error("[lightcode] unhandled rejection:", reason);
  captureMainException(reason, { "lightcode.feature_area": "main" });
});
const posthogEnabled = process.env.POSTHOG_ENABLED !== "0";
const posthogKey = posthogEnabled ? (process.env.POSTHOG_KEY ?? "").trim() : "";
const posthogHost = (process.env.POSTHOG_HOST ?? "").trim();
const posthogEnableDev = process.env.POSTHOG_ENABLE_DEV === "1";

const hasSingleInstanceLock = isDev || app.requestSingleInstanceLock();
const WINDOW_CHROME_HEIGHT = 32;
const QUICK_COMPOSER_SHORTCUT = "CommandOrControl+L";

let mainWindow: BrowserWindow | null = null;
const quickComposerWindows = new Set<BrowserWindow>();
let lightcodePaths: LightcodePaths | null = null;
let windowsJobObjectManager: WindowsJobObjectManager | null = null;
let browserPanelManager: BrowserPanelManager | null = null;
let browserMcpIngress: BrowserMcpIngress | null = null;
// Retained module-scope so the native Tray icon stays reachable from GC.
let tray: TrayHandle | null = null;
let isQuitting = false;

function isCloseToTrayEnabled(): boolean {
  if (!lightcodePaths) return false;
  try {
    return readSharedSettingsFile(lightcodePaths.settingsPath).closeToTray;
  } catch {
    return false;
  }
}

/**
 * Resolves the saved appearance so the native window opens with a matching
 * background instead of flashing a fixed color before the renderer paints.
 */
function resolveAppAppearance(): "light" | "dark" {
  let mode: "system" | "light" | "dark" = "dark";
  if (lightcodePaths) {
    try {
      mode = readSharedSettingsFile(lightcodePaths.settingsPath).themeMode;
    } catch {
      // Fall back to dark.
    }
  }
  return resolveThemeMode(mode, nativeTheme.shouldUseDarkColors);
}

function primeBrowserAllowFlags(): void {
  if (!browserMcpIngress || !lightcodePaths) return;
  try {
    const s = readSharedSettingsFile(lightcodePaths.settingsPath);
    browserMcpIngress.setAllowEval(s.browser?.allowEval === true);
    browserMcpIngress.setAllowDataAccess(s.browser?.allowDataAccess === true);
  } catch {
    browserMcpIngress.setAllowEval(false);
    browserMcpIngress.setAllowDataAccess(false);
  }
}

function handleMainWindowClose(event: Electron.Event): void {
  if (isQuitting) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!isCloseToTrayEnabled()) return;
  event.preventDefault();
  mainWindow.hide();
}

function focusMainWindow(): void {
  if (mainWindow) showAndFocusWindow(mainWindow);
}

function quickComposerWindowFor(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window && quickComposerWindows.has(window) && !window.isDestroyed() ? window : null;
}

function sendSupervisorEventToRenderers(event: SupervisorEvent): void {
  mainWindow?.webContents.send(IPC_EVENT_CHANNELS.supervisorEvent, event);
  for (const window of quickComposerWindows) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_EVENT_CHANNELS.supervisorEvent, event);
    }
  }
}

function openQuickComposerWindow(): void {
  const window = createQuickComposerWindow({
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
    ...(process.env.VITE_DEV_SERVER_URL ? { devServerUrl: process.env.VITE_DEV_SERVER_URL } : {}),
    onClosed: () => {
      quickComposerWindows.delete(window);
    },
    onRendererProcessGone: (details) => {
      captureMainException(new Error(`Quick composer renderer process gone: ${details.reason}`), {
        "lightcode.feature_area": "quick-composer",
        "lightcode.process": "renderer",
      });
    },
  });
  quickComposerWindows.add(window);
}

const workingThreads = new Set<string>();
const sleepInhibitor = createSleepInhibitor();

function requireLightcodePaths(): LightcodePaths {
  if (!lightcodePaths) {
    throw new Error("Lightcode paths are not initialized.");
  }
  return lightcodePaths;
}

function updatePowerSaveBlocker(): void {
  const enabled = lightcodePaths
    ? readSharedSettingsFile(lightcodePaths.settingsPath).preventSleepWhileWorking
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
  app.on("second-instance", () => {
    focusMainWindow();
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);

    installLocalFileProtocolHandler();
    installPickerProtocolHandler();

    lightcodePaths = prepareLightcodeDataRoot(
      baseDirOverride ??
        (isDev ? join(homedir(), ".lightcode-dev") : resolveLightcodeBaseDir(channel)),
    );
    let jobObjectReady: Promise<void> = Promise.resolve();
    if (process.platform === "win32") {
      const manager = new WindowsJobObjectManager();
      windowsJobObjectManager = manager;
      jobObjectReady = manager.start().catch((error) => {
        console.error(
          "[lightcode] Windows Job Object helper unavailable:",
          error instanceof Error ? error.message : String(error),
        );
        captureMainException(error, { "lightcode.feature_area": "process-lifecycle" });
        if (windowsJobObjectManager === manager) {
          windowsJobObjectManager = null;
        }
      });
    }

    initDatabase(lightcodePaths.dbPath);
    const secretStorageKey = readOrCreateSafeStorageSecretKey(lightcodePaths.baseDir);
    // Configure the same key in main so it can seal captured secrets (e.g. usage
    // login cookies); the supervisor configures it from the env var it receives.
    configureSecretStorageKey(secretStorageKey);

    const supervisorPath = join(__dirname, "supervisor.cjs");
    const wslHelpersDir = app.isPackaged
      ? join(process.resourcesPath, "wsl-helpers")
      : join(__dirname, "..", "..", "resources", "wsl-helpers");

    const supervisorClient = new SupervisorClient({
      appVersion: app.getVersion(),
      isDev,
      supervisorPath,
      wslHelpersDir,
      secretStorageKey,
      resolveExtraEnv: () => {
        const info = browserMcpIngress?.getInfo();
        if (!info) return {};
        return {
          LIGHTCODE_BROWSER_MCP_URL: info.url,
          LIGHTCODE_BROWSER_MCP_TOKEN: info.token,
        };
      },
      assignPid: async (pid) => {
        await windowsJobObjectManager?.assignPid(pid);
      },
      reportError: (error, tags) => {
        captureMainException(error, tags);
      },
      onEvent: (event) => {
        handleSupervisorEventForSleep(event);
        sendSupervisorEventToRenderers(event);
      },
      onReset: () => {
        workingThreads.clear();
        updatePowerSaveBlocker();
      },
    });

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

    browserPanelManager = new BrowserPanelManager(lightcodePaths);
    browserMcpIngress = new BrowserMcpIngress();
    browserMcpIngress.setManagerAccessor(() => browserPanelManager);
    primeBrowserAllowFlags();
    const mcpInfoReady = browserMcpIngress.start().catch((err) => {
      console.error("[lightcode] browser MCP ingress failed to start:", err);
      return null;
    });

    registerIpcHandlers({
      localHandlers: createLocalIpcHandlers({
        getMainWindow: () => mainWindow,
        getBrowserPanelManager: () => browserPanelManager,
        requireLightcodePaths,
        updatePowerSaveBlocker,
        autoUpdater: autoUpdaterController,
        onSharedSettingsChanged: primeBrowserAllowFlags,
      }),
      callSupervisor: (name, payload) => supervisorClient.call(name, payload),
    });

    ipcMain.handle(IPC_WINDOW_CHANNELS.quickOverlaySetExpanded, (event, expanded: unknown) => {
      const window = quickComposerWindowFor(event);
      if (!window) return;
      setQuickComposerWindowExpanded(window, expanded === true);
    });
    ipcMain.handle(IPC_WINDOW_CHANNELS.quickOverlayClose, (event) => {
      const window = quickComposerWindowFor(event);
      if (!window) return;
      window.close();
    });
    ipcMain.handle(IPC_WINDOW_CHANNELS.quickOverlayThreadChanged, (_event, threadId: unknown) => {
      if (typeof threadId !== "string" || threadId.length === 0) return;
      mainWindow?.webContents.send(IPC_EVENT_CHANNELS.externalAppStoreChanged, { threadId });
    });
    ipcMain.handle(
      IPC_WINDOW_CHANNELS.quickOverlayOpenThreadInMainWindow,
      (event, threadId: unknown) => {
        if (typeof threadId !== "string" || threadId.length === 0) return;
        focusMainWindow();
        mainWindow?.webContents.send(IPC_EVENT_CHANNELS.openThreadInMainWindow, { threadId });
        const window = quickComposerWindowFor(event);
        if (!window) return;
        setQuickComposerWindowExpanded(window, false);
        setTimeout(() => {
          if (!window.isDestroyed()) window.close();
        }, 160);
      },
    );

    mainWindow = createMainWindow({
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
      windowChromeHeight: WINDOW_CHROME_HEIGHT,
      appearance: resolveAppAppearance(),
      ...(process.env.VITE_DEV_SERVER_URL ? { devServerUrl: process.env.VITE_DEV_SERVER_URL } : {}),
      onClosed: () => {
        mainWindow = null;
      },
      onClose: handleMainWindowClose,
      onRendererProcessGone: (details) => {
        captureMainException(new Error(`Renderer process gone: ${details.reason}`), {
          "lightcode.feature_area": "renderer",
          "lightcode.process": "renderer",
        });
      },
    });

    browserPanelManager.bindHost(mainWindow);

    tray = createTray({
      window: mainWindow,
      channel,
      appName: getAppName(channel, isDev),
      onQuit: () => {
        isQuitting = true;
        app.quit();
      },
    });

    if (!globalShortcut.register(QUICK_COMPOSER_SHORTCUT, openQuickComposerWindow)) {
      console.warn(`[lightcode] failed to register ${QUICK_COMPOSER_SHORTCUT} for quick composer`);
    }

    await jobObjectReady;

    const hookDebugOn =
      Boolean(process.env.LIGHTCODE_HOOK_DEBUG) && process.env.LIGHTCODE_HOOK_DEBUG !== "0";
    if (hookDebugOn) {
      console.log(
        "[lightcode] LIGHTCODE_HOOK_DEBUG is on — watch for [supervisor] hook-debug lines (HookIngress, WSL bridge, L1/L2 spawn, envelopes).",
      );
    }

    await mcpInfoReady;
    supervisorClient.start(lightcodePaths.baseDir);

    mainWindow.once("ready-to-show", () => {
      setTimeout(() => {
        const paths = requireLightcodePaths();
        cleanupOrphanedAttachments(
          paths.attachmentsDir,
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
          console.log("[lightcode] supervisor changed, restarting…");
          supervisorClient.start(requireLightcodePaths().baseDir);
        }, 200);
      });
    }

    app.on("activate", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (!mainWindow.isVisible()) {
          mainWindow.show();
        }
        mainWindow.focus();
        return;
      }
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow({
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
          windowChromeHeight: WINDOW_CHROME_HEIGHT,
          appearance: resolveAppAppearance(),
          ...(process.env.VITE_DEV_SERVER_URL
            ? { devServerUrl: process.env.VITE_DEV_SERVER_URL }
            : {}),
          onClosed: () => {
            mainWindow = null;
          },
          onClose: handleMainWindowClose,
          onRendererProcessGone: (details) => {
            captureMainException(new Error(`Renderer process gone: ${details.reason}`), {
              "lightcode.feature_area": "renderer",
              "lightcode.process": "renderer",
            });
          },
        });
      }
    });

    app.on("before-quit", () => {
      isQuitting = true;
      globalShortcut.unregister(QUICK_COMPOSER_SHORTCUT);
      supervisorClient.dispose();
      windowsJobObjectManager?.dispose();
      windowsJobObjectManager = null;
      browserMcpIngress?.dispose();
      browserMcpIngress = null;
      browserPanelManager?.dispose();
      browserPanelManager = null;
      sleepInhibitor.dispose();
      tray?.destroy();
      tray = null;
      for (const window of quickComposerWindows) {
        if (!window.isDestroyed()) {
          window.close();
        }
      }
      quickComposerWindows.clear();
    });
  });
}

app.on("will-quit", () => {
  closeDatabase();
});

app.on("window-all-closed", () => {
  // macOS keeps the app running; on Windows/Linux, exit only when close-to-tray
  // is disabled. When close-to-tray is enabled, the window is hidden (not
  // destroyed) on close, so this handler typically won't fire — but if all
  // windows are destroyed for another reason, fall through to quit.
  if (process.platform === "darwin") return;
  app.quit();
});
