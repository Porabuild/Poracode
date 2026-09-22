// Desktop backend-host composition: the out-of-process backend host client,
// its renderer event dispatch/delivery wiring, the native request/event
// handlers, and the shell state preload. Split out of `desktopAppReady` along
// its backend seam (V5 plan 1.4 / H8). Electron-owned surfaces arrive as
// injected controls: the auto-update controller (created later in startup)
// and the browser-panel native control (owned by the host-services module).

import { ipcMain } from "electron";
import type { Project, Thread } from "@/shared/contracts";
import { IPC_EVENT_CHANNELS, IPC_WINDOW_CHANNELS } from "@/shared/ipc";
import type {
  BackendBrowserEvent,
  BackendNativeEvent,
  BackendNativeRequest,
} from "@/shared/backendHostProtocol";
import type { RemoteBrowserCommand, RemoteBrowserInput } from "@/shared/remote";
import { captureMainException } from "./diagnostics/sentry";
import { showOsNotification, showUserNotificationFallback } from "./osNotifications";
import { PENDING_THREAD_COMMAND_LIMIT, desktopApp } from "./desktopAppState";
import type { AutoUpdaterController } from "./updates/autoUpdater";
import { BackendHostClient } from "./backend/BackendHostClient";
import { buildDesktopBackendInitialize } from "./backend/desktopBackendInitialize";
import { BackendStateStore } from "./backend/BackendStateStore";
import { openThreadFromTray } from "./desktopAppWindows";
import {
  applyThreadActivity,
  handleSharedSettingsChanged,
  resetThreadActivity,
  updatePowerSaveBlocker,
} from "./desktopAppShell";

/** Browser-panel control the backend host reaches through main (shell-owned). */
export interface DesktopBrowserNativeControl {
  state(): unknown;
  command(payload: RemoteBrowserCommand): Promise<unknown>;
  dispatchInput(payload: RemoteBrowserInput): Promise<unknown>;
  startWatch(publish: (event: BackendBrowserEvent) => void): null;
  stopWatch(): null;
  refresh(): null;
}

export interface DesktopBackendHostDeps {
  readonly initialize: ReturnType<typeof buildDesktopBackendInitialize>;
  readonly backendHostPath: string;
  getAutoUpdater(): AutoUpdaterController;
  readonly browser: DesktopBrowserNativeControl;
}

/** Tray feeds mirrored from backend database projections (zero-window parity). */
export interface DesktopTrayFeed {
  getProjects(): Project[];
  getThreads(): Thread[];
  /** Reload both feeds from the backend and refresh the tray when present. */
  refresh(): Promise<void>;
}

export interface DesktopBackendHost {
  readonly backendHost: BackendHostClient;
  readonly shellState: BackendStateStore;
  readonly trayFeed: DesktopTrayFeed;
  /**
   * Load the renderer stream info, preload the persisted window/browser
   * shell state, and publish both onto the desktop app state — before any
   * window opens.
   */
  preloadShellState(): Promise<void>;
}

function createNativeRequestHandler(
  getBackendHost: () => BackendHostClient,
  deps: DesktopBackendHostDeps,
): (request: BackendNativeRequest) => Promise<unknown> | unknown {
  return (request) => {
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
        return deps.getAutoUpdater().checkForUpdate();
      case "install-update":
        deps.getAutoUpdater().installUpdate();
        return null;
      case "browser-state":
        return deps.browser.state();
      case "browser-command":
        return deps.browser.command(request.payload);
      case "browser-input":
        return deps.browser.dispatchInput(request.payload);
      case "browser-watch-start":
        return deps.browser.startWatch((event) => getBackendHost().publishBrowserEvent(event));
      case "browser-watch-stop":
        return deps.browser.stopWatch();
      case "browser-refresh":
        return deps.browser.refresh();
    }
  };
}

function createNativeEventHandler(trayFeed: DesktopTrayFeed): (event: BackendNativeEvent) => void {
  return (event) => {
    switch (event.type) {
      case "database-projection-changed":
        void trayFeed.refresh().catch((error) => {
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
  };
}

/**
 * Compose the desktop backend-host client and its main-side wiring. Pure
 * composition: nothing is awaited and no supervisor starts here. The caller
 * preloads shell state via {@link DesktopBackendHost.preloadShellState}.
 */
export function createDesktopBackendHost(deps: DesktopBackendHostDeps): DesktopBackendHost {
  let trayProjects: Project[] = [];
  let trayThreads: Thread[] = [];
  const trayFeed: DesktopTrayFeed = {
    getProjects: () => trayProjects,
    getThreads: () => trayThreads,
    refresh: async () => {
      [trayProjects, trayThreads] = await Promise.all([
        backendHost.callDatabase("dbGetProjects", {}),
        backendHost.callDatabase("dbGetThreads", {}),
      ]);
      desktopApp.tray?.refreshMenu();
    },
  };
  const handleBackendReset = (): void => {
    // A new backend child restarts the loopback sequence spaces, so windows
    // must drop their dedupe cursors and rebuild subscribed state. The child
    // only emits transitions, so main's working set is cleared here — a
    // restart can never leave a stale active flag behind.
    resetThreadActivity();
    for (const window of [
      desktopApp.mainWindow,
      desktopApp.quickComposerWindow,
      desktopApp.browserExtractWindow,
    ]) {
      if (window && !window.isDestroyed()) {
        window.webContents.send(IPC_EVENT_CHANNELS.backendSupervisorReset);
      }
    }
  };
  // `backendHost` is captured lazily everywhere below: the client invokes
  // these callbacks only after construction has finished.
  const backendHost = new BackendHostClient({
    backendHostPath: deps.backendHostPath,
    initialize: deps.initialize,
    resolveExtraEnv: () => desktopApp.hostServices?.supervisorExtraEnv() ?? {},
    ...(desktopApp.performanceDiagnostics
      ? { queueDiagnostics: desktopApp.performanceDiagnostics.queueCapture }
      : {}),
    assignPid: async (pid) => {
      await desktopApp.windowsJobObjectManager?.assignPid(pid);
    },
    reportError: (error, tags) => {
      captureMainException(error, tags);
    },
    onThreadActivity: (changes) => applyThreadActivity(changes),
    onReset: handleBackendReset,
    handleNativeRequest: createNativeRequestHandler(() => backendHost, deps),
    onNativeEvent: createNativeEventHandler(trayFeed),
  });
  desktopApp.performanceDiagnostics?.observeIpcQueue("main-to-backend", () =>
    backendHost.getQueueDiagnostics(),
  );
  desktopApp.backendHostClient = backendHost;
  // Managed-local path holds no external owner: the renderer bootstrap
  // treats absence (or a rejected invoke on older builds) as managed.
  ipcMain.handle(IPC_WINDOW_CHANNELS.standaloneAttachInfo, () => null);
  const shellState = new BackendStateStore(backendHost);
  return {
    backendHost,
    shellState,
    trayFeed,
    preloadShellState: async () => {
      await shellState.preload([
        "window-bounds",
        "browser-extract-window-bounds",
        "browser-panel-tabs-v1",
        "browser-history-v1",
        "browser-bookmarks-v1",
        "browser-bookmark-bar-visible-v1",
      ]);
      desktopApp.backendStateStore = shellState;
    },
  };
}
