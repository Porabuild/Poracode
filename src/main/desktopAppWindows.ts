// Desktop BrowserWindow factories and tray/composer helpers. Window
// construction is delegated to ./window/*; live refs live on desktopApp.
import { join } from "node:path";
import { app, BrowserWindow, nativeTheme, type RenderProcessGoneDetails } from "electron";
import { resolveThemeMode } from "@/shared/themeMode";
import { getAppName } from "@/shared/appName";
import { IPC_EVENT_CHANNELS } from "@/shared/ipc";
import type { ShellStateStore } from "./backend/BackendStateStore";
import { showAddFilesDialog } from "./ipc/localHandlers";
import { captureMainException } from "./diagnostics/sentry";
import {
  classifyRendererProcessGone,
  type RendererProcessGoneIntent,
} from "./diagnostics/processGone";
import { readSharedSettingsFile } from "@/host/sharedSettingsFile";
import { createMainWindow } from "./window/createMainWindow";
import { createMainWindowCloseLifecycle } from "./window/mainWindowClose";
import { installMainRendererInvalidation } from "./window/mainRendererInvalidation";
import {
  createQuickComposerWindow,
  showQuickComposerWindow,
} from "./window/createQuickComposerWindow";
import type { QuickComposerLifecycleHost } from "./window/quickComposerLifecycle";
import { showAndFocusWindow } from "./window/showAndFocusWindow";
import {
  WINDOW_CHROME_HEIGHT,
  channel,
  desktopApp,
  isDev,
  posthogEnableDev,
  posthogEnabled,
  posthogHost,
  posthogKey,
  requireBackendStateStore,
} from "./desktopAppState";

function captureRendererProcessGone(
  details: RenderProcessGoneDetails,
  featureArea: "browser" | "quick-composer" | "renderer",
  intent?: RendererProcessGoneIntent,
): void {
  const diagnostic = classifyRendererProcessGone(
    details,
    process.platform,
    desktopApp.isQuitting ? "app-shutdown" : intent,
  );
  if (!diagnostic) return;
  captureMainException(
    new Error(`Electron renderer process gone (${diagnostic.bucket})`),
    {
      "poracode.feature_area": featureArea,
      "poracode.process": "renderer",
    },
    diagnostic.fingerprint,
  );
}

function isCloseToTrayEnabled(): boolean {
  if (!desktopApp.poracodePaths) return false;
  try {
    return readSharedSettingsFile(desktopApp.poracodePaths.settingsPath).closeToTray;
  } catch {
    return false;
  }
}

/**
 * Resolves the saved appearance + opt-in translucent ("liquid glass") sidebar in
 * a single settings read, so the window opens already matching the theme and
 * material (flash-free first paint) before the renderer paints.
 */
function resolveWindowChromeOptions(): {
  appearance: "light" | "dark";
  sidebarTranslucency: boolean;
} {
  let mode: "system" | "light" | "dark" = "dark";
  let wantGlass = false;
  if (desktopApp.poracodePaths) {
    try {
      const settings = readSharedSettingsFile(desktopApp.poracodePaths.settingsPath);
      mode = settings.themeMode;
      wantGlass = settings.sidebarTranslucency === true;
    } catch {
      // Fall back to dark / opaque.
    }
  }
  return {
    appearance: resolveThemeMode(mode, nativeTheme.shouldUseDarkColors),
    sidebarTranslucency: wantGlass,
  };
}

export function quickComposerWindowFor(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window && window === desktopApp.quickComposerWindow && !window.isDestroyed()
    ? window
    : null;
}

export function flushTrayThreadOpen(): void {
  if (
    !(desktopApp.quickComposerLifecycle?.isMainReady() ?? false) ||
    !desktopApp.mainWindow ||
    desktopApp.mainWindow.isDestroyed() ||
    !desktopApp.pendingTrayThreadId
  )
    return;
  const threadId = desktopApp.pendingTrayThreadId;
  desktopApp.pendingTrayThreadId = null;
  desktopApp.mainWindow.webContents.send(IPC_EVENT_CHANNELS.threadOpenRequested, { threadId });
}

/**
 * Flush remote thread commands that arrived while no renderer window was
 * mounted. The renderer store applies (and persists) them exactly like live
 * mirrors; arrival order is preserved. TODO(Lane 1B, BackendDesktopServices):
 * once the backend applies thread commands DB-direct when it has no renderer
 * window (its `hasRendererWindow` is currently hardcoded `true`), commands
 * stop arriving here while zero-window and this queue stays permanently
 * empty — remove it then.
 */
export function flushPendingThreadCommands(): void {
  const window = desktopApp.mainWindow;
  if (!window || window.isDestroyed() || desktopApp.pendingThreadCommands.length === 0) return;
  const commands = desktopApp.pendingThreadCommands;
  desktopApp.pendingThreadCommands = [];
  for (const command of commands) {
    window.webContents.send(IPC_EVENT_CHANNELS.remoteThreadCommand, command);
  }
}

export function ensureMainWindow(
  showOnReady = true,
  stateOverride?: ShellStateStore,
): BrowserWindow {
  if (desktopApp.mainWindow && !desktopApp.mainWindow.isDestroyed()) return desktopApp.mainWindow;
  desktopApp.quickComposerLifecycle?.markMainNotReady();
  desktopApp.mainWindow = createMainAppWindow(showOnReady, stateOverride);
  desktopApp.browserPanelManager?.bindHost(desktopApp.mainWindow);
  return desktopApp.mainWindow;
}

export function openThreadFromTray(threadId: string): void {
  desktopApp.pendingTrayThreadId = threadId;
  showAndFocusWindow(ensureMainWindow());
  flushTrayThreadOpen();
}

export function finishQuickComposerDismiss(window: BrowserWindow): void {
  desktopApp.quickComposerLifecycle?.finishDismiss(window);
}

function requestQuickComposerDismiss(window: BrowserWindow): void {
  desktopApp.quickComposerLifecycle?.requestDismiss(window);
}

// Window options shared by every app-renderer window (main + quick composer);
// each factory adds only the fields distinct to its surface.
function commonAppWindowOptions() {
  return {
    title: getAppName(channel, isDev),
    isDev,
    channel,
    preloadPath: join(__dirname, "preload.cjs"),
    rendererHtmlPath: join(__dirname, "../renderer/index.html"),
    appVersion: app.getVersion(),
    posthogEnableDev,
    posthogEnabled,
    posthogHost,
    posthogKey,
    sentryEnabled: desktopApp.sentryEnabled,
    browserUserAgent: desktopApp.browserUserAgent,
    openDevTools: process.env.PORACODE_DISABLE_DEVTOOLS !== "1",
    ...(process.env.VITE_DEV_SERVER_URL ? { devServerUrl: process.env.VITE_DEV_SERVER_URL } : {}),
    ...(desktopApp.hostServices?.capabilities
      ? { hostCapabilities: desktopApp.hostServices.capabilities }
      : {}),
  };
}

function createQuickComposerAppWindow(): BrowserWindow {
  const window = createQuickComposerWindow({
    ...commonAppWindowOptions(),
    onClosed: () => {
      if (desktopApp.quickComposerWindow === window) desktopApp.quickComposerWindow = null;
    },
    onRendererProcessGone: (details, intent) => {
      captureRendererProcessGone(details, "quick-composer", intent);
    },
  });
  window.on("blur", () => {
    setTimeout(() => {
      if (
        !(desktopApp.quickComposerLifecycle?.isDialogOpen() ?? false) &&
        !window.isDestroyed() &&
        window.isVisible() &&
        !window.isFocused()
      ) {
        requestQuickComposerDismiss(window);
      }
    }, 0);
  });
  window.webContents.on("before-input-event", (event, input) => {
    if (input.key !== "Escape" || input.type !== "keyDown") return;
    event.preventDefault();
    requestQuickComposerDismiss(window);
  });
  return window;
}

export function toggleQuickComposerWindow(): void {
  desktopApp.quickComposerLifecycle?.toggle();
}

// One device lifecycle host for both modes: window factories, delivery, and
// dismissal effects are identical. Only main-window recreation differs —
// managed uses the backend shell store, attach binds its ephemeral shell
// state — so it is the single injected callback.
export function createQuickComposerLifecycleHost(
  ensureMainWindowForComposer: (showOnReady: boolean) => BrowserWindow,
): QuickComposerLifecycleHost {
  return {
    getMainWindow: () => desktopApp.mainWindow,
    getOverlay: () => desktopApp.quickComposerWindow,
    setOverlay: (window) => {
      desktopApp.quickComposerWindow = window;
    },
    createOverlay: () => createQuickComposerAppWindow(),
    ensureMainWindow: ensureMainWindowForComposer,
    showOverlay: (window) => showQuickComposerWindow(window),
    revealMainWindow: (window) => {
      if (window.webContents.isLoading()) {
        window.once("ready-to-show", () => showAndFocusWindow(window));
      } else {
        showAndFocusWindow(window);
      }
    },
    deliverSubmission: (window, submission) => {
      window.webContents.send(IPC_EVENT_CHANNELS.quickComposerSubmit, submission);
    },
    requestOverlayDismiss: (window) => {
      window.webContents.send(IPC_EVENT_CHANNELS.quickComposerDismissRequested);
    },
    hideOverlay: (window) => window.hide(),
    pickFiles: (owner) => showAddFilesDialog(owner),
  };
}

function createMainAppWindow(showOnReady = true, stateOverride?: ShellStateStore): BrowserWindow {
  const windowChrome = resolveWindowChromeOptions();
  let window: BrowserWindow;
  const closeLifecycle = createMainWindowCloseLifecycle({
    isQuitting: () => desktopApp.isQuitting,
    closeToTrayEnabled: isCloseToTrayEnabled,
    hide: () => window.hide(),
    markQuitting: () => {
      desktopApp.isQuitting = true;
    },
    quit: () => app.quit(),
  });
  window = createMainWindow({
    ...commonAppWindowOptions(),
    state: stateOverride ?? requireBackendStateStore(),
    windowChromeHeight: WINDOW_CHROME_HEIGHT,
    appearance: windowChrome.appearance,
    sidebarTranslucency: windowChrome.sidebarTranslucency,
    showOnReady,
    onClosed: () => {
      const wasMainWindow = desktopApp.mainWindow === window;
      if (wasMainWindow) {
        desktopApp.mainWindow = null;
        desktopApp.quickComposerLifecycle?.markMainNotReady();
        closeLifecycle.handleClosed();
      }
    },
    onClose: (event) => closeLifecycle.handleClose(event),
    onRendererProcessGone: (details, intent) => {
      captureRendererProcessGone(details, "renderer", intent);
    },
  });
  installMainRendererInvalidation(window.webContents, {
    isCurrent: () => desktopApp.mainWindow === window,
    invalidate: () => {
      desktopApp.quickComposerLifecycle?.markMainNotReady();
    },
  });
  return window;
}

export function focusBrowserExtractWindow(): void {
  if (!desktopApp.browserExtractWindow || desktopApp.browserExtractWindow.isDestroyed()) return;
  showAndFocusWindow(desktopApp.browserExtractWindow);
}

function revealBrowserInMainWindow(): void {
  if (desktopApp.mainWindow && !desktopApp.mainWindow.isDestroyed()) {
    showAndFocusWindow(desktopApp.mainWindow);
  }
  desktopApp.browserPanelManager?.notifyState();
  desktopApp.browserPanelManager?.revealPanel();
}

function createBrowserExtractWindow(): BrowserWindow {
  const windowChrome = resolveWindowChromeOptions();
  const window = createMainWindow({
    state: requireBackendStateStore(),
    title: `${getAppName(channel, isDev)} Browser`,
    windowKind: "browserExtract",
    boundsStateKey: "browser-extract-window-bounds",
    defaultWidth: 1120,
    defaultHeight: 760,
    minWidth: 520,
    minHeight: 420,
    isDev,
    channel,
    preloadPath: join(__dirname, "preload.cjs"),
    rendererHtmlPath: join(__dirname, "../renderer/index.html"),
    appVersion: app.getVersion(),
    posthogEnableDev,
    posthogEnabled,
    posthogHost,
    posthogKey,
    sentryEnabled: desktopApp.sentryEnabled,
    windowChromeHeight: WINDOW_CHROME_HEIGHT,
    browserUserAgent: desktopApp.browserUserAgent,
    appearance: windowChrome.appearance,
    sidebarTranslucency: windowChrome.sidebarTranslucency,
    openDevTools: false,
    ...(process.env.VITE_DEV_SERVER_URL ? { devServerUrl: process.env.VITE_DEV_SERVER_URL } : {}),
    onClosed: () => {
      desktopApp.browserExtractWindow = null;
      desktopApp.browserPanelManager?.notifyState();
      // Closing the window — whether via the OS controls or "bring back to
      // panel" (injectBrowserToMain) — returns the browser to the main window.
      if (!desktopApp.isQuitting) {
        revealBrowserInMainWindow();
      }
    },
    onRendererProcessGone: (details, intent) => {
      captureRendererProcessGone(details, "browser", intent);
    },
  });
  return window;
}

export function extractBrowserToWindow(): void {
  if (desktopApp.browserExtractWindow && !desktopApp.browserExtractWindow.isDestroyed()) {
    desktopApp.browserPanelManager?.notifyState();
    focusBrowserExtractWindow();
    return;
  }
  desktopApp.browserExtractWindow = createBrowserExtractWindow();
  // Bind the host (which emits state) only after `browserExtractWindow` is
  // assigned, so the snapshot's `extracted` flag reads true. Otherwise the main
  // window keeps showing its own browser until the next unrelated state emit.
  desktopApp.browserPanelManager?.bindHost(desktopApp.browserExtractWindow);
  focusBrowserExtractWindow();
}

export function injectBrowserToMain(): void {
  const window = desktopApp.browserExtractWindow;
  if (!window || window.isDestroyed()) {
    desktopApp.browserExtractWindow = null;
    revealBrowserInMainWindow();
    return;
  }
  // The window's `onClosed` handler returns the browser to the main window.
  window.close();
}
