// Standalone attach Electron startup: client of an already-running headless
// owner. Does not acquire the lease, fork a backend, migrate, or init keys.
import { join } from "node:path";
import { app, globalShortcut, ipcMain, Menu } from "electron";
import { getAppName } from "@/shared/appName";
import { IPC_WINDOW_CHANNELS } from "@/shared/ipc";
import { saveWindowBounds } from "./window/createMainWindow";
import { QuickComposerLifecycle } from "./window/quickComposerLifecycle";
import { showAndFocusWindow } from "./window/showAndFocusWindow";
import { createTray } from "./tray";
import { readKeybindingsFile } from "./keybindingsFile";
import { QuickComposerShortcutManager } from "./quickComposerShortcut";
import { captureMainException } from "./diagnostics/sentry";
import { refreshMacDockIcon } from "./macDockIcon";
import { repairLegacyMacAppPath } from "./macAppPathMigration";
import { installLocalFileProtocolHandler } from "./attachments/localFiles";
import { installPickerProtocolHandler } from "./browser";
import { RemoteHttpBridgeSupervisor } from "./remoteHttp/RemoteHttpBridgeSupervisor";
import { registerRemoteHttpBridgeIpc } from "./remoteHttp/registerRemoteHttpBridgeIpc";
import { registerSmokeNativeControls } from "./testing/smokeNativeControls";
import { createEphemeralShellState } from "./backend/standaloneAttachBootstrap";
import { registerStandaloneAttachIpc } from "./backend/standaloneAttachIpc";
import { channel, desktopApp, isDev } from "./desktopAppState";
import {
  createQuickComposerLifecycleHost,
  ensureMainWindow,
  toggleQuickComposerWindow,
} from "./desktopAppWindows";

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
export async function startStandaloneAttachMode(): Promise<void> {
  repairLegacyMacAppPath(channel, { isPackaged: app.isPackaged });
  refreshMacDockIcon();
  Menu.setApplicationMenu(null);

  installLocalFileProtocolHandler();
  installPickerProtocolHandler();

  const shellState = createEphemeralShellState();
  desktopApp.standaloneAttachShellState = shellState;

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
    if (!desktopApp.standaloneAttachSession) {
      throw new Error("Standalone attach session is not anchored.");
    }
    await desktopApp.standaloneAttachSession.reverify();
    return desktopApp.standaloneAttachInfo;
  });
  ipcMain.handle(IPC_WINDOW_CHANNELS.backendRendererStreamInfo, () => null);
  ipcMain.handle(IPC_WINDOW_CHANNELS.rendererStreamOwnershipGrant, () => null);

  // Device-owned locals with real implementations; everything server-owned
  // loud-rejects (no local backend exists to serve it). Must run before the
  // main window is created so boot-time procedures resolve.
  const standaloneAttachInfo = desktopApp.standaloneAttachInfo;
  if (!standaloneAttachInfo) {
    throw new Error("Standalone attach started without owner information.");
  }
  // The real quick-composer device lifecycle on the ephemeral shell state:
  // submit queues while main is loading/closed and flushes on ready, dismiss
  // is graceful with main reveal, and recreation never touches managed
  // backend/shell paths.
  desktopApp.quickComposerLifecycle = new QuickComposerLifecycle(
    createQuickComposerLifecycleHost((showOnReady) => ensureMainWindow(showOnReady, shellState)),
  );
  const attachQuickComposer = desktopApp.quickComposerLifecycle;
  registerStandaloneAttachIpc({
    getMainWindow: () => desktopApp.mainWindow,
    getQuickComposerWindow: () => desktopApp.quickComposerWindow,
    profileNamespace: standaloneAttachInfo.profileNamespace,
    channel,
    isDev,
    reportError: (error, tags) => captureMainException(error, tags),
    markQuitting: () => {
      desktopApp.isQuitting = true;
    },
    quickComposer: attachQuickComposer,
    onKeybindingsChanged: (file) => desktopApp.quickComposerShortcutManager?.apply(file),
    setShortcutsSuspended: (suspended) => globalShortcut.setSuspended(suspended),
  });

  // Device shortcut registration from the attach keybindings file, re-applied
  // on every attach keybinding save (managed parity).
  desktopApp.quickComposerShortcutManager = new QuickComposerShortcutManager(
    globalShortcut,
    process.platform,
    toggleQuickComposerWindow,
    (accelerator) => {
      desktopApp.tray?.setQuickComposerShortcut(accelerator);
    },
  );
  try {
    desktopApp.quickComposerShortcutManager.apply(
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
    getProjects: () => [],
    getThreads: () => [],
    onOpenThread: () => {},
    onShow: () => showAndFocusWindow(ensureMainWindow(true, shellState)),
    onQuickComposer: toggleQuickComposerWindow,
    onQuit: () => {
      desktopApp.isQuitting = true;
      app.quit();
    },
  });
  desktopApp.tray.setQuickComposerShortcut(
    desktopApp.quickComposerShortcutManager.active[0] ?? null,
  );

  app.on("activate", () => {
    if (desktopApp.mainWindow && !desktopApp.mainWindow.isDestroyed()) {
      showAndFocusWindow(desktopApp.mainWindow);
      return;
    }
    ensureMainWindow(true, shellState);
  });

  let quitCleanupStarted = false;
  app.on("before-quit", (event) => {
    desktopApp.isQuitting = true;
    if (quitCleanupStarted) return;
    quitCleanupStarted = true;
    event.preventDefault();
    // Client cleanup only: the external owner keeps its lease, SQLite, and
    // supervisor. No owner-stop credential is held and no child is killed
    // here (no BackendHostClient was ever forked in attach mode).
    if (desktopApp.mainWindow && !desktopApp.mainWindow.isDestroyed()) {
      saveWindowBounds(desktopApp.mainWindow, shellState, "window-bounds");
    }
    desktopApp.quickComposerShortcutManager?.dispose();
    desktopApp.quickComposerShortcutManager = null;
    desktopApp.quickComposerLifecycle?.dispose();
    desktopApp.quickComposerWindow?.close();
    desktopApp.quickComposerWindow = null;
    desktopApp.sleepInhibitor.dispose();
    desktopApp.tray?.destroy();
    desktopApp.tray = null;
    void shellState.close().then(
      () => app.quit(),
      () => app.quit(),
    );
  });
}
