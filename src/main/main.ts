import { watch } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, Menu, nativeTheme, session as electronSession } from "electron";
import { resolveThemeMode } from "@/shared/themeMode";
import { closeDatabase, dbGetThreads, initDatabase } from "./db";
import { cleanupOrphanedAttachments, prepareLightcodeDataRoot } from "./lightcodeData";
import { handleOrchestratorThreadCreated } from "./orchestratorThreadBridge";
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
import { showAndFocusWindow } from "./window/showAndFocusWindow";
import { createTray, type TrayHandle } from "./tray";
import type { SupervisorEvent } from "@/shared/ipc";
import { type LightcodePaths, resolveLightcodeBaseDir } from "@/shared/lightcodePaths";
import { getAppName } from "@/shared/appName";
import { resolveLightcodeChannel } from "@/shared/channel";
import { IPC_EVENT_CHANNELS } from "@/shared/ipc";
import { readSharedSettingsFile } from "./sharedSettingsFile";
import { WindowsJobObjectManager } from "./windowsJobObject";
import { captureMainException, initializeMainSentry } from "./diagnostics/sentry";
import { configureSecretStorageKey } from "@/shared/secretStorage";
import { readOrCreateSafeStorageSecretKey } from "./secretStorageKey";
import { createDesktopRemoteAccessController, type DesktopRemoteAccessController } from "./remote";
import { SshConnectionManager } from "./ssh/SshConnectionManager";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const channel = resolveLightcodeChannel();
const baseDirOverride = process.env.LIGHTCODE_BASE_DIR;

if (process.env.LIGHTCODE_CDP_PORT) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.LIGHTCODE_CDP_PORT);
}

// Windows HDR can make DWM acrylic visibly change opacity when Chromium starts
// compositing image content in the display color space. Keep Chromium in sRGB so
// acrylic stays translucent without breathing as image planes appear/disappear.
if (process.platform === "win32") {
  app.commandLine.appendSwitch("force-color-profile", "srgb");
}

const browserUserAgent = buildBrowserUserAgent(app.userAgentFallback);
app.userAgentFallback = browserUserAgent;

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

let mainWindow: BrowserWindow | null = null;
let lightcodePaths: LightcodePaths | null = null;
let windowsJobObjectManager: WindowsJobObjectManager | null = null;
let browserPanelManager: BrowserPanelManager | null = null;
let browserMcpIngress: BrowserMcpIngress | null = null;
let computerUseMcpIngress: ComputerUseMcpIngress | null = null;
let computerUseDesktopOverlay: ComputerUseDesktopOverlay | null = null;
let chromeBridgeServer: ChromeBridgeServer | null = null;
let chromeMcpIngress: ChromeMcpIngress | null = null;
let browserExtractWindow: BrowserWindow | null = null;
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
  if (lightcodePaths) {
    try {
      const settings = readSharedSettingsFile(lightcodePaths.settingsPath);
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

function primeBrowserAllowFlags(): void {
  if (!lightcodePaths) return;
  let allowEval = false;
  let allowDataAccess = false;
  try {
    const s = readSharedSettingsFile(lightcodePaths.settingsPath);
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

function handleMainWindowClose(event: Electron.Event): void {
  if (isQuitting) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!isCloseToTrayEnabled()) return;
  event.preventDefault();
  mainWindow.hide();
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
        "lightcode.feature_area": "browser",
        "lightcode.process": "renderer",
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

function requireLightcodePaths(): LightcodePaths {
  if (!lightcodePaths) {
    throw new Error("Poracode paths are not initialized.");
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
    if (!mainWindow) {
      return;
    }
    showAndFocusWindow(mainWindow);
  });

  void app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(null);

      installLocalFileProtocolHandler();
      installPickerProtocolHandler();
      electronSession.fromPartition("persist:lightcode-browser").setUserAgent(browserUserAgent);

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
      const sshConnectionManager = new SshConnectionManager({
        mainBundleDir: __dirname,
        agentPluginsDir: app.isPackaged
          ? join(process.resourcesPath, "agent-plugins")
          : join(__dirname, "..", "..", "resources", "agent-plugins"),
        wslHelpersDir,
        cacheDir: join(lightcodePaths.baseDir, "ssh-runtime-bundles"),
      });

      // Assigned after the browser services are composed and before the
      // supervisor starts emitting events.
      let remoteAccessController: DesktopRemoteAccessController | null = null;
      const supervisorClient = new SupervisorClient({
        appVersion: app.getVersion(),
        isDev,
        supervisorPath,
        wslHelpersDir,
        secretStorageKey,
        resolveExtraEnv: () => {
          const env: Record<string, string> = {};
          const browserInfo = browserMcpIngress?.getInfo();
          if (browserInfo) {
            env.LIGHTCODE_BROWSER_MCP_URL = browserInfo.url;
            env.LIGHTCODE_BROWSER_MCP_TOKEN = browserInfo.token;
          }
          const chromeInfo = chromeMcpIngress?.getInfo();
          if (chromeInfo) {
            env.LIGHTCODE_CHROME_MCP_URL = chromeInfo.url;
            env.LIGHTCODE_CHROME_MCP_TOKEN = chromeInfo.token;
          }
          const computerUseInfo = computerUseMcpIngress?.getInfo();
          if (computerUseInfo) {
            env.LIGHTCODE_COMPUTER_USE_MCP_URL = computerUseInfo.url;
            env.LIGHTCODE_COMPUTER_USE_MCP_TOKEN = computerUseInfo.token;
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
          remoteAccessController?.handleSupervisorEvent(event);
          mainWindow?.webContents.send(IPC_EVENT_CHANNELS.supervisorEvent, event);
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

      browserPanelManager = new BrowserPanelManager(lightcodePaths, browserUserAgent, {
        isExtracted: () => browserExtractWindow !== null && !browserExtractWindow.isDestroyed(),
        focusExtractedWindow: focusBrowserExtractWindow,
      });
      browserMcpIngress = new BrowserMcpIngress();
      browserMcpIngress.setManagerAccessor(() => browserPanelManager);
      // External-Chrome control: a localhost WS bridge the companion extension
      // connects to, plus a `chrome` MCP ingress agents reach the same way as the
      // embedded `browser` server. They live side by side.
      chromeBridgeServer = new ChromeBridgeServer({
        pairingFilePath: join(lightcodePaths.baseDir, "chrome-bridge.json"),
      });
      chromeMcpIngress = new ChromeMcpIngress();
      chromeMcpIngress.setConnectionAccessor(() => chromeBridgeServer?.getConnection() ?? null);
      primeBrowserAllowFlags();
      const mcpInfoReady = browserMcpIngress.start().catch((err) => {
        console.error("[lightcode] browser MCP ingress failed to start:", err);
        return null;
      });
      const chromeMcpReady = chromeMcpIngress.start().catch((err) => {
        console.error("[lightcode] chrome MCP ingress failed to start:", err);
        return null;
      });
      chromeBridgeServer.start().catch((err) => {
        console.error("[lightcode] chrome bridge server failed to start:", err);
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
                  `[lightcode] failed to interrupt computer-use thread ${threadId}:`,
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
          console.error("[lightcode] computer use MCP ingress failed to start:", err);
          return null;
        });
      }

      const controller = createDesktopRemoteAccessController({
        appVersion: app.getVersion(),
        paths: lightcodePaths,
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
      });
      remoteAccessController = controller;

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
          requireLightcodePaths,
          updatePowerSaveBlocker,
          autoUpdater: autoUpdaterController,
          onSharedSettingsChanged: primeBrowserAllowFlags,
          onRemoteGitSummaries: controller.updateGitSummaries,
          extractBrowserToWindow,
          injectBrowserToMain,
          requestRelaunch: () => {
            isQuitting = true;
            app.relaunch();
            app.quit();
          },
        }),
        callSupervisor: (name, payload) => supervisorClient.call(name, payload),
      });

      const windowChrome = resolveWindowChromeOptions();
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
        browserUserAgent,
        appearance: windowChrome.appearance,
        sidebarTranslucency: windowChrome.sidebarTranslucency,
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

      await jobObjectReady;

      const hookDebugOn =
        Boolean(process.env.LIGHTCODE_HOOK_DEBUG) && process.env.LIGHTCODE_HOOK_DEBUG !== "0";
      if (hookDebugOn) {
        console.log(
          "[lightcode] LIGHTCODE_HOOK_DEBUG is on — watch for [supervisor] hook-debug lines (HookIngress, WSL bridge, L1/L2 spawn, envelopes).",
        );
      }

      await Promise.all([mcpInfoReady, chromeMcpReady, computerUseMcpInfoReady]);
      supervisorClient.start(lightcodePaths.baseDir);

      void controller.startIfEnabled();

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
          const reopenChrome = resolveWindowChromeOptions();
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
            browserUserAgent,
            appearance: reopenChrome.appearance,
            sidebarTranslucency: reopenChrome.sidebarTranslucency,
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
        supervisorClient.dispose();
        windowsJobObjectManager?.dispose();
        windowsJobObjectManager = null;
        browserMcpIngress?.dispose();
        browserMcpIngress = null;
        computerUseMcpIngress?.dispose();
        computerUseMcpIngress = null;
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
        browserPanelManager?.dispose();
        browserPanelManager = null;
        sleepInhibitor.dispose();
        tray?.destroy();
        tray = null;
      });
    })
    .catch((error: unknown) => {
      console.error("[lightcode] failed to initialize:", error);
      captureMainException(error, { "lightcode.feature_area": "main-initialization" });
      app.quit();
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
