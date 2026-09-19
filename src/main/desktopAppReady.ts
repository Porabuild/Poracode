// Managed desktop startup after app.whenReady(), including the deferred
// attach-vs-managed decision. The orchestrator only sequences the startup
// seams; each seam lives in its own module (V5 plan 1.1 + 1.4):
//
//   desktopAppAdmission     attach-vs-managed decision, lease, data root
//   desktopAppShell         native shell bootstrap, power/settings reactions
//   desktopAppBackendHost   backend host client + event/native wiring
//   desktopAppHostServices  native-shell services around composeHostServices
//   desktopAppIpc           managed IPC registration
//   desktopAppLifecycle     tray, owner publication, before-quit join
//   hostServices            the shared Electron-free service composition
import { app, globalShortcut, Menu } from "electron";
import { IPC_EVENT_CHANNELS } from "@/shared/ipc";
import { productNameFor } from "@/shared/channel";
import type { RemoteHostUpdateStatus } from "@/shared/remote";
import { RemoteHttpBridgeSupervisor } from "./remoteHttp/RemoteHttpBridgeSupervisor";
import { registerRemoteHttpBridgeIpc } from "./remoteHttp/registerRemoteHttpBridgeIpc";
import { createAutoUpdaterController } from "./updates/autoUpdater";
import { readKeybindingsFile } from "./keybindingsFile";
import { QuickComposerShortcutManager } from "./quickComposerShortcut";
import { repairLegacyMacAppPath } from "./macAppPathMigration";
import { refreshMacDockIcon } from "./macDockIcon";
import {
  channel,
  desktopApp,
  isDev,
  preserveLegacySafeStorageIdentity,
  requirePoracodePaths,
} from "./desktopAppState";
import {
  createQuickComposerLifecycleHost,
  ensureMainWindow,
  toggleQuickComposerWindow,
} from "./desktopAppWindows";
import { admitDesktopStartup } from "./desktopAppAdmission";
import { prepareDesktopNativeShell, updatePowerSaveBlocker } from "./desktopAppShell";
import { buildDesktopBackendInitialize } from "./backend/desktopBackendInitialize";
import {
  createDesktopBackendHost,
  type DesktopBrowserNativeControl,
} from "./desktopAppBackendHost";
import { createDesktopHostServices } from "./desktopAppHostServices";
import { QuickComposerLifecycle } from "./window/quickComposerLifecycle";
import { registerDesktopIpc } from "./desktopAppIpc";
import {
  createDesktopTray,
  publishDesktopOwnerServices,
  registerDesktopAppLifecycle,
} from "./desktopAppLifecycle";
import { captureMainException } from "./diagnostics/sentry";

export async function startDesktopApp(): Promise<void> {
  // Seam 1: authority admission (attach mode returns after its own startup).
  if ((await admitDesktopStartup()).kind === "attached") return;

  if (preserveLegacySafeStorageIdentity) app.setName(productNameFor(channel));
  repairLegacyMacAppPath(channel, { isPackaged: app.isPackaged });
  refreshMacDockIcon();
  Menu.setApplicationMenu(null);

  // Seam 2: native shell bootstrap (protocol handlers, session, job object,
  // secret key, bundled resource directories).
  const shell = prepareDesktopNativeShell();
  const dirs = shell.dirs;

  // The browser-panel control is composed in seam 4, but the backend host's
  // native request handler is built now; requests can only arrive once the
  // supervisor starts, long after the composition below has filled this in.
  let browserControl: DesktopBrowserNativeControl | null = null;
  const requireBrowserControl = (): DesktopBrowserNativeControl => {
    if (!browserControl) throw new Error("Browser unavailable.");
    return browserControl;
  };
  const lazyBrowserControl: DesktopBrowserNativeControl = {
    state: () => requireBrowserControl().state(),
    command: (payload) => requireBrowserControl().command(payload),
    dispatchInput: (payload) => requireBrowserControl().dispatchInput(payload),
    startWatch: (publish) => requireBrowserControl().startWatch(publish),
    stopWatch: () => requireBrowserControl().stopWatch(),
    refresh: () => requireBrowserControl().refresh(),
  };

  // Seam 3: backend host client, renderer event wiring, native handlers.
  // The fence path comes from the admission lease's canonical mapping: the
  // prepared baseDir IS the owned `.host-v1` root since the unification, and
  // re-deriving the mapping from it would refuse the literal owned root.
  const ownerFencePath = desktopApp.desktopOwnerLease?.paths.dataFencePath;
  if (!ownerFencePath) {
    throw new Error("The desktop host owner lease is required before the backend forks.");
  }
  const backend = createDesktopBackendHost({
    backendHostPath: dirs.backendHostPath,
    initialize: buildDesktopBackendInitialize({
      baseDir: shell.paths.baseDir,
      dbPath: shell.paths.dbPath,
      channel,
      settingsPath: shell.paths.settingsPath,
      devServerUrl: process.env.VITE_DEV_SERVER_URL,
      dataFencePath: ownerFencePath,
      supervisor: {
        appVersion: app.getVersion(),
        isDev,
        supervisorPath: dirs.supervisorPath,
        wslHelpersDir: dirs.wslHelpersDir,
        bundledSkillsDir: dirs.bundledSkillsDir,
        bundledPluginsDir: dirs.bundledPluginsDir,
        secretStorageKey: shell.secretStorageKey,
        preferUiResponsiveness: true,
      },
    }),
    // Assigned later in this startup; consumers read it lazily.
    getAutoUpdater: () => autoUpdaterController,
    browser: lazyBrowserControl,
  });
  const backendHost = backend.backendHost;

  const autoUpdaterController = createAutoUpdaterController(
    (status) => {
      desktopApp.mainWindow?.webContents.send(IPC_EVENT_CHANNELS.updateStatus, status);
      void backendHost.callService("updateStatusChanged", {
        status: status as RemoteHostUpdateStatus,
      });
    },
    channel,
    isDev,
    captureMainException,
    () => {
      desktopApp.isQuitting = true;
    },
  );

  await backend.preloadShellState();

  // Seam 4: host services — the SAME composition the standalone server runs,
  // plus the native-shell browser panel and computer-use overlay.
  const hostShell = createDesktopHostServices({
    paths: shell.paths,
    dirs,
    shellState: backend.shellState,
    backendHost,
  });
  browserControl = hostShell.browser;
  const sshConnectionManager = hostShell.services.sshConnectionManager;
  if (!sshConnectionManager) throw new Error("The desktop host always ships SSH environments.");

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
    utilityPath: dirs.remoteHttpBridgePath,
    isPackaged: app.isPackaged,
    ...(process.env.PORACODE_REMOTE_HTTP_BRIDGE_DEBUG === "1"
      ? { log: (message: string) => console.log(message) }
      : {}),
  });
  registerRemoteHttpBridgeIpc({ supervisor: remoteHttpBridgeSupervisor });

  desktopApp.quickComposerLifecycle = new QuickComposerLifecycle(
    createQuickComposerLifecycleHost((showOnReady) => ensureMainWindow(showOnReady)),
  );

  registerDesktopIpc({
    backendHost,
    rendererEventInterests: backend.rendererEventInterests,
    sshConnectionManager,
    autoUpdater: autoUpdaterController,
    quickComposerShortcutManager: desktopApp.quickComposerShortcutManager,
    quickComposerLifecycle: desktopApp.quickComposerLifecycle,
  });

  const initialMainWindow = ensureMainWindow(shell.showMainWindowOnReady);

  await createDesktopTray(backend.trayFeed);

  await shell.jobObjectReady;

  const hookDebugOn =
    Boolean(process.env.PORACODE_HOOK_DEBUG) && process.env.PORACODE_HOOK_DEBUG !== "0";
  if (hookDebugOn) {
    console.log(
      "[poracode] PORACODE_HOOK_DEBUG is on — watch for [supervisor] hook-debug lines (HookIngress, WSL bridge, L1/L2 spawn, envelopes).",
    );
  }

  // Settle the composed MCP ingress starts before the supervisor can fork,
  // so the launch env carries their URL/token pairs (degrades like before).
  await hostShell.services.start();
  await backendHost.startSupervisor();
  desktopApp.desktopOwnerLease?.setPhase("ready");
  publishDesktopOwnerServices();

  updatePowerSaveBlocker();

  registerDesktopAppLifecycle({
    backendHost,
    shellState: backend.shellState,
    sshConnectionManager,
    disposeBrowserGateway: hostShell.disposeBrowserGateway,
    autoUpdater: autoUpdaterController,
    initialMainWindow,
    supervisorPath: dirs.supervisorPath,
  });
}
