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
import { readSharedSettingsFile } from "@/host/sharedSettingsFile";
import { shouldStartMinimized, syncWindowsStartupRegistration } from "./startupSettings";
import { shouldPreventSystemSleep } from "./sleepPolicy";
import { readOrCreateSafeStorageSecretKey } from "./secretStorageKey";
import { desktopApp, isDev, requirePoracodePaths } from "./desktopAppState";
import type { NativeThreadActivityChange } from "@/shared/backendHostProtocol";

// setLoginItemSettings writes the HKCU Run registry key on Windows; skip it
// when launchAtStartup hasn't changed so routine settings saves stay cheap.
let lastAppliedLaunchAtStartup: boolean | null = null;

// Committed-settings read model (V2 A5). The settings authority
// (`src/backend/settings/`) remains the only writer; this cache is main's read
// model, seeded once from the parsed initial settings at native-shell
// preparation and repointed at the parsed object on every settings-changed
// event. Hot paths — above all the per-thread-state sleep reaction — must never
// touch the settings file, so the file is read at most once and only when the
// shell cache is still cold (startup order).
let committedSharedSettings: SharedSettings | null = null;

// Last values applied to the native power surfaces. A working-thread or
// settings-event storm that leaves the derived values unchanged is a no-op.
let lastAppliedPreventSleep: boolean | null = null;
let lastAppliedComputerUseKeepAwake: boolean | null = null;

function resolveCommittedSharedSettings(): SharedSettings {
  if (committedSharedSettings) return committedSharedSettings;
  if (!desktopApp.poracodePaths) return defaultSharedSettings;
  // Startup order: no committed event has arrived yet, so read once and adopt
  // the result as the committed cache instead of re-reading on later calls.
  committedSharedSettings = readSharedSettingsFile(desktopApp.poracodePaths.settingsPath);
  return committedSharedSettings;
}

function syncStartupSettings(settings?: SharedSettings): void {
  if (!desktopApp.poracodePaths) return;
  try {
    const s = settings ?? resolveCommittedSharedSettings();
    if (s.launchAtStartup === lastAppliedLaunchAtStartup) return;
    syncWindowsStartupRegistration(app, s, process.platform, isDev);
    lastAppliedLaunchAtStartup = s.launchAtStartup;
  } catch (error) {
    console.warn("[poracode] failed to update Windows startup registration", error);
  }
}

export function updatePowerSaveBlocker(): void {
  const settings = resolveCommittedSharedSettings();
  const preventSleep = shouldPreventSystemSleep(settings, desktopApp.workingThreads.size);
  if (preventSleep !== lastAppliedPreventSleep) {
    lastAppliedPreventSleep = preventSleep;
    desktopApp.sleepInhibitor.setActive(preventSleep);
  }
  // Every settings write funnels through here, so toggling the setting off
  // releases an already-held wake lock immediately.
  if (settings.computerUseKeepAwake !== lastAppliedComputerUseKeepAwake) {
    lastAppliedComputerUseKeepAwake = settings.computerUseKeepAwake;
    desktopApp.computerUseWakeLock.setEnabled(settings.computerUseKeepAwake);
  }
}

/**
 * Applies one coalesced `native-thread-activity` batch (A2). Main's working
 * set changes only by these deltas; the native power surface is re-derived
 * once per batch that actually moved the set. {@link resetThreadActivity}
 * clears the set on a child/supervisor restart, so a batch can never leave a
 * stale active flag behind.
 */
export function applyThreadActivity(changes: readonly NativeThreadActivityChange[]): void {
  let changed = false;
  for (const change of changes) {
    if (change.active) {
      if (desktopApp.workingThreads.has(change.threadId)) continue;
      desktopApp.workingThreads.add(change.threadId);
      changed = true;
    } else if (desktopApp.workingThreads.delete(change.threadId)) {
      changed = true;
    }
  }
  if (changed) updatePowerSaveBlocker();
}

/**
 * Backend/supervisor reset (A2): the new child starts with an empty working
 * set and only emits transitions, so main must drop every previously active
 * thread here. Without this a restart could keep a stale sleep blocker.
 */
export function resetThreadActivity(): void {
  desktopApp.workingThreads.clear();
  updatePowerSaveBlocker();
}

export function handleSharedSettingsChanged(settings: SharedSettings): void {
  // Adopt the committed object before any reaction reads it: the backend host
  // announces a commit after the authority wrote it, and its preceding
  // `updatePowerSaveBlocker()` call still saw the previous cache.
  committedSharedSettings = settings;
  updatePowerSaveBlocker();
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
  committedSharedSettings = initialSettings;
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
