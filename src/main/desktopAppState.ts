// Mutable desktop-app process state shared by the Electron entry, window
// helpers, attach-mode startup, and managed ready path.
import { join } from "node:path";
import { app, type BrowserWindow } from "electron";
import { resolvePoracodeChannel } from "@/shared/channel";
import { resolveLegacyElectronUserDataDir } from "@/shared/legacyProductPaths";
import type { PoracodePaths } from "@/shared/poracodePaths";
import type { RemoteThreadCommand } from "@/shared/contracts";
import type { StandaloneAttachInfo } from "@/shared/standaloneAttach";
import type { NodePerformanceDiagnostics } from "@/shared/diagnostics/nodePerformanceDiagnostics";
import type { HostControlServer } from "@/backend/ownership/HostControlServer";
import type { HostOwnerLease } from "@/backend/ownership/hostOwnerLease";
import type { HostCredentialAdoptionService } from "@/backend/ownership/nativeSecretKey";
import type { BackendHostClient } from "./backend/BackendHostClient";
import type { BackendStateStore, ShellStateStore } from "./backend/BackendStateStore";
import type { ComposedHostServices } from "./hostServices/composeHostServices";
import type {
  DeferredAttachProbe,
  StandaloneAttachSession,
} from "./backend/standaloneAttachBootstrap";
import type {
  BrowserMcpIngress,
  BrowserPanelManager,
  ChromeBridgeServer,
  ChromeMcpIngress,
} from "./browser";
import {
  ComputerUseWakeLock,
  type ComputerUseDesktopOverlay,
  type ComputerUseMcpIngress,
} from "./computer-use";
import type { QuickComposerShortcutManager } from "./quickComposerShortcut";
import { createSleepInhibitor } from "./sleepInhibitor";
import type { TrayHandle } from "./tray";
import type { WindowsJobObjectManager } from "./windowsJobObject";
import type { QuickComposerLifecycle } from "./window/quickComposerLifecycle";

export const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
export const channel = resolvePoracodeChannel();
export const baseDirOverride = process.env.PORACODE_BASE_DIR;
export const legacyBaseDirOverride = process.env.LIGHTCODE_BASE_DIR?.trim() || undefined;

export const posthogEnabled = process.env.POSTHOG_ENABLED !== "0";
export const posthogKey = posthogEnabled ? (process.env.POSTHOG_KEY ?? "").trim() : "";
export const posthogHost = (process.env.POSTHOG_HOST ?? "").trim();
export const posthogEnableDev = process.env.POSTHOG_ENABLE_DEV === "1";

export const defaultElectronUserDataDir = app.getPath("userData");
export const legacyElectronUserDataDir = legacyBaseDirOverride
  ? join(legacyBaseDirOverride, "userData")
  : resolveLegacyElectronUserDataDir(defaultElectronUserDataDir, channel, isDev);
export const preserveLegacySafeStorageIdentity = !isDev && process.platform !== "win32";

export const WINDOW_CHROME_HEIGHT = 32;
export const PENDING_THREAD_COMMAND_LIMIT = 64;

export interface DesktopAppState {
  sentryEnabled: boolean;
  browserUserAgent: string;
  performanceDiagnostics: NodePerformanceDiagnostics | null;
  poracodePaths: PoracodePaths | null;
  desktopOwnerLease: HostOwnerLease | null;
  // Standalone attach (Gate 2 connected slice): when owner discovery is visible
  // at module load, the lease acquisition is deferred to `whenReady` so the
  // authenticated describe decision runs BEFORE lease/acquire, backend fork,
  // legacy migration, and desktop secret-key init. Null means the synchronous
  // managed path already ran.
  deferredStandaloneProbe: DeferredAttachProbe | null;
  // Authenticated attach payload for the renderer bootstrap (endpoint + fresh
  // pairing URL + pinned generation). Present only in attach mode; served over
  // IPC, never logged or persisted.
  standaloneAttachInfo: StandaloneAttachInfo | null;
  // Ephemeral window state for attach mode (no owned-root writes; window bounds
  // do not persist across restarts in this candidate — device-only persistence
  // stays future work).
  standaloneAttachShellState: ShellStateStore | null;
  // Always a real Error: the caught acquisition failure is normalized at
  // capture time so the readiness rethrow keeps its identity under the
  // only-throw-error rule.
  desktopOwnerAcquisitionError: Error | null;
  // Desktop-owner publication of the shared authenticated control surface
  // (discovery + describe). Null in attach mode and before readiness.
  desktopHostControlServer: HostControlServer | null;
  // Desktop half of staged-import activation (Gate 2.5 S5.1): while this
  // desktop owns the profile it publishes the one-time key-adoption offer and
  // answers a single authenticated unseal for a `poracode-server activate` run
  // against this profile. Additive — ordinary operation never contacts it.
  hostCredentialAdoption: HostCredentialAdoptionService | null;
  // Attach-session anchor for generation re-verification; null outside attach.
  standaloneAttachSession: StandaloneAttachSession | null;
  // Zero-window (tray/hidden) remote thread commands. The backend mirrors these
  // to the renderer store; with no mounted window they used to be dropped
  // silently while the backend still reported hasRendererWindow:true. Ordered,
  // bounded, flushed in arrival order when a main window next becomes ready.
  pendingThreadCommands: RemoteThreadCommand[];
  mainWindow: BrowserWindow | null;
  quickComposerWindow: BrowserWindow | null;
  // The active mode's quick-composer device lifecycle (managed or standalone
  // attach). Window functions delegate to it; each startup assigns its own host
  // (attach binds the ephemeral shell state for main recreation).
  quickComposerLifecycle: QuickComposerLifecycle | null;
  pendingTrayThreadId: string | null;
  windowsJobObjectManager: WindowsJobObjectManager | null;
  browserPanelManager: BrowserPanelManager | null;
  browserMcpIngress: BrowserMcpIngress | null;
  computerUseMcpIngress: ComputerUseMcpIngress | null;
  computerUseDesktopOverlay: ComputerUseDesktopOverlay | null;
  chromeBridgeServer: ChromeBridgeServer | null;
  chromeMcpIngress: ChromeMcpIngress | null;
  // One composed host-service bundle (SSH, Chrome bridge, computer-use, and —
  // with the native shell — the embedded browser ingress). Assigned by the
  // managed ready path; null in attach mode and before composition.
  hostServices: ComposedHostServices | null;
  browserExtractWindow: BrowserWindow | null;
  backendHostClient: BackendHostClient | null;
  backendStateStore: BackendStateStore | null;
  clearRendererEventInterests: ((senderId?: number) => void) | null;
  // Retained so the native Tray icon stays reachable from GC.
  tray: TrayHandle | null;
  quickComposerShortcutManager: QuickComposerShortcutManager | null;
  isQuitting: boolean;
  workingThreads: Set<string>;
  sleepInhibitor: ReturnType<typeof createSleepInhibitor>;
  // A locked desktop is uncontrollable and unobservable for computer use, so the
  // display is held awake for the duration of a session. Owned here (not by the
  // ingress) so it survives ingress restarts and is released on quit.
  computerUseWakeLock: ComputerUseWakeLock;
}

export const desktopApp: DesktopAppState = {
  sentryEnabled: false,
  browserUserAgent: "",
  performanceDiagnostics: null,
  poracodePaths: null,
  desktopOwnerLease: null,
  deferredStandaloneProbe: null,
  standaloneAttachInfo: null,
  standaloneAttachShellState: null,
  desktopOwnerAcquisitionError: null,
  desktopHostControlServer: null,
  hostCredentialAdoption: null,
  standaloneAttachSession: null,
  pendingThreadCommands: [],
  mainWindow: null,
  quickComposerWindow: null,
  quickComposerLifecycle: null,
  pendingTrayThreadId: null,
  windowsJobObjectManager: null,
  browserPanelManager: null,
  browserMcpIngress: null,
  computerUseMcpIngress: null,
  computerUseDesktopOverlay: null,
  chromeBridgeServer: null,
  chromeMcpIngress: null,
  hostServices: null,
  browserExtractWindow: null,
  backendHostClient: null,
  backendStateStore: null,
  clearRendererEventInterests: null,
  tray: null,
  quickComposerShortcutManager: null,
  isQuitting: false,
  workingThreads: new Set<string>(),
  sleepInhibitor: createSleepInhibitor(),
  computerUseWakeLock: new ComputerUseWakeLock(),
};

export function requirePoracodePaths(): PoracodePaths {
  if (!desktopApp.poracodePaths) {
    throw new Error("Poracode paths are not initialized.");
  }
  return desktopApp.poracodePaths;
}

export function requireBackendStateStore(): BackendStateStore {
  if (!desktopApp.backendStateStore) {
    throw new Error("Backend state projection is not initialized.");
  }
  return desktopApp.backendStateStore;
}
