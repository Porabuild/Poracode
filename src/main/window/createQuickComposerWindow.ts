import { BrowserWindow, screen, type RenderProcessGoneDetails } from "electron";
import type { LightcodeChannel } from "@/shared/channel";
import { installSessionPermissions } from "../browser/permissions";
import { buildRendererArgs } from "./rendererArgs";

const COLLAPSED_WIDTH = 720;
const COLLAPSED_HEIGHT = 236;
const EXPANDED_WIDTH = 920;
const EXPANDED_HEIGHT = 700;

export interface CreateQuickComposerWindowOptions {
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
  onClosed(): void;
  onRendererProcessGone?: (details: RenderProcessGoneDetails) => void;
  devServerUrl?: string;
}

export function createQuickComposerWindow(
  options: CreateQuickComposerWindowOptions,
): BrowserWindow {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;
  const window = new BrowserWindow({
    title: `${options.title} Quick Composer`,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    width: COLLAPSED_WIDTH,
    height: COLLAPSED_HEIGHT,
    x: Math.round(x + (width - COLLAPSED_WIDTH) / 2),
    y: Math.round(y + Math.max(24, height * 0.16)),
    backgroundColor: "#00000000",
    hasShadow: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      additionalArguments: buildRendererArgs("quickOverlay", options),
    },
  });
  installSessionPermissions(window.webContents.session);

  window.once("ready-to-show", () => {
    window.show();
    window.focus();
  });

  const loadRenderer = () => {
    if (options.isDev) {
      void window.loadURL(options.devServerUrl as string);
    } else {
      void window.loadFile(options.rendererHtmlPath);
    }
  };

  loadRenderer();

  let lastReloadAt = 0;
  let reloadCount = 0;
  window.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason === "clean-exit" || window.isDestroyed()) {
      return;
    }
    console.error(
      `[lightcode] quick composer renderer gone: reason=${details.reason} exitCode=${details.exitCode}`,
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
      console.error("[lightcode] quick composer renderer gone too many times, not reloading");
      return;
    }
    loadRenderer();
  });

  window.on("closed", options.onClosed);

  return window;
}

export function setQuickComposerWindowExpanded(window: BrowserWindow, expanded: boolean): void {
  if (window.isDestroyed()) return;
  const targetWidth = expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH;
  const targetHeight = expanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
  const bounds = window.getBounds();
  window.setBounds(
    {
      x: Math.round(bounds.x + (bounds.width - targetWidth) / 2),
      y: bounds.y,
      width: targetWidth,
      height: targetHeight,
    },
    true,
  );
}
