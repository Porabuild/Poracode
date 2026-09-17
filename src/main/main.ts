import { watch } from "node:fs";
import { join } from "node:path";
import { startNodePerformanceDiagnostics } from "@/shared/diagnostics/nodePerformanceDiagnostics";
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  safeStorage,
  session as electronSession,
  type RenderProcessGoneDetails,
} from "electron";
import { BROWSER_SESSION_PARTITION } from "@/shared/browserPartition";
import { resolveThemeMode } from "@/shared/themeMode";
import type { Project, RemoteThreadCommand, Thread } from "@/shared/contracts";
import { cleanupOrphanedAttachments, preparePoracodeDataRoot } from "./poracodeData";
import { createLocalIpcHandlers, showAddFilesDialog } from "./ipc/localHandlers";
import { registerIpcHandlers } from "./ipc/registerHandlers";
import { RemoteHttpBridgeSupervisor } from "./remoteHttp/RemoteHttpBridgeSupervisor";
import { registerRemoteHttpBridgeIpc } from "./remoteHttp/registerRemoteHttpBridgeIpc";
import { createSleepInhibitor } from "./sleepInhibitor";
import { shouldPreventSystemSleep } from "./sleepPolicy";
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
import { startUsageLoginCookieMirror } from "./usageLogin/UsageLoginCookieMirror";
import {
  ComputerUseDesktopOverlay,
  ComputerUseMcpIngress,
  ComputerUseWakeLock,
  type ComputerUseMcpIngressInfo,
  resolveComputerUseHelperBinaryPath,
} from "./computer-use";
import { createAutoUpdaterController } from "./updates/autoUpdater";
import { showOsNotification, showUserNotificationFallback } from "./osNotifications";
import { sampleElectronAppMetrics } from "./diagnostics/appMetricsSample";
import { createMainWindow, saveWindowBounds } from "./window/createMainWindow";
import { createMainWindowCloseLifecycle } from "./window/mainWindowClose";
import { installMainRendererInvalidation } from "./window/mainRendererInvalidation";
import { requestTrackedRendererReload } from "./window/windowHardening";
import {
  createQuickComposerWindow,
  showQuickComposerWindow,
} from "./window/createQuickComposerWindow";
import {
  QuickComposerLifecycle,
  type QuickComposerLifecycleHost,
} from "./window/quickComposerLifecycle";
import { showAndFocusWindow } from "./window/showAndFocusWindow";
import { createTray, type TrayHandle } from "./tray";
import { readKeybindingsFile } from "./keybindingsFile";
import { QuickComposerShortcutManager } from "./quickComposerShortcut";
import { shouldStartMinimized, syncWindowsStartupRegistration } from "./startupSettings";
import { reportSingleInstanceRefusal } from "./singleInstanceRefusal";
import { safeStorageHealth } from "./safeStorageHealth";
import { type PoracodePaths } from "@/shared/poracodePaths";
import { getAppName } from "@/shared/appName";
import { productNameFor, resolvePoracodeChannel } from "@/shared/channel";
import {
  IPC_EVENT_CHANNELS,
  IPC_WINDOW_CHANNELS,
  isAgentStatusSupervisorEvent,
  quickComposerSubmissionSchema,
  type SupervisorEvent,
} from "@/shared/ipc";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import { toError } from "@/shared/errorMessage";
import { readSharedSettingsFile } from "./sharedSettingsFile";
import { WindowsJobObjectManager } from "./windowsJobObject";
import { captureMainException, initializeMainSentry } from "./diagnostics/sentry";
import {
  classifyRendererProcessGone,
  type RendererProcessGoneIntent,
} from "./diagnostics/processGone";
import { configureSecretStorageKey } from "@/shared/secretStorage";
import { readOrCreateSafeStorageSecretKey } from "./secretStorageKey";
import { SshConnectionManager } from "./ssh/SshConnectionManager";
import {
  legacyProductNameFor,
  resolveLegacyElectronUserDataDir,
} from "@/shared/legacyProductPaths";
import { refreshMacDockIcon } from "./macDockIcon";
import { repairLegacyMacAppPath } from "./macAppPathMigration";
import { shouldUseMockKeychain } from "./mockKeychain";
import { APP_QUIT_CLEANUP_TIMEOUT_MS, raceWithTimeout } from "./appQuitCleanup";
import { BackendHostClient } from "./backend/BackendHostClient";
import { buildDesktopBackendInitialize } from "./backend/desktopBackendInitialize";
import { BackendStateStore, type ShellStateStore } from "./backend/BackendStateStore";
import { RendererEventInterestsWiring } from "./backend/rendererEventInterestsWiring";
import { createRendererEventDispatcher } from "./backend/rendererEventDispatch";
import { resolveDeliveryTargetWindow } from "./backend/rendererDeliveryTable";
import { migrateLegacyDataOutOfProcess } from "./legacyMigrationClient";
import type { BackendRendererStreamInfo } from "@/shared/backendHostProtocol";
import { RemoteBrowserGateway } from "./remote/RemoteBrowserGateway";
import { installProcessStdioErrorHandlers } from "./processStdio";
import { registerSmokeNativeControls } from "./testing/smokeNativeControls";
import { joinRuntimeShutdown } from "@/backend/joinRuntimeShutdown";
import { HostDataFence, HostDataFenceInUseError } from "@/backend/ownership/hostDataFence";
import { HostOwnerLease, HostRootInUseError } from "@/backend/ownership/hostOwnerLease";
import { HostCredentialAdoptionService } from "@/backend/ownership/nativeSecretKey";
import { resolveDesktopHostRootPaths } from "@/backend/ownership/hostRootPaths";
import type { HostControlServer } from "@/backend/ownership/HostControlServer";
import type { StandaloneAttachInfo } from "@/shared/standaloneAttach";
import {
  buildStandaloneAttachInfoForRenderer,
  createEphemeralShellState,
  createStandaloneAttachSession,
  decideDeferredStandaloneAttach,
  describeAttachRefusal,
  resolveDesktopBaseDir,
  shouldDeferLeaseForAttachProbe,
  type DeferredAttachProbe,
  type StandaloneAttachSession,
} from "./backend/standaloneAttachBootstrap";
import { registerStandaloneAttachIpc } from "./backend/standaloneAttachIpc";
import {
  admitDesktopManagedOwner,
  probeLegacyOwnerConflict,
} from "./backend/desktopOwnerAdmission";
import { startDesktopHostControl } from "./backend/desktopHostControl";

// Electron can remain alive after its launching terminal or dev runner exits.
// Install this before any startup logging so a detached diagnostic pipe cannot
// recurse through the global exception handler below and wedge the main loop.
installProcessStdioErrorHandlers();

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

// Isolated smoke runs replace HOME so they cannot read developer credentials;
// on macOS that hides the login keychain from Chromium. Dev-identity Electron
// binaries on macOS can also fail keychain resolution outright (blocking
// "Keychain Not Found" dialog each launch), so darwin DEV launches default to
// Chromium's mock keychain — dev profiles are disposable. Packaged launches
// always keep the real OS keychain; PORACODE_USE_REAL_KEYCHAIN=1 opts a dev
// launch back in, and PORACODE_USE_MOCK_KEYCHAIN=1 lets a harness-driven
// unpackaged launch (built bundle on the node_modules electron binary) opt
// into the mock — never a packaged app.
if (shouldUseMockKeychain({ isDev, isPackaged: app.isPackaged })) {
  app.commandLine.appendSwitch("use-mock-keychain");
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
let desktopOwnerLease: HostOwnerLease | null = null;
// Standalone attach (Gate 2 connected slice): when owner discovery is visible
// at module load, the lease acquisition is deferred to `whenReady` so the
// authenticated describe decision runs BEFORE lease/acquire, backend fork,
// legacy migration, and desktop secret-key init. Null means the synchronous
// managed path below already ran.
let deferredStandaloneProbe: DeferredAttachProbe | null = null;
// Authenticated attach payload for the renderer bootstrap (endpoint + fresh
// pairing URL + pinned generation). Present only in attach mode; served over
// IPC, never logged or persisted.
let standaloneAttachInfo: StandaloneAttachInfo | null = null;
// Ephemeral window state for attach mode (no owned-root writes; window bounds
// do not persist across restarts in this candidate — device-only persistence
// stays future work).
let standaloneAttachShellState: ShellStateStore | null = null;
// Always a real Error: the caught acquisition failure is normalized at
// capture time so the readiness rethrow keeps its identity under the
// only-throw-error rule.
let desktopOwnerAcquisitionError: Error | null = null;
// Desktop-owner publication of the shared authenticated control surface
// (discovery + describe). Null in attach mode and before readiness.
let desktopHostControlServer: HostControlServer | null = null;
// Desktop half of staged-import activation (Gate 2.5 S5.1): while this
// desktop owns the profile it publishes the one-time key-adoption offer and
// answers a single authenticated unseal for a `poracode-server activate` run
// against this profile. Additive — ordinary operation never contacts it.
let hostCredentialAdoption: HostCredentialAdoptionService | null = null;
// Attach-session anchor for generation re-verification; null outside attach.
let standaloneAttachSession: StandaloneAttachSession | null = null;
// Zero-window (tray/hidden) remote thread commands. The backend mirrors these
// to the renderer store; with no mounted window they used to be dropped
// silently while the backend still reported hasRendererWindow:true. Ordered,
// bounded, flushed in arrival order when a main window next becomes ready.
const PENDING_THREAD_COMMAND_LIMIT = 64;
let pendingThreadCommands: RemoteThreadCommand[] = [];
if (hasSingleInstanceLock) {
  const electronUserDataDir = app.getPath("userData");
  const baseDir = resolveDesktopBaseDir({
    ...(baseDirOverride ? { baseDirOverride } : {}),
    isDev,
    channel,
  });
  // Decision-before-authority: when an existing owner may hold this profile,
  // defer the lease so the authenticated describe runs first. Otherwise keep
  // the existing synchronous managed path untouched.
  if (shouldDeferLeaseForAttachProbe(baseDir)) {
    deferredStandaloneProbe = { baseDir };
  } else {
    try {
      // Legacy-owner refusal: a live legacy server with a still-pending data
      // import refuses BEFORE any acquire — never acquire-and-fight the
      // importer on the desktop mapping.
      probeLegacyOwnerConflict({
        baseDir,
        channel,
        electronUserDataDir,
        ...(legacyElectronUserDataDir ? { legacyElectronUserDataDir } : {}),
        ...(legacyBaseDirOverride ? { legacyBaseDir: legacyBaseDirOverride } : {}),
        allowCustomDataRoot: app.isPackaged,
      });
      desktopOwnerLease = HostOwnerLease.acquire(resolveDesktopHostRootPaths(baseDir), "desktop");
      // Data-custody fence, fast-path single shot: an orphaned backend of a
      // killed owner still holds it. The bounded wait lives on the deferred
      // readiness path; a busy fence defers there instead of failing.
      const fence = HostDataFence.acquire(resolveDesktopHostRootPaths(baseDir).dataFencePath);
      fence.release();
    } catch (error) {
      desktopOwnerLease?.release();
      desktopOwnerLease = null;
      if (error instanceof HostRootInUseError || error instanceof HostDataFenceInUseError) {
        // Another owner may still be quitting or draining: defer to the
        // readiness path, which re-probes with a bounded wait before the
        // loud refusal (concurrent-launch UX).
        console.warn("[poracode] desktop owner is busy; re-probing at startup:", error);
        deferredStandaloneProbe = { baseDir };
      } else {
        // Normalized so the rethrow at readiness is always an Error with its
        // identity intact (pre-existing type-aware lint finding at the rethrow).
        desktopOwnerAcquisitionError = toError(error);
        console.error("[poracode] failed to acquire the desktop host owner:", error);
      }
    }
    if (!desktopOwnerAcquisitionError && !deferredStandaloneProbe) {
      try {
        const result = migrateLegacyDataOutOfProcess({
          baseDir,
          channel,
          electronUserDataDir,
          legacyElectronUserDataDir,
          ...(legacyBaseDirOverride ? { legacyBaseDir: legacyBaseDirOverride } : {}),
          allowCustomDataRoot: app.isPackaged,
        });
        if (result.status === "migrated") {
          console.info(`[migrate] imported all available Lightcode data into ${baseDir}`);
        }
      } catch (error) {
        console.warn(`[migrate] failed to import Lightcode data into ${baseDir}:`, error);
      }
      poracodePaths = preparePoracodeDataRoot(baseDir);
    }
  }
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
// The active mode's quick-composer device lifecycle (managed or standalone
// attach). Module window functions below delegate to it; each startup assigns
// its own host (attach binds the ephemeral shell state for main recreation).
let quickComposerLifecycle: QuickComposerLifecycle | null = null;
let pendingTrayThreadId: string | null = null;
let windowsJobObjectManager: WindowsJobObjectManager | null = null;
let browserPanelManager: BrowserPanelManager | null = null;
let browserMcpIngress: BrowserMcpIngress | null = null;
let computerUseMcpIngress: ComputerUseMcpIngress | null = null;
let computerUseDesktopOverlay: ComputerUseDesktopOverlay | null = null;
let chromeBridgeServer: ChromeBridgeServer | null = null;
let chromeMcpIngress: ChromeMcpIngress | null = null;
let browserExtractWindow: BrowserWindow | null = null;
let backendHostClient: BackendHostClient | null = null;
let backendStateStore: BackendStateStore | null = null;
let backendRendererStreamInfo: BackendRendererStreamInfo | null = null;
let clearRendererEventInterests: ((senderId?: number) => void) | null = null;
// Retained module-scope so the native Tray icon stays reachable from GC.
let tray: TrayHandle | null = null;
let quickComposerShortcutManager: QuickComposerShortcutManager | null = null;
let isQuitting = false;

// Rider (Gate 4 plan, folded into this lane): opt-in Electron per-process
// CPU/memory samples appended to each NDJSON sample line. Purely additive to
// format v2 (optional new field, sample lines only).
const performanceDiagnostics = startNodePerformanceDiagnostics("desktop-main", process.env, {
  sampleAppMetrics: sampleElectronAppMetrics,
});

function requireBackendStateStore(): BackendStateStore {
  if (!backendStateStore) throw new Error("Backend state projection is not initialized.");
  return backendStateStore;
}

function captureRendererProcessGone(
  details: RenderProcessGoneDetails,
  featureArea: "browser" | "quick-composer" | "renderer",
  intent?: RendererProcessGoneIntent,
): void {
  const diagnostic = classifyRendererProcessGone(
    details,
    process.platform,
    isQuitting ? "app-shutdown" : intent,
  );
  if (!diagnostic) return;
  captureMainException(
    new Error(`Electron renderer process gone (${diagnostic.bucket})`),
    {
      "poracode.feature_area": featureArea,
      "poracode.process": "renderer",
    },
    diagnostic.fingerprint,
  );
}

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

function quickComposerWindowFor(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window && window === quickComposerWindow && !window.isDestroyed() ? window : null;
}

function flushTrayThreadOpen(): void {
  if (
    !(quickComposerLifecycle?.isMainReady() ?? false) ||
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !pendingTrayThreadId
  )
    return;
  const threadId = pendingTrayThreadId;
  pendingTrayThreadId = null;
  mainWindow.webContents.send(IPC_EVENT_CHANNELS.threadOpenRequested, { threadId });
}

/**
 * Flush remote thread commands that arrived while no renderer window was
 * mounted. The renderer store applies (and persists) them exactly like live
 * mirrors; arrival order is preserved. TODO(Lane 1B, BackendDesktopServices):
 * once the backend applies thread commands DB-direct when it has no renderer
 * window (its `hasRendererWindow` is currently hardcoded `true`), commands
 * stop arriving here while zero-window and this queue stays permanently
 * empty — remove it then.
 */
function flushPendingThreadCommands(): void {
  const window = mainWindow;
  if (!window || window.isDestroyed() || pendingThreadCommands.length === 0) return;
  const commands = pendingThreadCommands;
  pendingThreadCommands = [];
  for (const command of commands) {
    window.webContents.send(IPC_EVENT_CHANNELS.remoteThreadCommand, command);
  }
}

function ensureMainWindow(showOnReady = true, stateOverride?: ShellStateStore): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  quickComposerLifecycle?.markMainNotReady();
  mainWindow = createMainAppWindow(showOnReady, stateOverride);
  browserPanelManager?.bindHost(mainWindow);
  return mainWindow;
}

function openThreadFromTray(threadId: string): void {
  pendingTrayThreadId = threadId;
  showAndFocusWindow(ensureMainWindow());
  flushTrayThreadOpen();
}

function finishQuickComposerDismiss(window: BrowserWindow): void {
  quickComposerLifecycle?.finishDismiss(window);
}

function requestQuickComposerDismiss(window: BrowserWindow): void {
  quickComposerLifecycle?.requestDismiss(window);
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
    openDevTools: process.env.PORACODE_DISABLE_DEVTOOLS !== "1",
    ...(process.env.VITE_DEV_SERVER_URL ? { devServerUrl: process.env.VITE_DEV_SERVER_URL } : {}),
  };
}

function createQuickComposerAppWindow(): BrowserWindow {
  const window = createQuickComposerWindow({
    ...commonAppWindowOptions(),
    onClosed: () => {
      if (quickComposerWindow === window) quickComposerWindow = null;
    },
    onRendererProcessGone: (details, intent) => {
      captureRendererProcessGone(details, "quick-composer", intent);
    },
  });
  window.on("blur", () => {
    setTimeout(() => {
      if (
        !(quickComposerLifecycle?.isDialogOpen() ?? false) &&
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
  quickComposerLifecycle?.toggle();
}

// One device lifecycle host for both modes: window factories, delivery, and
// dismissal effects are identical. Only main-window recreation differs —
// managed uses the backend shell store, attach binds its ephemeral shell
// state — so it is the single injected callback.
function createQuickComposerLifecycleHost(
  ensureMainWindowForComposer: (showOnReady: boolean) => BrowserWindow,
): QuickComposerLifecycleHost {
  return {
    getMainWindow: () => mainWindow,
    getOverlay: () => quickComposerWindow,
    setOverlay: (window) => {
      quickComposerWindow = window;
    },
    createOverlay: () => createQuickComposerAppWindow(),
    ensureMainWindow: ensureMainWindowForComposer,
    showOverlay: (window) => showQuickComposerWindow(window),
    revealMainWindow: (window) => {
      if (window.webContents.isLoading()) {
        window.once("ready-to-show", () => showAndFocusWindow(window));
      } else {
        showAndFocusWindow(window);
      }
    },
    deliverSubmission: (window, submission) => {
      window.webContents.send(IPC_EVENT_CHANNELS.quickComposerSubmit, submission);
    },
    requestOverlayDismiss: (window) => {
      window.webContents.send(IPC_EVENT_CHANNELS.quickComposerDismissRequested);
    },
    hideOverlay: (window) => window.hide(),
    pickFiles: (owner) => showAddFilesDialog(owner),
  };
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

function createMainAppWindow(showOnReady = true, stateOverride?: ShellStateStore): BrowserWindow {
  const windowChrome = resolveWindowChromeOptions();
  let window: BrowserWindow;
  // Captured before any close path can destroy the webContents the id reads from.
  let windowSenderId: number | undefined;
  const closeLifecycle = createMainWindowCloseLifecycle({
    isQuitting: () => isQuitting,
    closeToTrayEnabled: isCloseToTrayEnabled,
    hide: () => window.hide(),
    markQuitting: () => {
      isQuitting = true;
    },
    quit: () => app.quit(),
  });
  window = createMainWindow({
    ...commonAppWindowOptions(),
    state: stateOverride ?? requireBackendStateStore(),
    windowChromeHeight: WINDOW_CHROME_HEIGHT,
    appearance: windowChrome.appearance,
    sidebarTranslucency: windowChrome.sidebarTranslucency,
    showOnReady,
    onClosed: () => {
      const wasMainWindow = mainWindow === window;
      if (windowSenderId !== undefined) clearRendererEventInterests?.(windowSenderId);
      if (wasMainWindow) {
        mainWindow = null;
        quickComposerLifecycle?.markMainNotReady();
        closeLifecycle.handleClosed();
      }
    },
    onClose: (event) => closeLifecycle.handleClose(event),
    onRendererProcessGone: (details, intent) => {
      captureRendererProcessGone(details, "renderer", intent);
    },
  });
  windowSenderId = window.webContents.id;
  installMainRendererInvalidation(window.webContents, {
    isCurrent: () => mainWindow === window,
    invalidate: () => {
      quickComposerLifecycle?.markMainNotReady();
      if (windowSenderId !== undefined) clearRendererEventInterests?.(windowSenderId);
    },
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
    state: requireBackendStateStore(),
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
    onRendererProcessGone: (details, intent) => {
      captureRendererProcessGone(details, "browser", intent);
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
// A locked desktop is uncontrollable and unobservable for computer use, so the
// display is held awake for the duration of a session. Owned here (not by the
// ingress) so it survives ingress restarts and is released on quit.
const computerUseWakeLock = new ComputerUseWakeLock();

function requirePoracodePaths(): PoracodePaths {
  if (!poracodePaths) {
    throw new Error("Poracode paths are not initialized.");
  }
  return poracodePaths;
}

function updatePowerSaveBlocker(): void {
  if (!poracodePaths) {
    sleepInhibitor.setActive(workingThreads.size > 0);
    computerUseWakeLock.setEnabled(defaultSharedSettings.computerUseKeepAwake);
    return;
  }
  const settings = readSharedSettingsFile(poracodePaths.settingsPath);
  sleepInhibitor.setActive(shouldPreventSystemSleep(settings, workingThreads.size));
  // Every settings write funnels through here, so toggling the setting off
  // releases an already-held wake lock immediately.
  computerUseWakeLock.setEnabled(settings.computerUseKeepAwake);
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

/**
 * Minimal Electron startup as a client of the already-running headless owner.
 * Skips owner lease, backend fork, legacy migration, and desktop secret-key
 * init by construction (none are called here). Real state/command routing
 * comes from the renderer bootstrap (RemoteDesktopClient over the bridge-2
 * utility process). Quit is client cleanup only: no owner-stop credential and
 * no process-kill path exist in attach mode.
 *
 * Remaining limits of this candidate (later verification owns them): window
 * bounds are ephemeral, browser/ingress/tray-DB services are unavailable, and
 * server-owned database/supervisor/settings procedures fail closed. Device-only
 * locals (renderer interests, keybindings, window focus, update status and
 * actions, shortcut suspension) are served by real implementations; the real
 * quick-composer device lifecycle (tray, shortcut, pending submit flush,
 * graceful dismiss, picker focus) and renderer-reload window channels are
 * registered so those surfaces work instead of crash-looping.
 * No new user-facing strings; no visual changes.
 */
async function startStandaloneAttachMode(): Promise<void> {
  repairLegacyMacAppPath(channel, { isPackaged: app.isPackaged });
  refreshMacDockIcon();
  Menu.setApplicationMenu(null);

  installLocalFileProtocolHandler();
  installPickerProtocolHandler();

  const shellState = createEphemeralShellState();
  standaloneAttachShellState = shellState;

  const remoteHttpBridgeSupervisor = new RemoteHttpBridgeSupervisor({
    utilityPath: join(__dirname, "remoteHttpBridge.cjs"),
    isPackaged: app.isPackaged,
    ...(process.env.PORACODE_REMOTE_HTTP_BRIDGE_DEBUG === "1"
      ? { log: (message: string) => console.log(message) }
      : {}),
  });
  registerRemoteHttpBridgeIpc({ supervisor: remoteHttpBridgeSupervisor });

  // S1.4: every attach transport (re)establishment — each renderer
  // (re)bootstrap re-reads this payload — re-runs the authenticated describe
  // with a generation check before the payload is served again. A stale
  // generation throws so the renderer boot fails closed (never a local
  // authority); relaunching re-runs the decision and re-pairs. There is
  // deliberately no per-request generation pinning: persisted bearers survive
  // a same-root owner restart by design, and per-request pinning would break
  // that proven restart continuity.
  ipcMain.handle(IPC_WINDOW_CHANNELS.standaloneAttachInfo, async () => {
    if (!standaloneAttachSession) throw new Error("Standalone attach session is not anchored.");
    await standaloneAttachSession.reverify();
    return standaloneAttachInfo;
  });
  ipcMain.handle(IPC_WINDOW_CHANNELS.backendRendererStreamInfo, () => null);
  ipcMain.handle(IPC_WINDOW_CHANNELS.rendererStreamOwnershipGrant, () => null);

  // Device-owned locals with real implementations; everything server-owned
  // loud-rejects (no local backend exists to serve it). Must run before the
  // main window is created so boot-time procedures resolve.
  if (!standaloneAttachInfo) {
    throw new Error("Standalone attach started without owner information.");
  }
  // The real quick-composer device lifecycle on the ephemeral shell state:
  // submit queues while main is loading/closed and flushes on ready, dismiss
  // is graceful with main reveal, and recreation never touches managed
  // backend/shell paths.
  quickComposerLifecycle = new QuickComposerLifecycle(
    createQuickComposerLifecycleHost((showOnReady) => ensureMainWindow(showOnReady, shellState)),
  );
  const attachQuickComposer = quickComposerLifecycle;
  registerStandaloneAttachIpc({
    getMainWindow: () => mainWindow,
    getQuickComposerWindow: () => quickComposerWindow,
    profileNamespace: standaloneAttachInfo.profileNamespace,
    channel,
    isDev,
    reportError: (error, tags) => captureMainException(error, tags),
    markQuitting: () => {
      isQuitting = true;
    },
    quickComposer: attachQuickComposer,
    onKeybindingsChanged: (file) => quickComposerShortcutManager?.apply(file),
    setShortcutsSuspended: (suspended) => globalShortcut.setSuspended(suspended),
  });

  // Device shortcut registration from the attach keybindings file, re-applied
  // on every attach keybinding save (managed parity).
  quickComposerShortcutManager = new QuickComposerShortcutManager(
    globalShortcut,
    process.platform,
    toggleQuickComposerWindow,
    (accelerator) => {
      tray?.setQuickComposerShortcut(accelerator);
    },
  );
  try {
    quickComposerShortcutManager.apply(
      readKeybindingsFile(join(standaloneAttachInfo.profileNamespace, "keybindings.json")).file,
    );
  } catch (error) {
    console.warn("[poracode] failed to register the quick composer shortcut", error);
  }

  ensureMainWindow(true, shellState);

  registerSmokeNativeControls({
    ipcMain,
    isDev,
    isPackaged: app.isPackaged,
    mockAgents: process.env.PORACODE_MOCK_AGENTS === "1",
    getMainWebContents: () => mainWindow?.webContents ?? null,
    toggleQuickComposer: toggleQuickComposerWindow,
    closeMainWindow: () => mainWindow?.close(),
    quitApp: () => app.quit(),
    inspectQuickComposer: () =>
      quickComposerWindow && !quickComposerWindow.isDestroyed()
        ? { visible: quickComposerWindow.isVisible(), focused: quickComposerWindow.isFocused() }
        : null,
  });

  tray = createTray({
    channel,
    appName: getAppName(channel, isDev),
    getProjects: () => [],
    getThreads: () => [],
    onOpenThread: () => {},
    onShow: () => showAndFocusWindow(ensureMainWindow(true, shellState)),
    onQuickComposer: toggleQuickComposerWindow,
    onQuit: () => {
      isQuitting = true;
      app.quit();
    },
  });
  tray.setQuickComposerShortcut(quickComposerShortcutManager.active[0] ?? null);

  app.on("activate", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      showAndFocusWindow(mainWindow);
      return;
    }
    ensureMainWindow(true, shellState);
  });

  let quitCleanupStarted = false;
  app.on("before-quit", (event) => {
    isQuitting = true;
    if (quitCleanupStarted) return;
    quitCleanupStarted = true;
    event.preventDefault();
    // Client cleanup only: the external owner keeps its lease, SQLite, and
    // supervisor. No owner-stop credential is held and no child is killed
    // here (no BackendHostClient was ever forked in attach mode).
    if (mainWindow && !mainWindow.isDestroyed()) {
      saveWindowBounds(mainWindow, shellState, "window-bounds");
    }
    quickComposerShortcutManager?.dispose();
    quickComposerShortcutManager = null;
    quickComposerLifecycle?.dispose();
    quickComposerWindow?.close();
    quickComposerWindow = null;
    sleepInhibitor.dispose();
    tray?.destroy();
    tray = null;
    void shellState.close().then(
      () => app.quit(),
      () => app.quit(),
    );
  });
}

registerLocalFileProtocolScheme();
registerPickerProtocolScheme();

if (!hasSingleInstanceLock) {
  // Never-silent refusal (P2): disclose who holds the profile before quitting.
  // A modal error box (not just the console) because Finder-launched copies
  // have no terminal to read — the user would otherwise see nothing at all.
  const refusal = reportSingleInstanceRefusal(app.getPath("userData"));
  dialog.showErrorBox("Poracode is already running", refusal);
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
    if (standaloneAttachShellState) {
      showAndFocusWindow(ensureMainWindow(true, standaloneAttachShellState));
      return;
    }
    showAndFocusWindow(ensureMainWindow());
  });

  void app
    .whenReady()
    .then(async () => {
      if (deferredStandaloneProbe) {
        const outcome = await decideDeferredStandaloneAttach(deferredStandaloneProbe);
        if (outcome.kind === "refuse") throw new Error(describeAttachRefusal(outcome));
        if (outcome.kind === "attach") {
          standaloneAttachInfo = await buildStandaloneAttachInfoForRenderer({
            endpoint: outcome.endpoint,
            ownerGeneration: outcome.ownerGeneration,
            profileNamespace: outcome.profileNamespace,
            dataRoot: outcome.dataRoot,
            controlPaths: outcome.controlPaths,
          });
          // Re-verification anchor for the whole attach session: every
          // renderer (re)bootstrap re-runs the authenticated describe with a
          // generation check before the payload is served again.
          standaloneAttachSession = createStandaloneAttachSession({
            controlPaths: outcome.controlPaths,
            mode: outcome.description.mode,
            info: standaloneAttachInfo,
          });
          await startStandaloneAttachMode();
          return;
        }
        // Deferred managed: discovery vanished between module load and ready
        // (owner stopped), or the desktop mapping held stale discovery its
        // control could not be reached on. Follow the existing managed
        // startup verbatim, still acquiring the lease before mutations
        // (held lock refuses loudly; only a free lease recovers the same
        // desktop root). Headless-mapping evidence never reaches here.
        if (outcome.kind === "no-probe") {
          throw new Error("Standalone attach probe did not run.");
        }
        const electronUserDataDir = app.getPath("userData");
        try {
          // Full managed admission: legacy-owner refusal, lease with bounded
          // wait-and-reprobe, then the data-custody fence probe. A genuinely
          // held root still fails loudly; a concurrently quitting owner wins.
          desktopOwnerLease = await admitDesktopManagedOwner({
            baseDir: outcome.baseDir,
            channel,
            electronUserDataDir,
            ...(legacyElectronUserDataDir ? { legacyElectronUserDataDir } : {}),
            ...(legacyBaseDirOverride ? { legacyBaseDir: legacyBaseDirOverride } : {}),
            allowCustomDataRoot: app.isPackaged,
          });
        } catch (error) {
          desktopOwnerAcquisitionError = toError(error);
          console.error("[poracode] failed to acquire the desktop host owner:", error);
        }
        if (!desktopOwnerAcquisitionError) {
          try {
            const result = migrateLegacyDataOutOfProcess({
              baseDir: outcome.baseDir,
              channel,
              electronUserDataDir,
              legacyElectronUserDataDir,
              ...(legacyBaseDirOverride ? { legacyBaseDir: legacyBaseDirOverride } : {}),
              allowCustomDataRoot: app.isPackaged,
            });
            if (result.status === "migrated") {
              console.info(
                `[migrate] imported all available Lightcode data into ${outcome.baseDir}`,
              );
            }
          } catch (error) {
            console.warn(
              `[migrate] failed to import Lightcode data into ${outcome.baseDir}:`,
              error,
            );
          }
          poracodePaths = preparePoracodeDataRoot(outcome.baseDir);
        }
      }
      if (desktopOwnerAcquisitionError) throw desktopOwnerAcquisitionError;
      if (preserveLegacySafeStorageIdentity) app.setName(productNameFor(channel));
      repairLegacyMacAppPath(channel, { isPackaged: app.isPackaged });
      refreshMacDockIcon();
      Menu.setApplicationMenu(null);

      installLocalFileProtocolHandler();
      installPickerProtocolHandler();
      // Keep the pre-rebrand partition so browser cookies and sign-ins survive.
      const browserSession = electronSession.fromPartition(BROWSER_SESSION_PARTITION);
      browserSession.setUserAgent(browserUserAgent);

      const paths = requirePoracodePaths();
      // Re-seal an already-signed-in provider's cookie whenever the live jar
      // refreshes it, so providers with session-scoped auth cookies (Alibaba's
      // console) don't age out of the one snapshot taken at sign-in.
      startUsageLoginCookieMirror({ cacheDir: paths.cacheDir, session: browserSession });
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

      const secretStorageKey = readOrCreateSafeStorageSecretKey(paths.baseDir);
      // Configure the same key in main so it can seal captured secrets (e.g. usage
      // login cookies); the supervisor configures it from the env var it receives.
      configureSecretStorageKey(secretStorageKey);

      const supervisorPath = join(__dirname, "supervisor.cjs");
      const backendHostPath = join(__dirname, "backendHost.cjs");
      const wslHelpersDir = app.isPackaged
        ? join(process.resourcesPath, "wsl-helpers")
        : join(__dirname, "..", "..", "resources", "wsl-helpers");
      const bundledSkillsDir = app.isPackaged
        ? join(process.resourcesPath, "skills")
        : join(__dirname, "..", "..", "resources", "skills");
      const bundledPluginsDir = app.isPackaged
        ? join(process.resourcesPath, "plugins")
        : join(__dirname, "..", "..", "resources", "plugins");
      const sshConnectionManager = new SshConnectionManager({
        mainBundleDir: __dirname,
        agentPluginsDir: app.isPackaged
          ? join(process.resourcesPath, "agent-plugins")
          : join(__dirname, "..", "..", "resources", "agent-plugins"),
        wslHelpersDir,
        bundledSkillsDir,
        bundledPluginsDir,
        cacheDir: join(paths.baseDir, "ssh-runtime-bundles"),
      });

      // Per-window renderer event interests and the delivery-ownership
      // authority: main mints grants keyed by the authoritative webContents
      // id, shares the binding secret only with that window's renderer, and
      // drops a destroyed/reloaded window's grant so a stale socket can never
      // hold ownership across a new generation. Identity and generation are
      // allocated synchronously before a window's interests are published, and
      // the wiring republishes the per-window table for every interest or
      // identity change even when the merged union does not move.
      const reportEventInterestSyncError = (error: unknown): void => {
        captureMainException(error, { "poracode.feature_area": "live-event-routing" });
      };
      const rendererEventInterests = new RendererEventInterestsWiring({
        pushUnionInterests: (interests) => backendHost.setEventInterests(interests),
        pushDeliveryTable: (windows) => backendHost.setRendererStreamOwnership(windows),
        onError: reportEventInterestSyncError,
        shellRemainderWindowId: () =>
          mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents.id : null,
      });
      let trayProjects: Project[] = [];
      let trayThreads: Thread[] = [];
      let autoUpdaterController!: ReturnType<typeof createAutoUpdaterController>;
      let remoteBrowserGateway: RemoteBrowserGateway | null = null;
      let stopRemoteBrowserWatch: (() => void) | null = null;
      let supervisorClient: BackendHostClient;
      const dispatchBackendSupervisorEvent = createRendererEventDispatcher({
        isStaleDeliveryTarget: (target) => rendererEventInterests.isStaleDeliveryTarget(target),
        resolveTargetWindow: (target) => {
          const window = resolveDeliveryTargetWindow(target, [
            mainWindow,
            quickComposerWindow,
            browserExtractWindow,
          ]);
          if (!window) return null;
          return {
            windowId: window.webContents.id,
            send: (event, rendererSequence) =>
              window.webContents.send(IPC_EVENT_CHANNELS.supervisorEvent, event, rendererSequence),
          };
        },
        sendToShell: (event, rendererSequence) => {
          if (rendererSequence === undefined) {
            mainWindow?.webContents.send(IPC_EVENT_CHANNELS.supervisorEvent, event);
          } else {
            mainWindow?.webContents.send(
              IPC_EVENT_CHANNELS.supervisorEvent,
              event,
              rendererSequence,
            );
          }
        },
        applyNativeState: handleSupervisorEventForSleep,
        forwardAgentStatus: forwardAgentStatusEventToQuickComposer,
        quickComposerWindowId: () =>
          quickComposerWindow && !quickComposerWindow.isDestroyed()
            ? quickComposerWindow.webContents.id
            : null,
      });
      const handleBackendReset = (): void => {
        workingThreads.clear();
        updatePowerSaveBlocker();
      };
      const backendHost = new BackendHostClient({
        backendHostPath,
        ...(performanceDiagnostics
          ? { queueDiagnostics: performanceDiagnostics.queueCapture }
          : {}),
        initialize: buildDesktopBackendInitialize({
          baseDir: paths.baseDir,
          dbPath: paths.dbPath,
          channel,
          settingsPath: paths.settingsPath,
          devServerUrl: process.env.VITE_DEV_SERVER_URL,
          supervisor: {
            appVersion: app.getVersion(),
            isDev,
            supervisorPath,
            wslHelpersDir,
            bundledSkillsDir,
            bundledPluginsDir,
            secretStorageKey,
            preferUiResponsiveness: true,
          },
        }),
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
          return env;
        },
        assignPid: async (pid) => {
          await windowsJobObjectManager?.assignPid(pid);
        },
        reportError: (error, tags) => {
          captureMainException(error, tags);
        },
        onEvent: dispatchBackendSupervisorEvent,
        onSupervisorEventGap: (gap) => {
          // A window whose direct stream is down rebuilds from persisted
          // state on this signal; windows with a healthy stream ignore it.
          for (const window of [mainWindow, quickComposerWindow, browserExtractWindow]) {
            if (window && !window.isDestroyed()) {
              window.webContents.send(IPC_EVENT_CHANNELS.backendSupervisorEventGap, gap);
            }
          }
        },
        onRendererStreamRecovery: (barrier) => {
          // Targeted, generation-fenced loss window for one window's direct
          // stream. Delivered to exactly that window so it can fence the dead
          // socket and rebuild before its local onclose even fires.
          const window = resolveDeliveryTargetWindow(barrier, [
            mainWindow,
            quickComposerWindow,
            browserExtractWindow,
          ]);
          window?.webContents.send(IPC_EVENT_CHANNELS.rendererStreamRecovery, barrier);
        },
        onReset: handleBackendReset,
        handleNativeRequest: (request) => {
          switch (request.operation) {
            case "dispatch-thread-command": {
              const window = mainWindow;
              if (!window || window.isDestroyed() || pendingThreadCommands.length > 0) {
                // Zero-window (tray/hidden): queue instead of dropping. The
                // backend currently reports hasRendererWindow:true even with
                // no window (BackendDesktopServices hardcodes it; Lane 1B
                // owns that file), so its callers believe delivery happened —
                // the queue makes that true by flushing on the next ready
                // window (see flushPendingThreadCommands). Also queue while a
                // flush is still pending: a command arriving between
                // window-created and renderer-main-ready must not overtake an
                // already-queued earlier command.
                if (pendingThreadCommands.length >= PENDING_THREAD_COMMAND_LIMIT) {
                  pendingThreadCommands.shift();
                  captureMainException(
                    new Error("Overflowed the zero-window remote thread command queue."),
                    { "poracode.feature_area": "remote-access" },
                  );
                }
                pendingThreadCommands.push(request.payload);
                return true;
              }
              window.webContents.send(IPC_EVENT_CHANNELS.remoteThreadCommand, request.payload);
              return true;
            }
            case "open-thread":
              openThreadFromTray(request.payload.threadId);
              return true;
            case "notify-user":
              return showOsNotification(request.payload, () => mainWindow);
            case "check-for-update":
              return autoUpdaterController.checkForUpdate();
            case "install-update":
              autoUpdaterController.installUpdate();
              return null;
            case "browser-state":
              return (
                remoteBrowserGateway?.state() ?? Promise.reject(new Error("Browser unavailable."))
              );
            case "browser-command":
              return (
                remoteBrowserGateway?.command(request.payload) ??
                Promise.reject(new Error("Browser unavailable."))
              );
            case "browser-input":
              return (
                remoteBrowserGateway?.dispatchInput(request.payload) ??
                Promise.reject(new Error("Browser unavailable."))
              );
            case "browser-watch-start":
              if (!remoteBrowserGateway) throw new Error("Browser unavailable.");
              stopRemoteBrowserWatch ??= remoteBrowserGateway.watch({
                onFrame: (frame) => backendHost.publishBrowserEvent({ type: "frame", ...frame }),
                onState: (state) => backendHost.publishBrowserEvent({ type: "state", state }),
                onStatus: (status) => backendHost.publishBrowserEvent({ type: "status", status }),
              });
              return null;
            case "browser-watch-stop":
              stopRemoteBrowserWatch?.();
              stopRemoteBrowserWatch = null;
              return null;
            case "browser-refresh":
              remoteBrowserGateway?.refresh();
              return null;
          }
        },
        onNativeEvent: (event) => {
          switch (event.type) {
            case "database-projection-changed":
              void Promise.all([
                backendHost.callDatabase("dbGetProjects", {}),
                backendHost.callDatabase("dbGetThreads", {}),
              ])
                .then(([projects, threads]) => {
                  trayProjects = projects;
                  trayThreads = threads;
                  tray?.refreshMenu();
                })
                .catch((error) => {
                  // The host can exit mid-refresh during shutdown; report
                  // instead of surfacing an unhandled rejection.
                  captureMainException(error, { "poracode.feature_area": "tray" });
                });
              return;
            case "shared-settings-changed":
              updatePowerSaveBlocker();
              handleSharedSettingsChanged(event.settings);
              mainWindow?.webContents.send(
                IPC_EVENT_CHANNELS.sharedSettingsChanged,
                event.settings,
              );
              return;
            case "remote-access-pairing-changed":
              mainWindow?.webContents.send(
                IPC_EVENT_CHANNELS.remoteAccessPairingChanged,
                event.info,
              );
              return;
            case "projects-changed":
              mainWindow?.webContents.send(IPC_EVENT_CHANNELS.projectStateChanged, {
                projects: event.projects,
              });
              return;
            case "pr-watch-status":
              mainWindow?.webContents.send(IPC_EVENT_CHANNELS.prWatchStatus, event.event);
              return;
            case "pr-watch-merged":
              mainWindow?.webContents.send(IPC_EVENT_CHANNELS.prWatchMerged, event.event);
              return;
            case "git-state-changed":
              mainWindow?.webContents.send(IPC_EVENT_CHANNELS.gitStateChanged, event.patch);
              return;
            case "user-notification": {
              const window = mainWindow;
              if (window && !window.isDestroyed()) {
                // Renderer surface (localized Web Notification + toast + sound).
                window.webContents.send(IPC_EVENT_CHANNELS.userNotification, event.notification);
                return;
              }
              // Zero-window desktop fallback: nothing else would show, so main
              // raises the OS notification itself (click reopens the thread).
              showUserNotificationFallback(event.notification, () => mainWindow);
              return;
            }
          }
        },
        onRendererStreamInfo: (info) => {
          backendRendererStreamInfo = info;
          mainWindow?.webContents.send(IPC_EVENT_CHANNELS.backendRendererStreamChanged, info);
          quickComposerWindow?.webContents.send(
            IPC_EVENT_CHANNELS.backendRendererStreamChanged,
            info,
          );
          browserExtractWindow?.webContents.send(
            IPC_EVENT_CHANNELS.backendRendererStreamChanged,
            info,
          );
        },
      });
      performanceDiagnostics?.observeIpcQueue("main-to-backend", () =>
        backendHost.getQueueDiagnostics(),
      );
      clearRendererEventInterests = (senderId?: number) => {
        if (senderId === undefined) {
          rendererEventInterests.releaseAll();
        } else {
          rendererEventInterests.release(senderId);
        }
      };
      backendHostClient = backendHost;
      supervisorClient = backendHost;
      const shellState = new BackendStateStore(backendHost);
      backendRendererStreamInfo = await backendHost.getRendererStreamInfo();
      await shellState.preload([
        "window-bounds",
        "browser-extract-window-bounds",
        "browser-panel-tabs-v1",
        "browser-history-v1",
        "browser-bookmarks-v1",
        "browser-bookmark-bar-visible-v1",
      ]);
      backendStateStore = shellState;
      ipcMain.handle(
        IPC_WINDOW_CHANNELS.backendRendererStreamInfo,
        () => backendRendererStreamInfo,
      );
      // Managed-local path holds no external owner: the renderer bootstrap
      // treats absence (or a rejected invoke on older builds) as managed.
      ipcMain.handle(IPC_WINDOW_CHANNELS.standaloneAttachInfo, () => null);
      ipcMain.handle(IPC_WINDOW_CHANNELS.rendererStreamOwnershipGrant, (event) => {
        // The window identity comes from the IPC event, never from the
        // renderer: a caller can only ever receive the binding minted for its
        // own webContents. The wiring mints the identity, registers its
        // release hook, and republishes the table before the reply; a bind
        // that races the sync is rejected safely and retried once by the
        // renderer transport.
        return rendererEventInterests.grantFor(event.sender);
      });
      autoUpdaterController = createAutoUpdaterController(
        (status) => {
          mainWindow?.webContents.send(IPC_EVENT_CHANNELS.updateStatus, status);
          void backendHost.callService("updateStatusChanged", {
            status: status as import("@/shared/remote").RemoteHostUpdateStatus,
          });
        },
        channel,
        isDev,
        captureMainException,
        () => {
          isQuitting = true;
        },
      );

      browserPanelManager = new BrowserPanelManager(paths, browserUserAgent, shellState, {
        isExtracted: () => browserExtractWindow !== null && !browserExtractWindow.isDestroyed(),
        focusExtractedWindow: focusBrowserExtractWindow,
      });
      remoteBrowserGateway = new RemoteBrowserGateway(() => browserPanelManager);
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
      chromeBridgeServer.start().catch((err) => {
        console.error("[poracode] chrome bridge server failed to start:", err);
      });
      const computerUseHelperRoot = app.isPackaged
        ? join(process.resourcesPath, "computer-use-helper")
        : join(
            __dirname,
            "..",
            "..",
            "resources",
            isDev ? "computer-use-helper-dev" : "computer-use-helper",
          );
      // Windows and macOS keep a legacy in-process driver, so they stay
      // supported even without a staged helper. Everywhere else the helper is
      // the only backend: with no binary for this platform/arch the ingress
      // would advertise tools that all fail and would still inject a token into
      // every agent launch, so skip it entirely and let resolveExtraEnv yield
      // nothing because getInfo() stays null.
      const computerUseSupported =
        process.platform === "win32" ||
        process.platform === "darwin" ||
        resolveComputerUseHelperBinaryPath(computerUseHelperRoot) !== null;
      let computerUseMcpInfoReady: Promise<ComputerUseMcpIngressInfo | null> =
        Promise.resolve(null);
      if (computerUseSupported) {
        computerUseDesktopOverlay = new ComputerUseDesktopOverlay({
          onActivityState: (state) => {
            computerUseWakeLock.setSessionActive(state.level !== "hidden");
          },
          onExit: (threadIds) => {
            computerUseMcpIngress?.interruptActiveActions(threadIds);
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
          driverOptions: {
            helperRootDir: computerUseHelperRoot,
            stateDir: join(app.getPath("userData"), "computer-use"),
            warn: (message) => console.warn(`[poracode] ${message}`),
          },
          onActivity: (event) => computerUseDesktopOverlay?.setActivity(event),
          isDisplayKeptAwake: () => computerUseWakeLock.isHeld(),
        });
        computerUseMcpInfoReady = computerUseMcpIngress.start().catch((err) => {
          console.error("[poracode] computer use MCP ingress failed to start:", err);
          return null;
        });
      }

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

      // Off-main remote HTTP bridge (V4 F8): one lazily forked utility process
      // performs client outbound HTTP. Main owns admission, window/frame
      // identity, lifecycle, and the per-request port handoff, so response
      // bodies never cross main.
      const remoteHttpBridgeSupervisor = new RemoteHttpBridgeSupervisor({
        utilityPath: join(__dirname, "remoteHttpBridge.cjs"),
        isPackaged: app.isPackaged,
        ...(process.env.PORACODE_REMOTE_HTTP_BRIDGE_DEBUG === "1"
          ? { log: (message: string) => console.log(message) }
          : {}),
      });
      registerRemoteHttpBridgeIpc({ supervisor: remoteHttpBridgeSupervisor });

      quickComposerLifecycle = new QuickComposerLifecycle(
        createQuickComposerLifecycleHost((showOnReady) => ensureMainWindow(showOnReady)),
      );

      registerIpcHandlers({
        localHandlers: createLocalIpcHandlers({
          getMainWindow: () => mainWindow,
          getBrowserPanelManager: () => browserPanelManager,
          sshConnectionManager,
          requirePoracodePaths,
          legacyElectronUserDataDir,
          ...(legacyBaseDirOverride ? { legacyBaseDir: legacyBaseDirOverride } : {}),
          updatePowerSaveBlocker,
          autoUpdater: autoUpdaterController,
          onKeybindingsChanged: (file) => quickComposerShortcutManager?.apply(file),
          setGlobalShortcutsSuspended: (suspended) => globalShortcut.setSuspended(suspended),
          setRendererEventInterests: async (interests, sender) => {
            // Every registered window is a desktop bulk consumer until its
            // direct stream binds the grant; the wiring mints identity and
            // generation before publishing interests and republishes the
            // per-window table even when this window's slice does not move the
            // merged union (a window whose transport has never connected still
            // holds the IPC fallback open).
            rendererEventInterests.setInterests(sender ?? null, {
              terminalThreadIds: interests.terminalThreadIds,
              runtimeThreadIds: interests.runtimeThreadIds,
              allRuntimeEvents: false,
            });
          },
          extractBrowserToWindow,
          injectBrowserToMain,
          requestRelaunch: () => {
            isQuitting = true;
            app.relaunch();
            app.quit();
          },
          database: backendHost,
          backendServices: backendHost,
          revertCheckpoint: (input) => backendHost.revertCheckpoint(input),
        }),
        callSupervisor: (name, payload, originWindowId) =>
          supervisorClient.call(name, payload, originWindowId),
      });

      ipcMain.handle(IPC_WINDOW_CHANNELS.quickComposerSubmit, (event, payload: unknown) => {
        const overlay = quickComposerWindowFor(event);
        if (!overlay) return;
        quickComposerLifecycle?.handleSubmit(overlay, quickComposerSubmissionSchema.parse(payload));
      });
      ipcMain.handle(IPC_WINDOW_CHANNELS.quickComposerDismiss, (event) => {
        const overlay = quickComposerWindowFor(event);
        if (overlay) finishQuickComposerDismiss(overlay);
      });
      ipcMain.handle(IPC_WINDOW_CHANNELS.quickComposerPickFiles, async (event) => {
        const overlay = quickComposerWindowFor(event);
        if (!overlay || !quickComposerLifecycle) return null;
        return quickComposerLifecycle.handlePickFiles(overlay);
      });
      ipcMain.handle(IPC_WINDOW_CHANNELS.quickComposerMainReady, (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window || window !== mainWindow || window.isDestroyed()) return;
        quickComposerLifecycle?.handleMainReady();
        flushTrayThreadOpen();
        flushPendingThreadCommands();
      });
      ipcMain.handle(IPC_WINDOW_CHANNELS.rendererReload, (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window) requestTrackedRendererReload(window);
      });

      const initialMainWindow = ensureMainWindow(showMainWindowOnReady);

      registerSmokeNativeControls({
        ipcMain,
        isDev,
        isPackaged: app.isPackaged,
        mockAgents: process.env.PORACODE_MOCK_AGENTS === "1",
        getMainWebContents: () => mainWindow?.webContents ?? null,
        toggleQuickComposer: toggleQuickComposerWindow,
        closeMainWindow: () => mainWindow?.close(),
        quitApp: () => app.quit(),
        inspectQuickComposer: () =>
          quickComposerWindow && !quickComposerWindow.isDestroyed()
            ? { visible: quickComposerWindow.isVisible(), focused: quickComposerWindow.isFocused() }
            : null,
      });

      tray = createTray({
        channel,
        appName: getAppName(channel, isDev),
        getProjects: () => trayProjects,
        getThreads: () => trayThreads,
        onOpenThread: openThreadFromTray,
        onShow: () => showAndFocusWindow(ensureMainWindow()),
        onQuickComposer: toggleQuickComposerWindow,
        onQuit: () => {
          isQuitting = true;
          app.quit();
        },
      });
      tray.setQuickComposerShortcut(quickComposerShortcutManager.active[0] ?? null);
      [trayProjects, trayThreads] = await Promise.all([
        backendHost.callDatabase("dbGetProjects", {}),
        backendHost.callDatabase("dbGetThreads", {}),
      ]);
      tray.refreshMenu();

      await jobObjectReady;

      const hookDebugOn =
        Boolean(process.env.PORACODE_HOOK_DEBUG) && process.env.PORACODE_HOOK_DEBUG !== "0";
      if (hookDebugOn) {
        console.log(
          "[poracode] PORACODE_HOOK_DEBUG is on — watch for [supervisor] hook-debug lines (HookIngress, WSL bridge, L1/L2 spawn, envelopes).",
        );
      }

      await Promise.all([mcpInfoReady, chromeMcpReady, computerUseMcpInfoReady]);
      await backendHost.startSupervisor();
      desktopOwnerLease?.setPhase("ready");
      if (desktopOwnerLease) {
        // Desktop-owner publication (S1.1): discovery + authenticated
        // describe for the shared control surface, leased as kind "desktop".
        // Disposed in before-quit below; HostControlServer.dispose removes
        // discovery only after connections and admitted work have joined.
        desktopHostControlServer = startDesktopHostControl({
          lease: desktopOwnerLease,
          reportError: (error) =>
            captureMainException(error, { "poracode.feature_area": "host-control" }),
        });
        // Same lease, same lifetime as the control surface above: the offer
        // file lives in the owned profile root and is retired on dispose.
        hostCredentialAdoption = new HostCredentialAdoptionService({
          lease: desktopOwnerLease,
          unseal: async (sealedKey) => {
            // P3: refuse on the latched once-per-launch verdict instead of
            // attempting a decrypt the latched-off OS store cannot serve.
            if (safeStorageHealth().kind !== "healthy") {
              throw new Error(
                "OS-backed secret storage is unavailable this launch; credential adoption needs a relaunch.",
              );
            }
            return safeStorage.decryptString(Buffer.from(sealedKey, "base64"));
          },
          reportError: (error) =>
            captureMainException(error, { "poracode.feature_area": "key-adoption" }),
        });
        void hostCredentialAdoption.start().catch((error) => {
          captureMainException(error, { "poracode.feature_area": "key-adoption" });
          void hostCredentialAdoption?.dispose().catch(() => undefined);
          hostCredentialAdoption = null;
        });
      }

      updatePowerSaveBlocker();

      initialMainWindow.once("ready-to-show", () => {
        setTimeout(() => {
          const attachmentPaths = requirePoracodePaths();
          void backendHost
            .callDatabase("dbGetThreads", {})
            .then((threads) =>
              cleanupOrphanedAttachments(
                attachmentPaths.attachmentsDir,
                threads.map((thread) => thread.id),
              ),
            )
            .catch((error) => {
              // Same shutdown-race shape as the tray refresh above.
              captureMainException(error, { "poracode.feature_area": "attachments-cleanup" });
            });
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
            void backendHost.restartSupervisor().catch((error) => {
              captureMainException(error, { "poracode.feature_area": "backend-host" });
            });
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

      let quitCleanupStarted = false;
      app.on("before-quit", (event) => {
        isQuitting = true;
        if (quitCleanupStarted) return;
        quitCleanupStarted = true;
        event.preventDefault();
        if (mainWindow && !mainWindow.isDestroyed()) {
          saveWindowBounds(mainWindow, shellState, "window-bounds");
        }
        quickComposerShortcutManager?.dispose();
        quickComposerShortcutManager = null;
        quickComposerLifecycle?.dispose();
        const browserMcpToClose = browserMcpIngress;
        browserMcpIngress = null;
        const computerUseToClose = computerUseMcpIngress;
        computerUseMcpIngress = null;
        computerUseDesktopOverlay?.dispose();
        computerUseDesktopOverlay = null;
        computerUseWakeLock.dispose();
        const chromeMcpToClose = chromeMcpIngress;
        chromeMcpIngress = null;
        const chromeBridgeToClose = chromeBridgeServer;
        chromeBridgeServer = null;
        const ingressDispose = joinRuntimeShutdown(
          [
            () => browserMcpToClose?.dispose(),
            () => computerUseToClose?.dispose(),
            () => chromeMcpToClose?.dispose(),
            () => chromeBridgeToClose?.dispose(),
          ],
          "Main ingress shutdown did not complete cleanly.",
        );
        browserExtractWindow?.close();
        browserExtractWindow = null;
        quickComposerWindow?.close();
        quickComposerWindow = null;
        browserPanelManager?.dispose();
        browserPanelManager = null;
        stopRemoteBrowserWatch?.();
        stopRemoteBrowserWatch = null;
        remoteBrowserGateway?.dispose();
        remoteBrowserGateway = null;
        sleepInhibitor.dispose();
        tray?.destroy();
        tray = null;
        // Capture before the join list runs: dispose joins control connections
        // and admitted work, removes discovery (join-before-remove), and must
        // complete before will-quit releases the owner lease. The adoption
        // service joins its loopback listener and removes its offer file.
        const controlToDispose = desktopHostControlServer;
        desktopHostControlServer = null;
        const adoptionToDispose = hostCredentialAdoption;
        hostCredentialAdoption = null;
        const finishQuit = async () => {
          windowsJobObjectManager?.dispose();
          windowsJobObjectManager = null;
          await performanceDiagnostics?.stop();
          app.quit();
        };
        const cleanup = joinRuntimeShutdown(
          [
            () => ingressDispose,
            () => controlToDispose?.dispose(),
            () => adoptionToDispose?.dispose(),
            () =>
              sshConnectionManager.dispose().catch((error) => {
                captureMainException(error, { "poracode.feature_area": "ssh" });
              }),
            () => shellState.close(),
            () => backendHost.disposeAsync({ timeoutMs: APP_QUIT_CLEANUP_TIMEOUT_MS }),
          ],
          "Main shutdown did not complete cleanly.",
        ).catch((error) => {
          captureMainException(error, { "poracode.feature_area": "main-shutdown" });
        });
        void raceWithTimeout(cleanup, APP_QUIT_CLEANUP_TIMEOUT_MS).then(finishQuit, finishQuit);
      });
    })
    .catch((error: unknown) => {
      console.error("[poracode] failed to initialize:", error);
      captureMainException(error, { "poracode.feature_area": "main-initialization" });
      app.quit();
    });
}

app.on("will-quit", () => {
  ipcMain.removeHandler(IPC_WINDOW_CHANNELS.backendRendererStreamInfo);
  backendHostClient?.dispose();
  backendHostClient = null;
  backendStateStore = null;
  backendRendererStreamInfo = null;
  desktopOwnerLease?.release();
  desktopOwnerLease = null;
});

app.on("window-all-closed", () => {
  if (process.platform === "darwin" || tray?.available) return;
  app.quit();
});
