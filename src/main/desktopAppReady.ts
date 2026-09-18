// Managed desktop startup after app.whenReady(), including the deferred
// attach-vs-managed decision.
import { watch } from "node:fs";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  safeStorage,
  session as electronSession,
} from "electron";
import { BROWSER_SESSION_PARTITION } from "@/shared/browserPartition";
import type { Project, Thread } from "@/shared/contracts";
import { cleanupOrphanedAttachments, preparePoracodeDataRoot } from "./poracodeData";
import { createLocalIpcHandlers } from "./ipc/localHandlers";
import { registerIpcHandlers } from "./ipc/registerHandlers";
import { RemoteHttpBridgeSupervisor } from "./remoteHttp/RemoteHttpBridgeSupervisor";
import { registerRemoteHttpBridgeIpc } from "./remoteHttp/registerRemoteHttpBridgeIpc";
import { shouldPreventSystemSleep } from "./sleepPolicy";
import { installLocalFileProtocolHandler } from "./attachments/localFiles";
import {
  BrowserMcpIngress,
  BrowserPanelManager,
  ChromeBridgeServer,
  ChromeMcpIngress,
  installPickerProtocolHandler,
} from "./browser";
import { startUsageLoginCookieMirror } from "./usageLogin/UsageLoginCookieMirror";
import {
  ComputerUseDesktopOverlay,
  ComputerUseMcpIngress,
  type ComputerUseMcpIngressInfo,
  resolveComputerUseHelperBinaryPath,
} from "./computer-use";
import { createAutoUpdaterController } from "./updates/autoUpdater";
import { showOsNotification, showUserNotificationFallback } from "./osNotifications";
import { saveWindowBounds } from "./window/createMainWindow";
import { requestTrackedRendererReload } from "./window/windowHardening";
import { QuickComposerLifecycle } from "./window/quickComposerLifecycle";
import { showAndFocusWindow } from "./window/showAndFocusWindow";
import { createTray } from "./tray";
import { readKeybindingsFile } from "./keybindingsFile";
import { QuickComposerShortcutManager } from "./quickComposerShortcut";
import { shouldStartMinimized, syncWindowsStartupRegistration } from "./startupSettings";
import { safeStorageHealth } from "./safeStorageHealth";
import { getAppName } from "@/shared/appName";
import { productNameFor } from "@/shared/channel";
import {
  IPC_EVENT_CHANNELS,
  IPC_WINDOW_CHANNELS,
  quickComposerSubmissionSchema,
  type SupervisorEvent,
} from "@/shared/ipc";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import { toError } from "@/shared/errorMessage";
import { readSharedSettingsFile } from "./sharedSettingsFile";
import { WindowsJobObjectManager } from "./windowsJobObject";
import { captureMainException } from "./diagnostics/sentry";
import { configureSecretStorageKey } from "@/shared/secretStorage";
import { readOrCreateSafeStorageSecretKey } from "./secretStorageKey";
import { SshConnectionManager } from "./ssh/SshConnectionManager";
import { refreshMacDockIcon } from "./macDockIcon";
import { repairLegacyMacAppPath } from "./macAppPathMigration";
import { APP_QUIT_CLEANUP_TIMEOUT_MS, raceWithTimeout } from "./appQuitCleanup";
import { BackendHostClient } from "./backend/BackendHostClient";
import { buildDesktopBackendInitialize } from "./backend/desktopBackendInitialize";
import { BackendStateStore } from "./backend/BackendStateStore";
import { RendererEventInterestsWiring } from "./backend/rendererEventInterestsWiring";
import { createRendererEventDispatcher } from "./backend/rendererEventDispatch";
import { resolveDeliveryTargetWindow } from "./backend/rendererDeliveryTable";
import { migrateLegacyDataOutOfProcess } from "./legacyMigrationClient";
import { RemoteBrowserGateway } from "./remote/RemoteBrowserGateway";
import { registerSmokeNativeControls } from "./testing/smokeNativeControls";
import { joinRuntimeShutdown } from "@/backend/joinRuntimeShutdown";
import { HostCredentialAdoptionService } from "@/backend/ownership/nativeSecretKey";
import {
  buildStandaloneAttachInfoForRenderer,
  createStandaloneAttachSession,
  decideDeferredStandaloneAttach,
  describeAttachRefusal,
} from "./backend/standaloneAttachBootstrap";
import { admitDesktopManagedOwner } from "./backend/desktopOwnerAdmission";
import { startDesktopHostControl } from "./backend/desktopHostControl";
import { startStandaloneAttachMode } from "./standaloneAttachMode";
import {
  PENDING_THREAD_COMMAND_LIMIT,
  channel,
  desktopApp,
  isDev,
  legacyBaseDirOverride,
  legacyElectronUserDataDir,
  preserveLegacySafeStorageIdentity,
  requirePoracodePaths,
} from "./desktopAppState";
import {
  createQuickComposerLifecycleHost,
  ensureMainWindow,
  extractBrowserToWindow,
  finishQuickComposerDismiss,
  flushPendingThreadCommands,
  flushTrayThreadOpen,
  focusBrowserExtractWindow,
  forwardAgentStatusEventToQuickComposer,
  injectBrowserToMain,
  openThreadFromTray,
  quickComposerWindowFor,
  toggleQuickComposerWindow,
} from "./desktopAppWindows";

// setLoginItemSettings writes the HKCU Run registry key on Windows; skip it
// when launchAtStartup hasn't changed so routine settings saves stay cheap.
let lastAppliedLaunchAtStartup: boolean | null = null;

function primeBrowserAllowFlags(settings?: SharedSettings): void {
  if (!desktopApp.poracodePaths) return;
  let allowEval = false;
  let allowDataAccess = false;
  try {
    const s = settings ?? readSharedSettingsFile(desktopApp.poracodePaths.settingsPath);
    allowEval = s.browser?.allowEval === true;
    allowDataAccess = s.browser?.allowDataAccess === true;
  } catch {
    allowEval = false;
    allowDataAccess = false;
  }
  // The embedded browser and the external Chrome bridge share the same
  // eval / data-access gates from browser settings.
  desktopApp.browserMcpIngress?.setAllowEval(allowEval);
  desktopApp.browserMcpIngress?.setAllowDataAccess(allowDataAccess);
  desktopApp.chromeMcpIngress?.setAllowEval(allowEval);
  desktopApp.chromeMcpIngress?.setAllowDataAccess(allowDataAccess);
}

function syncStartupSettings(settings?: SharedSettings): void {
  if (!desktopApp.poracodePaths) return;
  try {
    const s = settings ?? readSharedSettingsFile(desktopApp.poracodePaths.settingsPath);
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

function updatePowerSaveBlocker(): void {
  if (!desktopApp.poracodePaths) {
    desktopApp.sleepInhibitor.setActive(desktopApp.workingThreads.size > 0);
    desktopApp.computerUseWakeLock.setEnabled(defaultSharedSettings.computerUseKeepAwake);
    return;
  }
  const settings = readSharedSettingsFile(desktopApp.poracodePaths.settingsPath);
  desktopApp.sleepInhibitor.setActive(
    shouldPreventSystemSleep(settings, desktopApp.workingThreads.size),
  );
  // Every settings write funnels through here, so toggling the setting off
  // releases an already-held wake lock immediately.
  desktopApp.computerUseWakeLock.setEnabled(settings.computerUseKeepAwake);
}

function handleSupervisorEventForSleep(event: SupervisorEvent): void {
  if (event.type === "thread-state") {
    const active = event.status === "working" || event.status === "launching";
    if (active) {
      desktopApp.workingThreads.add(event.threadId);
    } else {
      desktopApp.workingThreads.delete(event.threadId);
    }
    updatePowerSaveBlocker();
    return;
  }
  if (event.type === "thread-exited") {
    desktopApp.workingThreads.delete(event.threadId);
    updatePowerSaveBlocker();
  }
}

export async function startDesktopApp(): Promise<void> {
  if (desktopApp.deferredStandaloneProbe) {
    const outcome = await decideDeferredStandaloneAttach(desktopApp.deferredStandaloneProbe);
    if (outcome.kind === "refuse") throw new Error(describeAttachRefusal(outcome));
    if (outcome.kind === "attach") {
      desktopApp.standaloneAttachInfo = await buildStandaloneAttachInfoForRenderer({
        endpoint: outcome.endpoint,
        ownerGeneration: outcome.ownerGeneration,
        profileNamespace: outcome.profileNamespace,
        dataRoot: outcome.dataRoot,
        controlPaths: outcome.controlPaths,
      });
      // Re-verification anchor for the whole attach session: every
      // renderer (re)bootstrap re-runs the authenticated describe with a
      // generation check before the payload is served again.
      desktopApp.standaloneAttachSession = createStandaloneAttachSession({
        controlPaths: outcome.controlPaths,
        mode: outcome.description.mode,
        info: desktopApp.standaloneAttachInfo,
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
      desktopApp.desktopOwnerLease = await admitDesktopManagedOwner({
        baseDir: outcome.baseDir,
        channel,
        electronUserDataDir,
        ...(legacyElectronUserDataDir ? { legacyElectronUserDataDir } : {}),
        ...(legacyBaseDirOverride ? { legacyBaseDir: legacyBaseDirOverride } : {}),
        allowCustomDataRoot: app.isPackaged,
      });
    } catch (error) {
      desktopApp.desktopOwnerAcquisitionError = toError(error);
      console.error("[poracode] failed to acquire the desktop host owner:", error);
    }
    if (!desktopApp.desktopOwnerAcquisitionError) {
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
          console.info(`[migrate] imported all available Lightcode data into ${outcome.baseDir}`);
        }
      } catch (error) {
        console.warn(`[migrate] failed to import Lightcode data into ${outcome.baseDir}:`, error);
      }
      desktopApp.poracodePaths = preparePoracodeDataRoot(outcome.baseDir);
    }
  }
  if (desktopApp.desktopOwnerAcquisitionError) throw desktopApp.desktopOwnerAcquisitionError;
  if (preserveLegacySafeStorageIdentity) app.setName(productNameFor(channel));
  repairLegacyMacAppPath(channel, { isPackaged: app.isPackaged });
  refreshMacDockIcon();
  Menu.setApplicationMenu(null);

  installLocalFileProtocolHandler();
  installPickerProtocolHandler();
  // Keep the pre-rebrand partition so browser cookies and sign-ins survive.
  const browserSession = electronSession.fromPartition(BROWSER_SESSION_PARTITION);
  browserSession.setUserAgent(desktopApp.browserUserAgent);

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
    desktopApp.windowsJobObjectManager = manager;
    jobObjectReady = manager.start().catch((error) => {
      console.error(
        "[poracode] Windows Job Object helper unavailable:",
        error instanceof Error ? error.message : String(error),
      );
      captureMainException(error, { "poracode.feature_area": "process-lifecycle" });
      if (desktopApp.windowsJobObjectManager === manager) {
        desktopApp.windowsJobObjectManager = null;
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
      desktopApp.mainWindow && !desktopApp.mainWindow.isDestroyed()
        ? desktopApp.mainWindow.webContents.id
        : null,
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
        desktopApp.mainWindow,
        desktopApp.quickComposerWindow,
        desktopApp.browserExtractWindow,
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
        desktopApp.mainWindow?.webContents.send(IPC_EVENT_CHANNELS.supervisorEvent, event);
      } else {
        desktopApp.mainWindow?.webContents.send(
          IPC_EVENT_CHANNELS.supervisorEvent,
          event,
          rendererSequence,
        );
      }
    },
    applyNativeState: handleSupervisorEventForSleep,
    forwardAgentStatus: forwardAgentStatusEventToQuickComposer,
    quickComposerWindowId: () =>
      desktopApp.quickComposerWindow && !desktopApp.quickComposerWindow.isDestroyed()
        ? desktopApp.quickComposerWindow.webContents.id
        : null,
  });
  const handleBackendReset = (): void => {
    desktopApp.workingThreads.clear();
    updatePowerSaveBlocker();
  };
  const backendHost = new BackendHostClient({
    backendHostPath,
    ...(desktopApp.performanceDiagnostics
      ? { queueDiagnostics: desktopApp.performanceDiagnostics.queueCapture }
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
      const browserInfo = desktopApp.browserMcpIngress?.getInfo();
      if (browserInfo) {
        env.PORACODE_BROWSER_MCP_URL = browserInfo.url;
        env.PORACODE_BROWSER_MCP_TOKEN = browserInfo.token;
      }
      const chromeInfo = desktopApp.chromeMcpIngress?.getInfo();
      if (chromeInfo) {
        env.PORACODE_CHROME_MCP_URL = chromeInfo.url;
        env.PORACODE_CHROME_MCP_TOKEN = chromeInfo.token;
      }
      const computerUseInfo = desktopApp.computerUseMcpIngress?.getInfo();
      if (computerUseInfo) {
        env.PORACODE_COMPUTER_USE_MCP_URL = computerUseInfo.url;
        env.PORACODE_COMPUTER_USE_MCP_TOKEN = computerUseInfo.token;
      }
      return env;
    },
    assignPid: async (pid) => {
      await desktopApp.windowsJobObjectManager?.assignPid(pid);
    },
    reportError: (error, tags) => {
      captureMainException(error, tags);
    },
    onEvent: dispatchBackendSupervisorEvent,
    onSupervisorEventGap: (gap) => {
      // A window whose direct stream is down rebuilds from persisted
      // state on this signal; windows with a healthy stream ignore it.
      for (const window of [
        desktopApp.mainWindow,
        desktopApp.quickComposerWindow,
        desktopApp.browserExtractWindow,
      ]) {
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
        desktopApp.mainWindow,
        desktopApp.quickComposerWindow,
        desktopApp.browserExtractWindow,
      ]);
      window?.webContents.send(IPC_EVENT_CHANNELS.rendererStreamRecovery, barrier);
    },
    onReset: handleBackendReset,
    handleNativeRequest: (request) => {
      switch (request.operation) {
        case "dispatch-thread-command": {
          const window = desktopApp.mainWindow;
          if (!window || window.isDestroyed() || desktopApp.pendingThreadCommands.length > 0) {
            // Zero-window (tray/hidden): queue instead of dropping. The
            // backend currently reports hasRendererWindow:true even with
            // no window (BackendDesktopServices hardcodes it; Lane 1B
            // owns that file), so its callers believe delivery happened —
            // the queue makes that true by flushing on the next ready
            // window (see flushPendingThreadCommands). Also queue while a
            // flush is still pending: a command arriving between
            // window-created and renderer-main-ready must not overtake an
            // already-queued earlier command.
            if (desktopApp.pendingThreadCommands.length >= PENDING_THREAD_COMMAND_LIMIT) {
              desktopApp.pendingThreadCommands.shift();
              captureMainException(
                new Error("Overflowed the zero-window remote thread command queue."),
                { "poracode.feature_area": "remote-access" },
              );
            }
            desktopApp.pendingThreadCommands.push(request.payload);
            return true;
          }
          window.webContents.send(IPC_EVENT_CHANNELS.remoteThreadCommand, request.payload);
          return true;
        }
        case "open-thread":
          openThreadFromTray(request.payload.threadId);
          return true;
        case "notify-user":
          return showOsNotification(request.payload, () => desktopApp.mainWindow);
        case "check-for-update":
          return autoUpdaterController.checkForUpdate();
        case "install-update":
          autoUpdaterController.installUpdate();
          return null;
        case "browser-state":
          return remoteBrowserGateway?.state() ?? Promise.reject(new Error("Browser unavailable."));
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
              desktopApp.tray?.refreshMenu();
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
          desktopApp.mainWindow?.webContents.send(
            IPC_EVENT_CHANNELS.sharedSettingsChanged,
            event.settings,
          );
          return;
        case "remote-access-pairing-changed":
          desktopApp.mainWindow?.webContents.send(
            IPC_EVENT_CHANNELS.remoteAccessPairingChanged,
            event.info,
          );
          return;
        case "projects-changed":
          desktopApp.mainWindow?.webContents.send(IPC_EVENT_CHANNELS.projectStateChanged, {
            projects: event.projects,
          });
          return;
        case "pr-watch-status":
          desktopApp.mainWindow?.webContents.send(IPC_EVENT_CHANNELS.prWatchStatus, event.event);
          return;
        case "pr-watch-merged":
          desktopApp.mainWindow?.webContents.send(IPC_EVENT_CHANNELS.prWatchMerged, event.event);
          return;
        case "git-state-changed":
          desktopApp.mainWindow?.webContents.send(IPC_EVENT_CHANNELS.gitStateChanged, event.patch);
          return;
        case "user-notification": {
          const window = desktopApp.mainWindow;
          if (window && !window.isDestroyed()) {
            // Renderer surface (localized Web Notification + toast + sound).
            window.webContents.send(IPC_EVENT_CHANNELS.userNotification, event.notification);
            return;
          }
          // Zero-window desktop fallback: nothing else would show, so main
          // raises the OS notification itself (click reopens the thread).
          showUserNotificationFallback(event.notification, () => desktopApp.mainWindow);
          return;
        }
      }
    },
    onRendererStreamInfo: (info) => {
      desktopApp.backendRendererStreamInfo = info;
      desktopApp.mainWindow?.webContents.send(
        IPC_EVENT_CHANNELS.backendRendererStreamChanged,
        info,
      );
      desktopApp.quickComposerWindow?.webContents.send(
        IPC_EVENT_CHANNELS.backendRendererStreamChanged,
        info,
      );
      desktopApp.browserExtractWindow?.webContents.send(
        IPC_EVENT_CHANNELS.backendRendererStreamChanged,
        info,
      );
    },
  });
  desktopApp.performanceDiagnostics?.observeIpcQueue("main-to-backend", () =>
    backendHost.getQueueDiagnostics(),
  );
  desktopApp.clearRendererEventInterests = (senderId?: number) => {
    if (senderId === undefined) {
      rendererEventInterests.releaseAll();
    } else {
      rendererEventInterests.release(senderId);
    }
  };
  desktopApp.backendHostClient = backendHost;
  supervisorClient = backendHost;
  const shellState = new BackendStateStore(backendHost);
  desktopApp.backendRendererStreamInfo = await backendHost.getRendererStreamInfo();
  await shellState.preload([
    "window-bounds",
    "browser-extract-window-bounds",
    "browser-panel-tabs-v1",
    "browser-history-v1",
    "browser-bookmarks-v1",
    "browser-bookmark-bar-visible-v1",
  ]);
  desktopApp.backendStateStore = shellState;
  ipcMain.handle(
    IPC_WINDOW_CHANNELS.backendRendererStreamInfo,
    () => desktopApp.backendRendererStreamInfo,
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
      desktopApp.mainWindow?.webContents.send(IPC_EVENT_CHANNELS.updateStatus, status);
      void backendHost.callService("updateStatusChanged", {
        status: status as import("@/shared/remote").RemoteHostUpdateStatus,
      });
    },
    channel,
    isDev,
    captureMainException,
    () => {
      desktopApp.isQuitting = true;
    },
  );

  desktopApp.browserPanelManager = new BrowserPanelManager(
    paths,
    desktopApp.browserUserAgent,
    shellState,
    {
      isExtracted: () =>
        desktopApp.browserExtractWindow !== null && !desktopApp.browserExtractWindow.isDestroyed(),
      focusExtractedWindow: focusBrowserExtractWindow,
    },
  );
  remoteBrowserGateway = new RemoteBrowserGateway(() => desktopApp.browserPanelManager);
  desktopApp.browserMcpIngress = new BrowserMcpIngress();
  desktopApp.browserMcpIngress.setManagerAccessor(() => desktopApp.browserPanelManager);
  // External-Chrome control: a localhost WS bridge the companion extension
  // connects to, plus a `chrome` MCP ingress agents reach the same way as the
  // embedded `browser` server. They live side by side.
  desktopApp.chromeBridgeServer = new ChromeBridgeServer({
    pairingFilePath: join(paths.baseDir, "chrome-bridge.json"),
  });
  desktopApp.chromeMcpIngress = new ChromeMcpIngress();
  desktopApp.chromeMcpIngress.setConnectionAccessor(
    () => desktopApp.chromeBridgeServer?.getConnection() ?? null,
  );
  primeBrowserAllowFlags(initialSettings);
  const mcpInfoReady = desktopApp.browserMcpIngress.start().catch((err) => {
    console.error("[poracode] browser MCP ingress failed to start:", err);
    return null;
  });
  const chromeMcpReady = desktopApp.chromeMcpIngress.start().catch((err) => {
    console.error("[poracode] chrome MCP ingress failed to start:", err);
    return null;
  });
  desktopApp.chromeBridgeServer.start().catch((err) => {
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
  let computerUseMcpInfoReady: Promise<ComputerUseMcpIngressInfo | null> = Promise.resolve(null);
  if (computerUseSupported) {
    desktopApp.computerUseDesktopOverlay = new ComputerUseDesktopOverlay({
      onActivityState: (state) => {
        desktopApp.computerUseWakeLock.setSessionActive(state.level !== "hidden");
      },
      onExit: (threadIds) => {
        desktopApp.computerUseMcpIngress?.interruptActiveActions(threadIds);
        for (const threadId of threadIds) {
          void supervisorClient.call("interruptThread", { threadId }).catch((error) => {
            console.error(`[poracode] failed to interrupt computer-use thread ${threadId}:`, error);
          });
        }
      },
    });
    desktopApp.computerUseMcpIngress = new ComputerUseMcpIngress({
      driverOptions: {
        helperRootDir: computerUseHelperRoot,
        stateDir: join(app.getPath("userData"), "computer-use"),
        warn: (message) => console.warn(`[poracode] ${message}`),
      },
      onActivity: (event) => desktopApp.computerUseDesktopOverlay?.setActivity(event),
      isDisplayKeptAwake: () => desktopApp.computerUseWakeLock.isHeld(),
    });
    computerUseMcpInfoReady = desktopApp.computerUseMcpIngress.start().catch((err) => {
      console.error("[poracode] computer use MCP ingress failed to start:", err);
      return null;
    });
  }

  desktopApp.quickComposerShortcutManager = new QuickComposerShortcutManager(
    globalShortcut,
    process.platform,
    toggleQuickComposerWindow,
    (accelerator) => {
      desktopApp.tray?.setQuickComposerShortcut(accelerator);
      if (accelerator) {
        console.log(`[poracode] registered ${accelerator} for quick composer`);
      }
    },
  );
  try {
    desktopApp.quickComposerShortcutManager.apply(
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

  desktopApp.quickComposerLifecycle = new QuickComposerLifecycle(
    createQuickComposerLifecycleHost((showOnReady) => ensureMainWindow(showOnReady)),
  );

  registerIpcHandlers({
    localHandlers: createLocalIpcHandlers({
      getMainWindow: () => desktopApp.mainWindow,
      getBrowserPanelManager: () => desktopApp.browserPanelManager,
      sshConnectionManager,
      requirePoracodePaths,
      legacyElectronUserDataDir,
      ...(legacyBaseDirOverride ? { legacyBaseDir: legacyBaseDirOverride } : {}),
      updatePowerSaveBlocker,
      autoUpdater: autoUpdaterController,
      onKeybindingsChanged: (file) => desktopApp.quickComposerShortcutManager?.apply(file),
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
        desktopApp.isQuitting = true;
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
    desktopApp.quickComposerLifecycle?.handleSubmit(
      overlay,
      quickComposerSubmissionSchema.parse(payload),
    );
  });
  ipcMain.handle(IPC_WINDOW_CHANNELS.quickComposerDismiss, (event) => {
    const overlay = quickComposerWindowFor(event);
    if (overlay) finishQuickComposerDismiss(overlay);
  });
  ipcMain.handle(IPC_WINDOW_CHANNELS.quickComposerPickFiles, async (event) => {
    const overlay = quickComposerWindowFor(event);
    if (!overlay || !desktopApp.quickComposerLifecycle) return null;
    return desktopApp.quickComposerLifecycle.handlePickFiles(overlay);
  });
  ipcMain.handle(IPC_WINDOW_CHANNELS.quickComposerMainReady, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window !== desktopApp.mainWindow || window.isDestroyed()) return;
    desktopApp.quickComposerLifecycle?.handleMainReady();
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
    getMainWebContents: () => desktopApp.mainWindow?.webContents ?? null,
    toggleQuickComposer: toggleQuickComposerWindow,
    closeMainWindow: () => desktopApp.mainWindow?.close(),
    quitApp: () => app.quit(),
    inspectQuickComposer: () =>
      desktopApp.quickComposerWindow && !desktopApp.quickComposerWindow.isDestroyed()
        ? {
            visible: desktopApp.quickComposerWindow.isVisible(),
            focused: desktopApp.quickComposerWindow.isFocused(),
          }
        : null,
  });

  desktopApp.tray = createTray({
    channel,
    appName: getAppName(channel, isDev),
    getProjects: () => trayProjects,
    getThreads: () => trayThreads,
    onOpenThread: openThreadFromTray,
    onShow: () => showAndFocusWindow(ensureMainWindow()),
    onQuickComposer: toggleQuickComposerWindow,
    onQuit: () => {
      desktopApp.isQuitting = true;
      app.quit();
    },
  });
  desktopApp.tray.setQuickComposerShortcut(
    desktopApp.quickComposerShortcutManager.active[0] ?? null,
  );
  [trayProjects, trayThreads] = await Promise.all([
    backendHost.callDatabase("dbGetProjects", {}),
    backendHost.callDatabase("dbGetThreads", {}),
  ]);
  desktopApp.tray.refreshMenu();

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
  desktopApp.desktopOwnerLease?.setPhase("ready");
  if (desktopApp.desktopOwnerLease) {
    // Desktop-owner publication (S1.1): discovery + authenticated
    // describe for the shared control surface, leased as kind "desktop".
    // Disposed in before-quit below; HostControlServer.dispose removes
    // discovery only after connections and admitted work have joined.
    desktopApp.desktopHostControlServer = startDesktopHostControl({
      lease: desktopApp.desktopOwnerLease,
      reportError: (error) =>
        captureMainException(error, { "poracode.feature_area": "host-control" }),
    });
    // Same lease, same lifetime as the control surface above: the offer
    // file lives in the owned profile root and is retired on dispose.
    desktopApp.hostCredentialAdoption = new HostCredentialAdoptionService({
      lease: desktopApp.desktopOwnerLease,
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
    void desktopApp.hostCredentialAdoption.start().catch((error) => {
      captureMainException(error, { "poracode.feature_area": "key-adoption" });
      void desktopApp.hostCredentialAdoption?.dispose().catch(() => undefined);
      desktopApp.hostCredentialAdoption = null;
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
    if (desktopApp.mainWindow && !desktopApp.mainWindow.isDestroyed()) {
      showAndFocusWindow(desktopApp.mainWindow);
      return;
    }
    ensureMainWindow();
  });

  let quitCleanupStarted = false;
  app.on("before-quit", (event) => {
    desktopApp.isQuitting = true;
    if (quitCleanupStarted) return;
    quitCleanupStarted = true;
    event.preventDefault();
    if (desktopApp.mainWindow && !desktopApp.mainWindow.isDestroyed()) {
      saveWindowBounds(desktopApp.mainWindow, shellState, "window-bounds");
    }
    desktopApp.quickComposerShortcutManager?.dispose();
    desktopApp.quickComposerShortcutManager = null;
    desktopApp.quickComposerLifecycle?.dispose();
    const browserMcpToClose = desktopApp.browserMcpIngress;
    desktopApp.browserMcpIngress = null;
    const computerUseToClose = desktopApp.computerUseMcpIngress;
    desktopApp.computerUseMcpIngress = null;
    desktopApp.computerUseDesktopOverlay?.dispose();
    desktopApp.computerUseDesktopOverlay = null;
    desktopApp.computerUseWakeLock.dispose();
    const chromeMcpToClose = desktopApp.chromeMcpIngress;
    desktopApp.chromeMcpIngress = null;
    const chromeBridgeToClose = desktopApp.chromeBridgeServer;
    desktopApp.chromeBridgeServer = null;
    const ingressDispose = joinRuntimeShutdown(
      [
        () => browserMcpToClose?.dispose(),
        () => computerUseToClose?.dispose(),
        () => chromeMcpToClose?.dispose(),
        () => chromeBridgeToClose?.dispose(),
      ],
      "Main ingress shutdown did not complete cleanly.",
    );
    desktopApp.browserExtractWindow?.close();
    desktopApp.browserExtractWindow = null;
    desktopApp.quickComposerWindow?.close();
    desktopApp.quickComposerWindow = null;
    desktopApp.browserPanelManager?.dispose();
    desktopApp.browserPanelManager = null;
    stopRemoteBrowserWatch?.();
    stopRemoteBrowserWatch = null;
    remoteBrowserGateway?.dispose();
    remoteBrowserGateway = null;
    desktopApp.sleepInhibitor.dispose();
    desktopApp.tray?.destroy();
    desktopApp.tray = null;
    // Capture before the join list runs: dispose joins control connections
    // and admitted work, removes discovery (join-before-remove), and must
    // complete before will-quit releases the owner lease. The adoption
    // service joins its loopback listener and removes its offer file.
    const controlToDispose = desktopApp.desktopHostControlServer;
    desktopApp.desktopHostControlServer = null;
    const adoptionToDispose = desktopApp.hostCredentialAdoption;
    desktopApp.hostCredentialAdoption = null;
    const finishQuit = async () => {
      desktopApp.windowsJobObjectManager?.dispose();
      desktopApp.windowsJobObjectManager = null;
      await desktopApp.performanceDiagnostics?.stop();
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
}
