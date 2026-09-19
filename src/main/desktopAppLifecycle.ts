// Managed desktop lifecycle: tray publication, desktop-owner control surface
// publication, post-ready hooks, and the before-quit shutdown join. Split out
// of `desktopAppReady` along its lifecycle seam (V5 plan 1.4 / H8).

import { watch } from "node:fs";
import { app, safeStorage } from "electron";
import { APP_QUIT_CLEANUP_TIMEOUT_MS, raceWithTimeout } from "./appQuitCleanup";
import { joinRuntimeShutdown } from "@/backend/joinRuntimeShutdown";
import { HostCredentialAdoptionService } from "@/backend/ownership/nativeSecretKey";
import { captureMainException } from "./diagnostics/sentry";
import { createTray } from "./tray";
import { getAppName } from "@/shared/appName";
import { cleanupOrphanedAttachments } from "./poracodeData";
import { saveWindowBounds } from "./window/createMainWindow";
import { showAndFocusWindow } from "./window/showAndFocusWindow";
import { safeStorageHealth } from "./safeStorageHealth";
import { startDesktopHostControl } from "./backend/desktopHostControl";
import type { BackendHostClient } from "./backend/BackendHostClient";
import type { BackendStateStore } from "./backend/BackendStateStore";
import type { SshConnectionManager } from "./ssh/SshConnectionManager";
import type { AutoUpdaterController } from "./updates/autoUpdater";
import type { DesktopTrayFeed } from "./desktopAppBackendHost";
import {
  ensureMainWindow,
  openThreadFromTray,
  toggleQuickComposerWindow,
} from "./desktopAppWindows";
import { desktopApp, channel, isDev, requirePoracodePaths } from "./desktopAppState";

/** Create the tray, bind its feeds, and load the initial projections. */
export async function createDesktopTray(feed: DesktopTrayFeed): Promise<void> {
  desktopApp.tray = createTray({
    channel,
    appName: getAppName(channel, isDev),
    getProjects: feed.getProjects,
    getThreads: feed.getThreads,
    onOpenThread: openThreadFromTray,
    onShow: () => showAndFocusWindow(ensureMainWindow()),
    onQuickComposer: toggleQuickComposerWindow,
    onQuit: () => {
      desktopApp.isQuitting = true;
      app.quit();
    },
  });
  desktopApp.tray.setQuickComposerShortcut(
    desktopApp.quickComposerShortcutManager?.active[0] ?? null,
  );
  await feed.refresh();
}

/**
 * Desktop-owner publication (S1.1): discovery + authenticated describe for
 * the shared control surface, leased as kind "desktop", plus the staged-import
 * key-adoption service on the same lease. Both are disposed in before-quit:
 * HostControlServer.dispose removes discovery only after connections and
 * admitted work have joined, strictly before the will-quit lease release.
 */
export function publishDesktopOwnerServices(): void {
  if (!desktopApp.desktopOwnerLease) return;
  desktopApp.desktopHostControlServer = startDesktopHostControl({
    lease: desktopApp.desktopOwnerLease,
    // Host-declared service capabilities from the composed host services
    // (V5 plan 1.2): the describe publishes what this owner constructed.
    capabilities: desktopApp.hostServices?.capabilities ?? {
      ssh: false,
      browserPanel: false,
      chromeBridge: false,
      computerUse: false,
      nativeSecrets: false,
      portForward: true,
    },
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

export interface DesktopLifecycleDeps {
  readonly backendHost: BackendHostClient;
  readonly shellState: BackendStateStore;
  /** Non-null on the desktop: the composition always ships SSH inputs. */
  readonly sshConnectionManager: SshConnectionManager;
  /** Joins the browser watch stop and the remote gateway dispose (quit). */
  disposeBrowserGateway(): Promise<void>;
  readonly autoUpdater: AutoUpdaterController;
  readonly initialMainWindow: ReturnType<typeof ensureMainWindow>;
  readonly supervisorPath: string;
}

/** Post-ready hooks: attachments cleanup, updater, dev watch, quit join. */
export function registerDesktopAppLifecycle(deps: DesktopLifecycleDeps): void {
  deps.initialMainWindow.once("ready-to-show", () => {
    setTimeout(() => {
      const attachmentPaths = requirePoracodePaths();
      void deps.backendHost
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
    deps.autoUpdater.initialize();
  }

  if (isDev) {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    watch(deps.supervisorPath, () => {
      if (debounce) {
        clearTimeout(debounce);
      }
      debounce = setTimeout(() => {
        console.log("[poracode] supervisor changed, restarting…");
        void deps.backendHost.restartSupervisor().catch((error) => {
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

  registerBeforeQuitJoin(deps);
}

function registerBeforeQuitJoin(deps: DesktopLifecycleDeps): void {
  let quitCleanupStarted = false;
  app.on("before-quit", (event) => {
    desktopApp.isQuitting = true;
    if (quitCleanupStarted) return;
    quitCleanupStarted = true;
    event.preventDefault();
    if (desktopApp.mainWindow && !desktopApp.mainWindow.isDestroyed()) {
      saveWindowBounds(desktopApp.mainWindow, deps.shellState, "window-bounds");
    }
    desktopApp.quickComposerShortcutManager?.dispose();
    desktopApp.quickComposerShortcutManager = null;
    desktopApp.quickComposerLifecycle?.dispose();
    // The composed host services own the ingress set (embedded browser MCP,
    // computer-use MCP, chrome MCP, chrome bridge). Null the individual
    // fields first so late readers see the shutdown exactly like before.
    const hostServicesToClose = desktopApp.hostServices;
    desktopApp.hostServices = null;
    desktopApp.browserMcpIngress = null;
    desktopApp.computerUseMcpIngress = null;
    desktopApp.computerUseDesktopOverlay?.dispose();
    desktopApp.computerUseDesktopOverlay = null;
    desktopApp.computerUseWakeLock.dispose();
    desktopApp.chromeMcpIngress = null;
    desktopApp.chromeBridgeServer = null;
    // Disposal starts here (not in the join below) to match the previous
    // ingress shutdown timing relative to window/panel teardown.
    const ingressDispose = hostServicesToClose?.dispose();
    desktopApp.browserExtractWindow?.close();
    desktopApp.browserExtractWindow = null;
    desktopApp.quickComposerWindow?.close();
    desktopApp.quickComposerWindow = null;
    desktopApp.browserPanelManager?.dispose();
    desktopApp.browserPanelManager = null;
    void deps.disposeBrowserGateway();
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
        () => ingressDispose ?? Promise.resolve(),
        () => controlToDispose?.dispose(),
        () => adoptionToDispose?.dispose(),
        () =>
          deps.sshConnectionManager.dispose().catch((error) => {
            captureMainException(error, { "poracode.feature_area": "ssh" });
          }),
        () => deps.shellState.close(),
        () => deps.backendHost.disposeAsync({ timeoutMs: APP_QUIT_CLEANUP_TIMEOUT_MS }),
      ],
      "Main shutdown did not complete cleanly.",
    ).catch((error) => {
      captureMainException(error, { "poracode.feature_area": "main-shutdown" });
    });
    void raceWithTimeout(cleanup, APP_QUIT_CLEANUP_TIMEOUT_MS).then(finishQuit, finishQuit);
  });
}
