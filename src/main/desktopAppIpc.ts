// Managed desktop IPC registration: local handlers, quick-composer window
// channels, tracked renderer reload, and the dev-only smoke controls. Split
// out of `desktopAppReady` along its IPC seam (V5 plan 1.4 / H8).

import { app, BrowserWindow, globalShortcut, ipcMain } from "electron";
import { IPC_WINDOW_CHANNELS, quickComposerSubmissionSchema } from "@/shared/ipc";
import { createLocalIpcHandlers } from "./ipc/localHandlers";
import { registerIpcHandlers } from "./ipc/registerHandlers";
import { registerSmokeNativeControls } from "./testing/smokeNativeControls";
import { requestTrackedRendererReload } from "./window/windowHardening";
import { QuickComposerShortcutManager } from "./quickComposerShortcut";
import type { AutoUpdaterController } from "./updates/autoUpdater";
import type { BackendHostClient } from "./backend/BackendHostClient";
import type { SshEnvironmentController } from "@/host/ssh/sshEnvironmentController";
import type { QuickComposerLifecycle } from "./window/quickComposerLifecycle";
import { updatePowerSaveBlocker } from "./desktopAppShell";
import {
  desktopApp,
  isDev,
  legacyBaseDirOverride,
  legacyElectronUserDataDir,
  requirePoracodePaths,
} from "./desktopAppState";
import {
  extractBrowserToWindow,
  finishQuickComposerDismiss,
  flushPendingThreadCommands,
  flushTrayThreadOpen,
  injectBrowserToMain,
  quickComposerWindowFor,
  toggleQuickComposerWindow,
} from "./desktopAppWindows";

export interface DesktopIpcDeps {
  readonly backendHost: BackendHostClient;
  readonly ssh: SshEnvironmentController;
  readonly autoUpdater: AutoUpdaterController;
  /** Created by the caller before this registration runs. */
  readonly quickComposerShortcutManager: QuickComposerShortcutManager;
  readonly quickComposerLifecycle: QuickComposerLifecycle;
}

/** Register every managed-local IPC surface before the main window opens. */
export function registerDesktopIpc(deps: DesktopIpcDeps): void {
  registerIpcHandlers({
    localHandlers: createLocalIpcHandlers({
      getMainWindow: () => desktopApp.mainWindow,
      getBrowserPanelManager: () => desktopApp.browserPanelManager,
      sshConnectionManager: deps.ssh,
      requirePoracodePaths,
      legacyElectronUserDataDir,
      ...(legacyBaseDirOverride ? { legacyBaseDir: legacyBaseDirOverride } : {}),
      updatePowerSaveBlocker,
      autoUpdater: deps.autoUpdater,
      onKeybindingsChanged: (file) => deps.quickComposerShortcutManager.apply(file),
      setGlobalShortcutsSuspended: (suspended) => globalShortcut.setSuspended(suspended),
      extractBrowserToWindow,
      injectBrowserToMain,
      requestRelaunch: () => {
        desktopApp.isQuitting = true;
        app.relaunch();
        app.quit();
      },
      database: deps.backendHost,
      backendServices: deps.backendHost,
      revertCheckpoint: (input) => deps.backendHost.revertCheckpoint(input),
      hostOffersAutoUpdate: () => desktopApp.hostServices?.capabilities.autoUpdate === true,
      hostOffersOsNotifications: () =>
        desktopApp.hostServices?.capabilities.osNotifications === true,
    }),
    callSupervisor: (name, payload) => deps.backendHost.call(name, payload),
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
}
