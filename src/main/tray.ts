import { join } from "node:path";
import { existsSync } from "node:fs";
import { Menu, Tray, app, nativeImage, type MenuItemConstructorOptions } from "electron";
import type { PoracodeChannel } from "@/shared/channel";

interface CreateTrayOptions {
  channel: PoracodeChannel;
  appName: string;
  onShow(): void;
  onQuickComposer?(): void;
  onQuit(): void;
}

export interface TrayHandle {
  readonly available: boolean;
  destroy(): void;
  setQuickComposerShortcut(shortcut: string | null): void;
}

export function resolveTrayIconPath(channel: PoracodeChannel): string | null {
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
  const { appName, onShow, onQuickComposer, onQuit, channel } = options;
  let quickComposerShortcut: string | null = null;
  const iconPath = resolveTrayIconPath(channel);
  if (!iconPath) {
    console.warn("[poracode] Tray icon not found; skipping tray creation.");
    return { available: false, destroy: () => {}, setQuickComposerShortcut: () => {} };
  }
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    console.warn(`[poracode] Tray icon is empty: ${iconPath}`);
    return { available: false, destroy: () => {}, setQuickComposerShortcut: () => {} };
  }
  const trayImage = process.platform === "darwin" ? image.resize({ width: 18, height: 18 }) : image;
  const tray = new Tray(trayImage);
  tray.setToolTip(appName);

  const rebuildMenu = () => {
    const template: MenuItemConstructorOptions[] = [
      ...(onQuickComposer
        ? [
            {
              label: quickComposerShortcut
                ? `Quick Composer (${quickComposerShortcut})`
                : "Quick Composer",
              click: onQuickComposer,
            },
            { type: "separator" as const },
          ]
        : []),
      {
        label: `Show ${appName}`,
        click: onShow,
      },
      { type: "separator" },
      {
        label: `Quit ${appName}`,
        click: onQuit,
      },
    ];
    const menu = Menu.buildFromTemplate(template);
    tray.setContextMenu(menu);
  };

  rebuildMenu();

  tray.on("click", onShow);
  // Windows convention: double-click opens the window.
  tray.on("double-click", onShow);

  return {
    available: true,
    destroy: () => {
      tray.destroy();
    },
    setQuickComposerShortcut: (shortcut) => {
      quickComposerShortcut = shortcut;
      rebuildMenu();
    },
  };
}
