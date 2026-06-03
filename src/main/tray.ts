import { join } from "node:path";
import { existsSync } from "node:fs";
import { Menu, Tray, app, nativeImage, type BrowserWindow } from "electron";
import type { LightcodeChannel } from "@/shared/channel";
import { showAndFocusWindow } from "./window/showAndFocusWindow";

interface CreateTrayOptions {
  window: BrowserWindow;
  channel: LightcodeChannel;
  appName: string;
  onQuit(): void;
}

export interface TrayHandle {
  destroy(): void;
}

export function resolveTrayIconPath(channel: LightcodeChannel): string | null {
  const suffix = channel === "nightly" ? "-nightly" : "";
  const candidates: string[] = [];
  if (app.isPackaged) {
    candidates.push(join(process.resourcesPath, "app-icon.png"));
  } else {
    candidates.push(join(__dirname, "..", "..", "build", `icon${suffix}.png`));
    candidates.push(join(__dirname, "..", "..", "build", "icon.png"));
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function createTray(options: CreateTrayOptions): TrayHandle {
  const { window, appName, onQuit, channel } = options;
  const iconPath = resolveTrayIconPath(channel);
  if (!iconPath) {
    console.warn("[lightcode] Tray icon not found; skipping tray creation.");
    return { destroy: () => {} };
  }
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    console.warn(`[lightcode] Tray icon is empty: ${iconPath}`);
    return { destroy: () => {} };
  }
  const trayImage = process.platform === "darwin" ? image.resize({ width: 18, height: 18 }) : image;
  const tray = new Tray(trayImage);
  tray.setToolTip(appName);

  const showWindow = () => showAndFocusWindow(window);

  const rebuildMenu = () => {
    const menu = Menu.buildFromTemplate([
      {
        label: `Show ${appName}`,
        click: showWindow,
      },
      { type: "separator" },
      {
        label: `Quit ${appName}`,
        click: onQuit,
      },
    ]);
    tray.setContextMenu(menu);
  };

  rebuildMenu();

  tray.on("click", showWindow);
  // Windows convention: double-click opens the window.
  tray.on("double-click", showWindow);

  return {
    destroy: () => {
      tray.destroy();
    },
  };
}
