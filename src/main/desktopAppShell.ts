// Desktop native-shell bootstrap and the shared power/settings reactions.
// Split out of `desktopAppReady` along its first seam (V5 plan 1.4 / H8):
// this module owns everything between "lease admitted" and "backend host
// composition" — protocol handlers, browser session, launch-on-startup
// registration, the Windows job object, the secret-storage key and the
// bundled resource directories — plus the power-save and shared-settings
// reactions the backend host event path reuses.

import { join } from "node:path";
import { app, session as electronSession } from "electron";
import { BROWSER_SESSION_PARTITION } from "@/shared/browserPartition";
import type { PoracodePaths } from "@/shared/poracodePaths";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import { configureSecretStorageKey } from "@/shared/secretStorage";
import { WindowsJobObjectManager } from "./windowsJobObject";
import { captureMainException } from "./diagnostics/sentry";
import { installLocalFileProtocolHandler } from "./attachments/localFiles";
import { installPickerProtocolHandler } from "./browser";
import { startUsageLoginCookieMirror } from "./usageLogin/UsageLoginCookieMirror";
import { readSharedSettingsFile } from "./sharedSettingsFile";
import { shouldStartMinimized, syncWindowsStartupRegistration } from "./startupSettings";
import { shouldPreventSystemSleep } from "./sleepPolicy";
import { readOrCreateSafeStorageSecretKey } from "./secretStorageKey";
import { desktopApp, isDev, requirePoracodePaths } from "./desktopAppState";
import type { SupervisorEvent } from "@/shared/ipc";

// setLoginItemSettings writes the HKCU Run registry key on Windows; skip it
// when launchAtStartup hasn't changed so routine settings saves stay cheap.
let lastAppliedLaunchAtStartup: boolean | null = null;

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

export function updatePowerSaveBlocker(): void {
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

export function handleSupervisorEventForSleep(event: SupervisorEvent): void {
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

export function handleSharedSettingsChanged(settings: SharedSettings): void {
  // Browser allow gates live on the composed host services (embedded browser
  // + external Chrome bridge share the same settings gates).
  desktopApp.hostServices?.applyBrowserAllowFlags(settings);
  syncStartupSettings(settings);
}

/** Bundled resource directories, resolved once for the managed startup. */
export interface DesktopResourceDirs {
  /** Directory of the desktop main bundle (SSH runtime manifests live here). */
  readonly mainBundleDir: string;
  readonly supervisorPath: string;
  readonly backendHostPath: string;
  readonly remoteHttpBridgePath: string;
  readonly wslHelpersDir: string;
  readonly bundledSkillsDir: string;
  readonly bundledPluginsDir: string;
  readonly agentPluginsDir: string;
  readonly computerUseHelperRoot: string;
}

function bundledOrResourcesDir(resource: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, resource)
    : join(__dirname, "..", "..", "resources", resource);
}

export function resolveDesktopResourceDirs(): DesktopResourceDirs {
  return {
    mainBundleDir: __dirname,
    supervisorPath: join(__dirname, "supervisor.cjs"),
    backendHostPath: join(__dirname, "backendHost.cjs"),
    remoteHttpBridgePath: join(__dirname, "remoteHttpBridge.cjs"),
    wslHelpersDir: bundledOrResourcesDir("wsl-helpers"),
    bundledSkillsDir: bundledOrResourcesDir("skills"),
    bundledPluginsDir: bundledOrResourcesDir("plugins"),
    agentPluginsDir: bundledOrResourcesDir("agent-plugins"),
    computerUseHelperRoot: bundledOrResourcesDir(
      isDev ? "computer-use-helper-dev" : "computer-use-helper",
    ),
  };
}

export interface DesktopNativeShellBootstrap {
  readonly paths: PoracodePaths;
  readonly initialSettings: SharedSettings;
  readonly showMainWindowOnReady: boolean;
  readonly jobObjectReady: Promise<void>;
  readonly secretStorageKey: string;
  readonly dirs: DesktopResourceDirs;
}

/**
 * Install the native shell (protocol handlers, browser session, cookie
 * mirror, launch registration, job object, secret key) after the owner lease
 * is admitted. Pure native-shell setup: no backend process starts here.
 */
export function prepareDesktopNativeShell(): DesktopNativeShellBootstrap {
  installLocalFileProtocolHandler();
  installPickerProtocolHandler();
  // Keep the pre-rebrand partition so browser cookies and sign-ins survive.
  const paths = requirePoracodePaths();
  const browserSession = electronSession.fromPartition(BROWSER_SESSION_PARTITION);
  browserSession.setUserAgent(desktopApp.browserUserAgent);

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

  return {
    paths,
    initialSettings,
    showMainWindowOnReady,
    jobObjectReady,
    secretStorageKey,
    dirs: resolveDesktopResourceDirs(),
  };
}
