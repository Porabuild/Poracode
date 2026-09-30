// Desktop-side native shell services around the shared host-service
// composition (V5 plan 1.1). Everything Electron-bound about the browser
// panel, its remote gateway, and the computer-use overlay is constructed
// here and handed to `composeHostServices` through `nativeShell`; the
// Electron-free services (SSH, Chrome bridge, computer-use ingress) are
// composed by the shared module exactly like the standalone server does.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { PoracodePaths } from "@/shared/poracodePaths";
import type { ShellStateStore } from "./backend/BackendStateStore";
import type { BackendHostClient } from "./backend/BackendHostClient";
import { BrowserPanelManager, BrowserMcpIngress } from "./browser";
import { RemoteBrowserGateway } from "@/host/remote/RemoteBrowserGateway";
import { ComputerUseDesktopOverlay } from "./computer-use";
import {
  composeHostServices,
  type ComposedHostServices,
} from "@/host/hostServices/composeHostServices";
import type { DesktopBrowserNativeControl } from "./desktopAppBackendHost";
import type { DesktopResourceDirs } from "./desktopAppShell";
import { safeStorageHealth } from "./safeStorageHealth";
import { desktopApp, requirePoracodePaths } from "./desktopAppState";
import { readSharedSettingsFile } from "@/host/sharedSettingsFile";
import { focusBrowserExtractWindow } from "./desktopAppWindows";
import { SshEnvironmentSupervisor } from "./ssh/sshEnvironmentSupervisor";
import type { SshEnvironmentController } from "@/host/ssh/sshEnvironmentController";

export interface DesktopHostServicesDeps {
  readonly paths: PoracodePaths;
  readonly dirs: DesktopResourceDirs;
  readonly shellState: ShellStateStore;
  /** The composed backend host client (overlay exit interrupts its threads). */
  readonly backendHost: BackendHostClient;
}

export interface DesktopHostServices {
  readonly services: ComposedHostServices;
  /** Device-local SSH: main only invokes the utility and presents results. */
  readonly ssh: SshEnvironmentController;
  /** Browser-panel control consumed by the backend host native handlers. */
  readonly browser: DesktopBrowserNativeControl;
  /** Joins the browser watch stop and the remote gateway dispose (quit). */
  disposeBrowserGateway(): Promise<void>;
}

/**
 * Resolve the immutable release archive the artifact pipeline may ship
 * (`resources/ssh-runtime-archive/{manifest.json,<archive>}`). A development
 * checkout has none; the utility then stages the bundle in its worker.
 */
export function resolvePreassembledSshRuntimeArchiveDir(): string | undefined {
  const dir = app.isPackaged
    ? join(process.resourcesPath, "ssh-runtime-archive")
    : join(__dirname, "..", "..", "resources", "ssh-runtime-archive");
  return existsSync(join(dir, "manifest.json")) ? dir : undefined;
}

function createDesktopSshEnvironment(dirs: DesktopResourceDirs): SshEnvironmentController {
  const preassembledArchiveDir = resolvePreassembledSshRuntimeArchiveDir();
  return new SshEnvironmentSupervisor({
    utilityPath: join(dirs.mainBundleDir, "sshEnvironmentWorker.cjs"),
    isPackaged: app.isPackaged,
    config: {
      mainBundleDir: dirs.mainBundleDir,
      agentPluginsDir: dirs.agentPluginsDir,
      wslHelpersDir: dirs.wslHelpersDir,
      bundledSkillsDir: dirs.bundledSkillsDir,
      bundledPluginsDir: dirs.bundledPluginsDir,
      cacheDir: join(requirePoracodePaths().baseDir, "ssh-runtime-bundles"),
      ...(preassembledArchiveDir ? { preassembledArchiveDir } : {}),
    },
  });
}

export function createDesktopHostServices(deps: DesktopHostServicesDeps): DesktopHostServices {
  const panelManager = new BrowserPanelManager(
    deps.paths,
    desktopApp.browserUserAgent,
    deps.shellState,
    {
      isExtracted: () =>
        desktopApp.browserExtractWindow !== null && !desktopApp.browserExtractWindow.isDestroyed(),
      focusExtractedWindow: focusBrowserExtractWindow,
    },
  );
  desktopApp.browserPanelManager = panelManager;
  const browserMcpIngress = new BrowserMcpIngress();
  const remoteBrowserGateway = new RemoteBrowserGateway(() => desktopApp.browserPanelManager);
  // External-Chrome control: a localhost WS bridge the companion extension
  // connects to, plus a `chrome` MCP ingress agents reach the same way as the
  // embedded `browser` server. They live side by side (composed in the shared
  // module below, identical to the standalone server).

  // A locked desktop is uncontrollable and unobservable for computer use, so
  // the overlay drives the display wake lock and interrupts the session's
  // thread when the user exits the badge.
  const overlay = new ComputerUseDesktopOverlay({
    onActivityState: (state) => {
      desktopApp.computerUseWakeLock.setSessionActive(state.level !== "hidden");
    },
    onExit: (threadIds) => {
      desktopApp.computerUseMcpIngress?.interruptActiveActions(threadIds);
      for (const threadId of threadIds) {
        void deps.backendHost.call("interruptThread", { threadId }).catch((error) => {
          console.error(`[poracode] failed to interrupt computer-use thread ${threadId}:`, error);
        });
      }
    },
  });
  desktopApp.computerUseDesktopOverlay = overlay;

  const services = composeHostServices(
    {
      baseDir: deps.paths.baseDir,
      getSharedSettings: () => readSharedSettingsFile(requirePoracodePaths().settingsPath),
      // Device-local SSH is not a host service: the desktop runs it in a
      // utility process (main only invokes and presents), while the shared
      // composition keeps constructing the host-owned manager for
      // backend/headless authorities that orchestrate SSH in-process.
      ssh: null,
      computerUse: {
        helperRootDir: deps.dirs.computerUseHelperRoot,
        stateDir: join(app.getPath("userData"), "computer-use"),
      },
      // The desktop host seals captured secrets with safeStorage; a latched
      // unhealthy probe means this launch cannot honor native custody.
      nativeSecrets: safeStorageHealth().kind === "healthy",
      // The desktop remote server (backend child) composes the port-forward
      // gateway for this host (DesktopRemoteAccessController).
      portForward: true,
      autoUpdate: true,
      osNotifications: true,
    },
    {
      browserMcpIngress,
      browserPanelManager: panelManager,
      computerUse: {
        onActivity: (event) => desktopApp.computerUseDesktopOverlay?.setActivity(event),
        isDisplayKeptAwake: () => desktopApp.computerUseWakeLock.isHeld(),
      },
    },
  );
  desktopApp.hostServices = services;
  desktopApp.browserMcpIngress = services.browserMcpIngress;
  desktopApp.computerUseMcpIngress = services.computerUseMcpIngress;
  desktopApp.chromeBridgeServer = services.chromeBridgeServer;
  desktopApp.chromeMcpIngress = services.chromeMcpIngress;

  const ssh = createDesktopSshEnvironment(deps.dirs);

  let watchStop: (() => void) | null = null;
  let gatewayDisposed: Promise<void> | null = null;
  const browser: DesktopBrowserNativeControl = {
    state: () => remoteBrowserGateway.state(),
    command: (payload) => remoteBrowserGateway.command(payload),
    dispatchInput: (payload) => remoteBrowserGateway.dispatchInput(payload),
    startWatch: (publish) => {
      watchStop ??= remoteBrowserGateway.watch({
        onFrame: (frame) => publish({ type: "frame", ...frame }),
        onState: (state) => publish({ type: "state", state }),
        onStatus: (status) => publish({ type: "status", status }),
      });
      return null;
    },
    stopWatch: () => {
      watchStop?.();
      watchStop = null;
      return null;
    },
    refresh: () => {
      void remoteBrowserGateway.refresh();
      return null;
    },
  };

  return {
    services,
    ssh,
    browser,
    disposeBrowserGateway: () => {
      gatewayDisposed ??= (async () => {
        browser.stopWatch();
        remoteBrowserGateway.dispose();
      })();
      return gatewayDisposed;
    },
  };
}
