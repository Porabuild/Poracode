import { dbGetState, dbSetState } from "../db";
import { BrowserWindow, screen, type RenderProcessGoneDetails } from "electron";
import type { LightcodeChannel } from "@/shared/channel";
import type { LightcodeWindowKind } from "@/shared/ipc";
import { installSessionPermissions } from "../browser/permissions";
import { supportsNativeWindowMaterial, syncNativeThemeForMaterial } from "./windowMaterial";

interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

function getSavedWindowBounds(stateKey: string): WindowBounds | null {
  try {
    const raw = dbGetState(stateKey);
    if (!raw) {
      return null;
    }
    const bounds = JSON.parse(raw) as WindowBounds;
    if (typeof bounds.width !== "number" || typeof bounds.height !== "number") {
      return null;
    }
    if (typeof bounds.x === "number" && typeof bounds.y === "number") {
      const rect = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      const display = screen.getDisplayMatching(rect);
      const { x: dx, y: dy, width: dw, height: dh } = display.workArea;
      const overlapX = Math.max(0, Math.min(rect.x + rect.width, dx + dw) - Math.max(rect.x, dx));
      const overlapY = Math.max(0, Math.min(rect.y + rect.height, dy + dh) - Math.max(rect.y, dy));
      if (overlapX < 50 || overlapY < 50) {
        return {
          width: bounds.width,
          height: bounds.height,
          isMaximized: bounds.isMaximized,
        };
      }
    }
    return bounds;
  } catch {
    return null;
  }
}

function saveWindowBounds(window: BrowserWindow, stateKey: string): void {
  const isMaximized = window.isMaximized();
  const { x, y, width, height } = window.getNormalBounds();
  dbSetState(stateKey, JSON.stringify({ x, y, width, height, isMaximized }));
}

export interface CreateMainWindowOptions {
  title: string;
  windowKind?: LightcodeWindowKind;
  boundsStateKey?: string | null;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  isDev: boolean;
  channel: LightcodeChannel;
  preloadPath: string;
  rendererHtmlPath: string;
  appVersion: string;
  posthogEnableDev: boolean;
  posthogEnabled: boolean;
  posthogHost: string;
  posthogKey: string;
  sentryEnabled: boolean;
  windowChromeHeight: number;
  browserUserAgent: string;
  /** Saved appearance, so the native window opens matching the theme. */
  appearance: "light" | "dark";
  /** Saved opt-in translucent ("liquid glass") sidebar, so the window opens with the material already applied. */
  sidebarTranslucency: boolean;
  onClosed(): void;
  onClose?: (event: Electron.Event) => void;
  onRendererProcessGone?: (details: RenderProcessGoneDetails) => void;
  devServerUrl?: string;
  openDevTools?: boolean;
}

export function createMainWindow(options: CreateMainWindowOptions): BrowserWindow {
  const boundsStateKey =
    options.boundsStateKey === undefined ? "window-bounds" : options.boundsStateKey;
  const saved = boundsStateKey ? getSavedWindowBounds(boundsStateKey) : null;
  const supportsTitleBarOverlay = process.platform === "win32" || process.platform === "linux";
  const isDark = options.appearance === "dark";
  // Base bg/symbol per appearance, matching styles.css and the runtime
  // setWindowChrome values, so the first frame doesn't flash a fixed palette.
  const backgroundColor = isDark ? "#070709" : "#f1f1f4";
  const symbolColor = isDark ? "#fafafa" : "#1f2937";
  // macOS: always create the window transparent + vibrancy-capable so the glass
  // sidebar can be toggled live (the renderer reveals/hides it purely via CSS —
  // with glass off the opaque content simply covers the material). macOS can't
  // turn an opaque window transparent at runtime, so the capability has to exist
  // from creation. Windows acrylic is applied here for a flash-free first paint
  // when glass is already on, and toggled live via setBackgroundMaterial.
  const isMacOS = process.platform === "darwin";
  const winGlassAtStart =
    process.platform === "win32" && options.sidebarTranslucency && supportsNativeWindowMaterial();
  if (options.sidebarTranslucency && supportsNativeWindowMaterial()) {
    // Match the native appearance to the app theme so the material renders in the
    // right light/dark variant from the first frame.
    syncNativeThemeForMaterial(options.appearance);
  }
  const window = new BrowserWindow({
    title: options.title,
    show: false,
    width: saved?.width ?? options.defaultWidth ?? 1460,
    height: saved?.height ?? options.defaultHeight ?? 920,
    ...(saved?.x != null && saved?.y != null ? { x: saved.x, y: saved.y } : {}),
    minWidth: options.minWidth ?? 540,
    minHeight: options.minHeight ?? 720,
    backgroundColor: isMacOS || winGlassAtStart ? "#00000000" : backgroundColor,
    autoHideMenuBar: true,
    ...(isMacOS
      ? { vibrancy: "sidebar" as const, visualEffectState: "active" as const, transparent: true }
      : {}),
    ...(winGlassAtStart ? { backgroundMaterial: "acrylic" as const } : {}),
    ...(supportsTitleBarOverlay
      ? {
          titleBarStyle: "hidden" as const,
          titleBarOverlay: {
            color: "#00000000",
            symbolColor,
            height: options.windowChromeHeight,
          },
        }
      : {
          titleBarStyle: "hiddenInset" as const,
        }),
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      additionalArguments: [
        `--lc-app-version=${encodeURIComponent(options.appVersion)}`,
        `--lc-is-dev=${options.isDev ? "1" : "0"}`,
        `--lc-window-kind=${options.windowKind ?? "main"}`,
        `--lc-channel=${options.channel}`,
        `--lc-posthog-enable-dev=${options.posthogEnableDev ? "1" : "0"}`,
        `--lc-posthog-enabled=${options.posthogEnabled ? "1" : "0"}`,
        // PostHog project keys are browser/client keys, not secrets; the renderer must send them.
        `--lc-posthog-host=${encodeURIComponent(options.posthogHost)}`,
        `--lc-posthog-key=${encodeURIComponent(options.posthogKey)}`,
        `--lc-sentry-enabled=${options.sentryEnabled ? "1" : "0"}`,
      ],
    },
  });
  installSessionPermissions(window.webContents.session);
  window.webContents.setUserAgent(options.browserUserAgent);

  // Lock the privileged top frame to the app's own origin. The main renderer
  // holds the full `lightcode` preload bridge (DB, file pickers, openExternal,
  // supervisor RPC); if it could be navigated to a remote origin, that page
  // would inherit the bridge. External links are opened via IPC/openExternal,
  // so the renderer never legitimately performs a top-level navigation away
  // from itself or opens new windows.
  const isAllowedAppUrl = (target: string): boolean => {
    try {
      const url = new URL(target);
      if (options.isDev && options.devServerUrl) {
        return url.origin === new URL(options.devServerUrl).origin || url.protocol === "file:";
      }
      return url.protocol === "file:";
    } catch {
      return false;
    }
  };
  const blockOffAppNavigation = (event: Electron.Event, target: string): void => {
    if (!isAllowedAppUrl(target)) {
      console.warn(`[lightcode] blocked navigation to off-app URL: ${target}`);
      event.preventDefault();
    }
  };
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", blockOffAppNavigation);
  window.webContents.on("will-redirect", blockOffAppNavigation);
  // `webviewTag` is enabled for the in-app browser; the embedding renderer
  // controls each <webview>'s attributes, so enforce that no webview can
  // request a preload or Node access regardless of what markup is injected.
  window.webContents.on("will-attach-webview", (_event, webPreferences) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
  });

  window.once("ready-to-show", () => {
    if (saved?.isMaximized) {
      window.maximize();
    }
    window.show();
  });

  const loadRenderer = () => {
    if (options.isDev) {
      void window.loadURL(options.devServerUrl as string);
    } else {
      void window.loadFile(options.rendererHtmlPath);
    }
  };

  loadRenderer();
  if (options.isDev && options.openDevTools !== false) {
    window.webContents.openDevTools({ mode: "detach" });
  }

  let lastReloadAt = 0;
  let reloadCount = 0;
  window.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason === "clean-exit" || window.isDestroyed()) {
      return;
    }
    console.error(
      `[lightcode] renderer gone: reason=${details.reason} exitCode=${details.exitCode}`,
    );
    options.onRendererProcessGone?.(details);
    const now = Date.now();
    if (now - lastReloadAt < 5_000) {
      reloadCount += 1;
    } else {
      reloadCount = 1;
    }
    lastReloadAt = now;
    if (reloadCount > 3) {
      console.error("[lightcode] renderer gone too many times in a row, not reloading");
      return;
    }
    loadRenderer();
  });

  let boundsTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedSave = () => {
    if (boundsTimer) {
      clearTimeout(boundsTimer);
    }
    if (boundsStateKey) {
      boundsTimer = setTimeout(() => saveWindowBounds(window, boundsStateKey), 500);
    }
  };
  window.on("resize", debouncedSave);
  window.on("move", debouncedSave);
  window.on("maximize", debouncedSave);
  window.on("unmaximize", debouncedSave);
  window.on("close", (event) => {
    if (boundsTimer) {
      clearTimeout(boundsTimer);
    }
    if (boundsStateKey) {
      saveWindowBounds(window, boundsStateKey);
    }
    options.onClose?.(event);
  });
  window.on("closed", options.onClosed);

  return window;
}
