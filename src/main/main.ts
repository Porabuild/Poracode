import { watch } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, Menu, nativeTheme, session as electronSession } from "electron";
import { resolveThemeMode } from "@/shared/themeMode";
import { closeDatabase, dbGetProjects, dbGetThreads, initDatabase } from "./db";
import { cleanupOrphanedAttachments, prepareLightcodeDataRoot } from "./lightcodeData";
import { handleOrchestratorThreadCreated } from "./orchestratorThreadBridge";
import { createLocalIpcHandlers, getRemoteAccessPairingInfo } from "./ipc/localHandlers";
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
import type {
  RemoteAccessTailscaleStatus,
  StartTailscaleResult,
  SupervisorEvent,
} from "@/shared/ipc";
import { type LightcodePaths, resolveLightcodeBaseDir } from "@/shared/lightcodePaths";
import { getAppName } from "@/shared/appName";
import { resolveLightcodeChannel } from "@/shared/channel";
import { IPC_EVENT_CHANNELS } from "@/shared/ipc";
import { patchSharedSettingsFile, readSharedSettingsFile } from "./sharedSettingsFile";
import type { SharedSettings } from "@/shared/settings";
import { WindowsJobObjectManager } from "./windowsJobObject";
import { captureMainException, initializeMainSentry } from "./diagnostics/sentry";
import { configureSecretStorageKey } from "@/shared/secretStorage";
import { readOrCreateSafeStorageSecretKey } from "./secretStorageKey";
import {
  createPersistentRemoteAuthStore,
  createPortForwarding,
  createPushGateway,
  type PortForwarding,
  PushCoordinator,
  PushRegistrationStore,
  readOrCreateRemoteAccessIdentity,
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  RemoteBrowserGateway,
} from "./remote";
import {
  pickRemoteSettings,
  type RemoteAccessPairingInfo,
  type RemoteGitSummaries,
} from "@/shared/remote";
import {
  remoteAccessAdvertisedHost,
  remoteAccessHost,
  remoteAccessPairingAppUrl,
  remoteAccessPort,
} from "./remote/config";
import {
  buildTailscaleHttpsUrl,
  disableTailscaleServe,
  enableTailscaleServe,
  launchTailscaleApp,
  probeTailscaleStatus,
  type TailscaleStatus,
} from "./remote/tailscale";

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
let remoteAccessServer: RemoteAccessServer | null = null;
let remoteAccessStartPromise: Promise<RemoteAccessServerInfo> | null = null;
let pushCoordinator: PushCoordinator | null = null;
/** The paired raw-TCP gateway + authenticated HTTP/WS proxy backing port
 * forwarding (see `createPortForwarding`). Built against a restart attempt's
 * bind host/port and reused/cleared as one unit — both hold in-memory state
 * that would otherwise leak across a rebuild. */
let portForwarding: PortForwarding | null = null;
/**
 * Tailscale HTTPS serve state for the remote-access server. `serveActiveUrl` is
 * the advertised `https://…ts.net/` URL when our `tailscale serve` mapping is
 * live; `lastError` records a probe/serve failure so the UI can surface it. Both
 * are best-effort UI signals — serve failures degrade to the next advertised-URL
 * precedence tier and never block the server from starting.
 */
let remoteTailscaleServeActiveUrl: string | null = null;
let remoteTailscaleLastError: string | null = null;
/** Per-thread git/PR summaries mirrored from the renderer for remote clients. */
let remoteGitSummaries: RemoteGitSummaries = {};
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

  app.whenReady().then(async () => {
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
        remoteAccessServer?.publishSupervisorEvent(event);
        pushCoordinator?.handleSupervisorEvent(event);
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
    let computerUseMcpInfoReady: Promise<ComputerUseMcpIngressInfo | null> = Promise.resolve(null);
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

    const writeSharedSettingsPatch = (patch: {
      [K in keyof SharedSettings]?: SharedSettings[K];
    }) => {
      const next = patchSharedSettingsFile(requireLightcodePaths().settingsPath, patch);
      mainWindow?.webContents.send(IPC_EVENT_CHANNELS.sharedSettingsChanged, next);
      return next;
    };

    const writeRemoteAccessEnabledSetting = (enabled: boolean) =>
      writeSharedSettingsPatch({ remoteAccessEnabled: enabled });

    /**
     * Normalizes a custom public-URL setting to a bare origin with trailing
     * slash, or `undefined` when unset/invalid. The setter validates and rejects
     * bad input up front; this is the defensive read-time normalization.
     */
    const normalizeAdvertisedUrlSetting = (raw: string): string | undefined => {
      const trimmed = raw.trim();
      if (!trimmed) return undefined;
      try {
        const url = new URL(trimmed);
        if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
        return `${url.origin}/`;
      } catch {
        return undefined;
      }
    };

    /**
     * Probes Tailscale and, if the daemon is running with a MagicDNS name,
     * configures `tailscale serve` to reverse-proxy HTTPS to the local port.
     * Returns the advertised `https://…ts.net/` URL on success, or `undefined`
     * (recording `remoteTailscaleLastError`) so the caller degrades to the next
     * advertised-URL precedence tier. Never throws.
     */
    const setUpTailscaleServe = async (port: number): Promise<string | undefined> => {
      const status = await probeTailscaleStatus();
      if (status.state !== "running") {
        remoteTailscaleLastError = status.state === "error" ? status.message : null;
        return undefined;
      }
      if (!status.dnsName) {
        remoteTailscaleLastError = "Tailscale MagicDNS name is unavailable.";
        return undefined;
      }
      const result = await enableTailscaleServe(port);
      if (!result.ok) {
        remoteTailscaleLastError = result.message;
        return undefined;
      }
      remoteTailscaleLastError = null;
      const httpsUrl = buildTailscaleHttpsUrl(status.dnsName);
      remoteTailscaleServeActiveUrl = httpsUrl;
      return httpsUrl;
    };

    /**
     * Advertised-URL precedence for the remote-access server:
     *   env `LIGHTCODE_REMOTE_ACCESS_ADVERTISED_HOST` → Tailscale HTTPS (enabled
     *   AND healthy) → custom public URL setting → LAN autodetect.
     * The env override is applied as a bind-host (yielding `http://host:port`) by
     * `remoteAccessAdvertisedHost`, so when it is present we skip Tailscale/custom
     * and return `undefined` here to fall back to the host/port form.
     */
    const resolveAdvertisedBaseUrl = async (port: number): Promise<string | undefined> => {
      remoteTailscaleServeActiveUrl = null;
      const envAdvertisedHost = process.env.LIGHTCODE_REMOTE_ACCESS_ADVERTISED_HOST?.trim();
      if (envAdvertisedHost) return undefined;

      const settings = readSharedSettingsFile(requireLightcodePaths().settingsPath);
      if (settings.remoteAccessTailscaleHttps) {
        const tailscaleUrl = await setUpTailscaleServe(port);
        if (tailscaleUrl) return tailscaleUrl;
      } else {
        remoteTailscaleLastError = null;
      }
      return normalizeAdvertisedUrlSetting(settings.remoteAccessAdvertisedUrl);
    };

    const startRemoteAccessServer = async (): Promise<RemoteAccessServerInfo> => {
      const runningInfo = remoteAccessServer?.getInfo();
      if (runningInfo) return runningInfo;
      if (remoteAccessStartPromise) return remoteAccessStartPromise;

      const paths = requireLightcodePaths();
      const identity = readOrCreateRemoteAccessIdentity(paths.baseDir);
      const remoteHost = remoteAccessHost();
      const advertisedHost = remoteAccessAdvertisedHost({ bindHost: remoteHost });
      const advertisedBaseUrl = await resolveAdvertisedBaseUrl(remoteAccessPort());
      const pairingAppUrl = remoteAccessPairingAppUrl();
      // In dev, phones load the PWA from the Vite dev server (hot reload)
      // instead of the built bundle; swap the loopback host for the LAN one.
      let devMobileAppUrl: string | undefined;
      if (process.env.VITE_DEV_SERVER_URL) {
        const devUrl = new URL("/mobile.html", process.env.VITE_DEV_SERVER_URL);
        devUrl.hostname = advertisedHost;
        devMobileAppUrl = devUrl.toString();
      }
      const authStore = createPersistentRemoteAuthStore(paths.baseDir);
      // Reused (not rebuilt) across a restart (e.g. an advertised-URL change):
      // it owns live TCP listeners, so recreating it here would leak the old
      // ones. `stopRemoteAccessServer` (a full disable) disposes and clears it.
      portForwarding ??= createPortForwarding({
        bindHost: remoteHost,
        remoteAccessPort: remoteAccessPort(),
      });
      const pushStore = new PushRegistrationStore(paths.baseDir);
      pushCoordinator = new PushCoordinator({
        store: pushStore,
        sendPush: createPushGateway({
          onError: (error) =>
            captureMainException(error, { "lightcode.feature_area": "remote-push" }),
        }),
        getThreads: () => dbGetThreads(),
        getProjects: () => dbGetProjects(),
        getSettings: () => {
          const settings = readSharedSettingsFile(requireLightcodePaths().settingsPath);
          return {
            enabled: settings.remotePushEnabled,
            redactContent: settings.remotePushRedactContent,
          };
        },
        getAttributes: () => ({ desktopId: identity.desktopId, desktopName: identity.label }),
      });
      const server = new RemoteAccessServer({
        appVersion: app.getVersion(),
        identity,
        authStore,
        host: remoteHost,
        port: remoteAccessPort(),
        advertisedHost,
        ...(advertisedBaseUrl ? { advertisedBaseUrl } : {}),
        ...(pairingAppUrl ? { pairingAppUrl } : {}),
        ...(devMobileAppUrl ? { devMobileAppUrl } : {}),
        callSupervisor: (name, payload) => supervisorClient.call(name, payload),
        // Thread metadata lives in the renderer store; hand remote commands to
        // the window so they run through the same actions as local edits.
        dispatchThreadCommand: (command) => {
          if (!mainWindow) return false;
          mainWindow.webContents.send(IPC_EVENT_CHANNELS.remoteThreadCommand, command);
          return true;
        },
        browser: new RemoteBrowserGateway(() => browserPanelManager),
        portForward: portForwarding.gateway,
        portProxy: portForwarding.proxy,
        // Remote-editable settings (the AI helpers). Reads/writes the same
        // settings file as the renderer; after a remote write the desktop
        // renderer is told so its store reflects the change without restart.
        gitSummaries: () => remoteGitSummaries,
        settings: {
          read: () =>
            pickRemoteSettings(readSharedSettingsFile(requireLightcodePaths().settingsPath)),
          update: (patch) => {
            const next = patchSharedSettingsFile(requireLightcodePaths().settingsPath, patch);
            mainWindow?.webContents.send(IPC_EVENT_CHANNELS.sharedSettingsChanged, next);
            return pickRemoteSettings(next);
          },
        },
        pushRegistrations: {
          upsert: (registration) => pushStore.upsert(registration),
          remove: (deviceId) => pushStore.remove(deviceId),
        },
      });
      remoteAccessServer = server;
      const startPromise = server
        .start()
        .then((info) => {
          console.log("[lightcode] remote access enabled at %s", info.httpBaseUrl);
          console.log("[lightcode] remote pairing URL: %s", info.pairingUrl);
          return info;
        })
        .catch((error) => {
          if (remoteAccessServer === server) {
            remoteAccessServer = null;
          }
          // Built (`??=` above) against this attempt's bind host/port; without
          // clearing it here, a later retry after the user changes those
          // settings would silently reuse a unit constructed with the stale
          // config.
          portForwarding?.dispose();
          portForwarding = null;
          console.error(
            "[lightcode] remote access failed to start:",
            error instanceof Error ? error.message : String(error),
          );
          captureMainException(error, { "lightcode.feature_area": "remote-access" });
          throw error;
        })
        .finally(() => {
          if (remoteAccessStartPromise === startPromise) {
            remoteAccessStartPromise = null;
          }
        });
      remoteAccessStartPromise = startPromise;
      return remoteAccessStartPromise;
    };

    /** Best-effort teardown of our Tailscale serve HTTPS mapping, if we set one. */
    const teardownTailscaleServe = () => {
      if (!remoteTailscaleServeActiveUrl) return;
      remoteTailscaleServeActiveUrl = null;
      void disableTailscaleServe().catch(() => {});
    };

    const stopRemoteAccessServer = () => {
      const server = remoteAccessServer;
      const forwarding = portForwarding;
      remoteAccessServer = null;
      remoteAccessStartPromise = null;
      pushCoordinator = null;
      portForwarding = null;
      teardownTailscaleServe();
      if (!server) {
        forwarding?.dispose();
        return;
      }
      // dispose() is async (it awaits the HTTP close); the desktop owns the DB
      // independently of the server, so there's no teardown ordering to await
      // here — fire-and-forget, logging any failure. The port-forward gateway
      // (and its proxy) are disposed only after the server's own dispose()
      // resolves: it gives in-flight requests up to 5s to finish, and a POST
      // /api/ports/forward in flight during shutdown must complete (or
      // self-close, per the gateway's `disposed` guard) against a gateway that
      // isn't torn down out from under it mid-request.
      void server
        .dispose()
        .then(() => console.log("[lightcode] remote access disabled"))
        .catch((error) =>
          console.warn(
            "[lightcode] remote access failed to stop cleanly:",
            error instanceof Error ? error.message : String(error),
          ),
        )
        .finally(() => {
          forwarding?.dispose();
        });
    };

    /**
     * Restarts the remote-access server in place so a changed advertised-URL
     * setting (Tailscale HTTPS / custom public URL) takes effect. No-op when the
     * server is not running. Awaits full disposal before rebinding the port to
     * avoid an EADDRINUSE race, and awaits the Tailscale serve teardown so the
     * subsequent start re-asserts a clean mapping.
     */
    const restartRemoteAccessServer = async (): Promise<void> => {
      const starting = remoteAccessStartPromise;
      if (!remoteAccessServer && !starting) return;
      if (starting) await starting.catch(() => {});
      const server = remoteAccessServer;
      remoteAccessServer = null;
      remoteAccessStartPromise = null;
      if (remoteTailscaleServeActiveUrl) {
        remoteTailscaleServeActiveUrl = null;
        await disableTailscaleServe().catch(() => {});
      }
      if (server) await server.dispose().catch(() => {});
      await startRemoteAccessServer();
    };

    const buildTailscaleStatusResponse = (
      enabled: boolean,
      status: TailscaleStatus,
    ): RemoteAccessTailscaleStatus => {
      const serveActive = remoteTailscaleServeActiveUrl !== null;
      if (status.state === "not-installed") {
        return { enabled, serveActive, daemon: "not-installed" };
      }
      if (status.state === "not-running") {
        return { enabled, serveActive, daemon: "not-running" };
      }
      if (status.state === "needs-login") {
        return { enabled, serveActive, daemon: "needs-login" };
      }
      if (status.state === "error") {
        return { enabled, serveActive, daemon: "error", message: status.message };
      }
      const httpsUrl =
        remoteTailscaleServeActiveUrl ??
        (status.dnsName ? buildTailscaleHttpsUrl(status.dnsName) : undefined);
      return {
        enabled,
        serveActive,
        daemon: "running",
        httpsAvailable: status.httpsAvailable,
        ...(status.dnsName ? { dnsName: status.dnsName } : {}),
        ...(httpsUrl ? { httpsUrl } : {}),
        ...(remoteTailscaleLastError ? { message: remoteTailscaleLastError } : {}),
      };
    };

    const getRemoteAccessTailscaleStatus = async (): Promise<RemoteAccessTailscaleStatus> => {
      const enabled = readSharedSettingsFile(
        requireLightcodePaths().settingsPath,
      ).remoteAccessTailscaleHttps;
      const status = await probeTailscaleStatus();
      return buildTailscaleStatusResponse(enabled, status);
    };

    const setRemoteAccessTailscaleHttps = async (
      enabled: boolean,
    ): Promise<RemoteAccessPairingInfo> => {
      const settingsPath = requireLightcodePaths().settingsPath;
      const previous = readSharedSettingsFile(settingsPath).remoteAccessTailscaleHttps;
      writeSharedSettingsPatch({ remoteAccessTailscaleHttps: enabled });
      try {
        await restartRemoteAccessServer();
      } catch (error) {
        writeSharedSettingsPatch({ remoteAccessTailscaleHttps: previous });
        throw error;
      }
      return getRemoteAccessPairingInfo(remoteAccessServer);
    };

    /**
     * Launches the Tailscale GUI so the user can start the daemon or complete
     * login without a terminal. Status polling in Settings picks up the daemon
     * coming online; we do not busy-wait here.
     */
    const startTailscale = async (): Promise<StartTailscaleResult> => {
      const result = await launchTailscaleApp();
      return result.ok ? { ok: true } : { ok: false, message: result.message };
    };

    const setRemoteAccessAdvertisedUrl = async (
      rawUrl: string,
    ): Promise<RemoteAccessPairingInfo> => {
      const trimmed = rawUrl.trim();
      let normalized = "";
      if (trimmed) {
        let url: URL;
        try {
          url = new URL(trimmed);
        } catch {
          throw new Error("Enter a valid URL, for example https://code.example.com.");
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error("Public URL must start with http:// or https://.");
        }
        if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
          throw new Error("Public URL must be an origin only, with no path or query.");
        }
        normalized = url.origin;
      }
      const settingsPath = requireLightcodePaths().settingsPath;
      const previous = readSharedSettingsFile(settingsPath).remoteAccessAdvertisedUrl;
      writeSharedSettingsPatch({ remoteAccessAdvertisedUrl: normalized });
      try {
        await restartRemoteAccessServer();
      } catch (error) {
        writeSharedSettingsPatch({ remoteAccessAdvertisedUrl: previous });
        throw error;
      }
      return getRemoteAccessPairingInfo(remoteAccessServer);
    };

    const setRemoteAccessEnabled = async (enabled: boolean): Promise<RemoteAccessPairingInfo> => {
      if (!enabled) {
        stopRemoteAccessServer();
        writeRemoteAccessEnabledSetting(false);
        return getRemoteAccessPairingInfo(remoteAccessServer);
      }

      writeRemoteAccessEnabledSetting(true);
      try {
        await startRemoteAccessServer();
      } catch (error) {
        writeRemoteAccessEnabledSetting(false);
        throw error;
      }
      return getRemoteAccessPairingInfo(remoteAccessServer);
    };

    registerIpcHandlers({
      localHandlers: createLocalIpcHandlers({
        getMainWindow: () => mainWindow,
        getBrowserPanelManager: () => browserPanelManager,
        getRemoteAccessServer: () => remoteAccessServer,
        setRemoteAccessEnabled,
        getRemoteAccessTailscaleStatus,
        setRemoteAccessTailscaleHttps,
        startTailscale,
        setRemoteAccessAdvertisedUrl,
        requireLightcodePaths,
        updatePowerSaveBlocker,
        autoUpdater: autoUpdaterController,
        onSharedSettingsChanged: primeBrowserAllowFlags,
        onRemoteGitSummaries: (summaries) => {
          remoteGitSummaries = summaries;
          remoteAccessServer?.publishSupervisorEvent({
            type: "remote-git-summaries",
            summaries,
          });
        },
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

    if (readSharedSettingsFile(lightcodePaths.settingsPath).remoteAccessEnabled) {
      void startRemoteAccessServer().catch(() => {
        writeRemoteAccessEnabledSetting(false);
      });
    }

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
      void remoteAccessServer?.dispose();
      remoteAccessServer = null;
      portForwarding?.dispose();
      portForwarding = null;
      browserExtractWindow?.close();
      browserExtractWindow = null;
      browserPanelManager?.dispose();
      browserPanelManager = null;
      sleepInhibitor.dispose();
      tray?.destroy();
      tray = null;
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
