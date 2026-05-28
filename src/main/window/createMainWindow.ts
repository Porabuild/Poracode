import { dbGetState, dbSetState } from "../db";
import { BrowserWindow, screen, type RenderProcessGoneDetails } from "electron";
import type { LightcodeChannel } from "@/shared/channel";
import { installSessionPermissions } from "../browser/permissions";

interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

function getSavedWindowBounds(): WindowBounds | null {
  try {
    const raw = dbGetState("window-bounds");
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

function saveWindowBounds(window: BrowserWindow): void {
  const isMaximized = window.isMaximized();
  const { x, y, width, height } = window.getNormalBounds();
  dbSetState("window-bounds", JSON.stringify({ x, y, width, height, isMaximized }));
}

export interface CreateMainWindowOptions {
  title: string;
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
  onClosed(): void;
  onClose?: (event: Electron.Event) => void;
  onRendererProcessGone?: (details: RenderProcessGoneDetails) => void;
  devServerUrl?: string;
}

export function createMainWindow(options: CreateMainWindowOptions): BrowserWindow {
  const saved = getSavedWindowBounds();
  const supportsTitleBarOverlay = process.platform === "win32" || process.platform === "linux";
  const window = new BrowserWindow({
    title: options.title,
    show: false,
    width: saved?.width ?? 1460,
    height: saved?.height ?? 920,
    ...(saved?.x != null && saved?.y != null ? { x: saved.x, y: saved.y } : {}),
    minWidth: 540,
    minHeight: 720,
    backgroundColor: "#1c1f24",
    autoHideMenuBar: true,
    ...(supportsTitleBarOverlay
      ? {
          titleBarStyle: "hidden" as const,
          titleBarOverlay: {
            color: "#00000000",
            symbolColor: "#f8fafc",
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
  if (options.isDev) {
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
    boundsTimer = setTimeout(() => saveWindowBounds(window), 500);
  };
  window.on("resize", debouncedSave);
  window.on("move", debouncedSave);
  window.on("maximize", debouncedSave);
  window.on("unmaximize", debouncedSave);
  window.on("close", (event) => {
    if (boundsTimer) {
      clearTimeout(boundsTimer);
    }
    saveWindowBounds(window);
    options.onClose?.(event);
  });
  window.on("closed", options.onClosed);

  return window;
}
