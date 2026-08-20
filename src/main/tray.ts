import { join } from "node:path";
import { existsSync } from "node:fs";
import {
  Menu,
  Tray,
  app,
  nativeImage,
  nativeTheme,
  type MenuItemConstructorOptions,
  type NativeImage,
} from "electron";
import type { PoracodeChannel } from "@/shared/channel";
import type { Project, Thread } from "@/shared/contracts";

const RECENT_THREAD_LIMIT = 3;
const MAX_MENU_LABEL_LENGTH = 48;
const MAX_MENU_CONTEXT_LENGTH = 32;
const MAX_COMBINED_MENU_LABEL_LENGTH = 72;
const MENU_REFRESH_DELAY_MS = 25;

interface CreateTrayOptions {
  channel: PoracodeChannel;
  appName: string;
  getProjects?(): readonly Project[];
  getThreads?(): readonly Thread[];
  onOpenThread?(threadId: string): void;
  onShow(): void;
  onQuickComposer?(): void;
  onQuit(): void;
}

export interface TrayHandle {
  readonly available: boolean;
  destroy(): void;
  refreshMenu(): void;
  setQuickComposerShortcut(shortcut: string | null): void;
}

interface TrayThreadItem {
  id: string;
  label: string;
}

function truncateMenuLabel(label: string, limit = MAX_MENU_LABEL_LENGTH): string {
  if (label.length <= limit) return label;
  return `${label.slice(0, limit - 1)}…`;
}

function toMenuItem(
  item: TrayThreadItem,
  onOpenThread: (threadId: string) => void,
): MenuItemConstructorOptions {
  return {
    label: item.label,
    click: () => onOpenThread(item.id),
  };
}

export function resolveTrayIconPath(
  channel: PoracodeChannel,
  darkShell: boolean = nativeTheme.shouldUseDarkColors,
): string | null {
  const suffix = channel === "nightly" ? "-nightly" : "";
  const buildDir = join(__dirname, "..", "..", "build");
  const candidates: string[] = [];
  if (process.platform === "win32") {
    // Windows draws the tray glyph straight onto the taskbar, so the glyph must
    // contrast the shell theme: the default ICO carries the moon glyph for dark
    // shells, the `-dark` variant the ink glyph for light ones.
    const names = darkShell
      ? [`tray-icon${suffix}.ico`, "tray-icon.ico"]
      : [`tray-icon${suffix}-dark.ico`, `tray-icon${suffix}.ico`, "tray-icon.ico"];
    const dir = app.isPackaged ? process.resourcesPath : buildDir;
    for (const name of new Set(names)) candidates.push(join(dir, name));
  } else if (process.platform === "darwin") {
    // macOS menu bar: prefer the monochrome template glyph, then the full tile.
    if (app.isPackaged) {
      candidates.push(join(process.resourcesPath, "tray-icon-mac.png"));
      candidates.push(join(process.resourcesPath, "app-icon.png"));
    } else {
      candidates.push(join(buildDir, "tray-icon-mac.png"));
      candidates.push(join(buildDir, `icon${suffix}.png`));
      candidates.push(join(buildDir, "icon.png"));
    }
  } else {
    if (app.isPackaged) {
      candidates.push(join(process.resourcesPath, "app-icon.png"));
    } else {
      candidates.push(join(buildDir, `icon${suffix}.png`));
      candidates.push(join(buildDir, "icon.png"));
    }
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function createTray(options: CreateTrayOptions): TrayHandle {
  const {
    appName,
    getProjects,
    getThreads,
    onOpenThread,
    onShow,
    onQuickComposer,
    onQuit,
    channel,
  } = options;
  let quickComposerShortcut: string | null = null;
  let menuKey: string | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const trayImageFrom = (path: string): NativeImage | null => {
    const image = nativeImage.createFromPath(path);
    if (image.isEmpty()) return null;
    if (process.platform === "darwin" && path.endsWith("tray-icon-mac.png")) {
      // Template images are tinted per menu-bar appearance and auto-scaled by macOS;
      // resizing would drop the @2x representation.
      image.setTemplateImage(true);
    } else if (process.platform === "darwin") {
      return image.resize({ width: 18, height: 18 });
    }
    return image;
  };
  const iconPath = resolveTrayIconPath(channel);
  const trayImage = iconPath ? trayImageFrom(iconPath) : null;
  if (!trayImage) {
    console.warn(
      iconPath
        ? `[poracode] Tray icon is empty: ${iconPath}`
        : "[poracode] Tray icon not found; skipping tray creation.",
    );
    return {
      available: false,
      destroy: () => {},
      refreshMenu: () => {},
      setQuickComposerShortcut: () => {},
    };
  }
  const tray = new Tray(trayImage);
  tray.setToolTip(appName);

  // Windows has no template-image equivalent — the glyph color is baked into the
  // ICO, so swap it when the shell theme flips (white-on-white otherwise). macOS
  // tints the template image natively; Linux uses the opaque tile.
  const onThemeUpdated = () => {
    const nextPath = resolveTrayIconPath(channel);
    const nextImage = nextPath ? trayImageFrom(nextPath) : null;
    if (nextImage) tray.setImage(nextImage);
  };
  if (process.platform === "win32") nativeTheme.on("updated", onThemeUpdated);

  const rebuildMenu = () => {
    const projectNames = new Map(
      (getProjects?.() ?? []).map((project) => [project.id, project.name]),
    );
    const threads = [...(getThreads?.() ?? [])]
      .filter((thread) => !thread.archived && !thread.done)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const threadItems = threads.map((thread) => {
      const context = thread.worktreeBranch ?? projectNames.get(thread.projectId);
      const contextLabel = context
        ? truncateMenuLabel(context, MAX_MENU_CONTEXT_LENGTH)
        : undefined;
      const titleLimit = contextLabel
        ? Math.max(16, MAX_COMBINED_MENU_LABEL_LENGTH - contextLabel.length - 3)
        : MAX_MENU_LABEL_LENGTH;
      const title = truncateMenuLabel(thread.title, titleLimit);
      return {
        id: thread.id,
        label: contextLabel ? `${title} — ${contextLabel}` : title,
        unread: thread.status === "finished",
      };
    });
    const unreadItems = threadItems.filter((item) => item.unread);
    const recentItems = threadItems.filter((item) => !item.unread);
    const nextMenuKey = JSON.stringify({ quickComposerShortcut, unreadItems, recentItems });
    if (nextMenuKey === menuKey) return;
    menuKey = nextMenuKey;

    const template: MenuItemConstructorOptions[] = [];
    if (onOpenThread && unreadItems.length > 0) {
      template.push(
        { label: "Unread", enabled: false },
        ...unreadItems.map((item) => toMenuItem(item, onOpenThread)),
      );
    }
    if (onOpenThread && recentItems.length > 0) {
      if (template.length > 0) template.push({ type: "separator" });
      template.push(
        { label: "Recent", enabled: false },
        ...recentItems.slice(0, RECENT_THREAD_LIMIT).map((item) => toMenuItem(item, onOpenThread)),
      );
      const overflow = recentItems.slice(RECENT_THREAD_LIMIT);
      if (overflow.length > 0) {
        template.push({
          label: "More",
          submenu: overflow.map((item) => toMenuItem(item, onOpenThread)),
        });
      }
    }
    if (template.length > 0) template.push({ type: "separator" });
    if (onQuickComposer) {
      template.push(
        {
          label: quickComposerShortcut ? `New Task (${quickComposerShortcut})` : "New Task",
          click: onQuickComposer,
        },
        { type: "separator" },
      );
    }
    template.push(
      {
        label: `Open ${appName}`,
        click: onShow,
      },
      { type: "separator" },
      {
        label: "Exit",
        click: onQuit,
      },
    );
    const menu = Menu.buildFromTemplate(template);
    tray.setContextMenu(menu);
  };

  const refreshMenu = () => {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      rebuildMenu();
    }, MENU_REFRESH_DELAY_MS);
  };

  rebuildMenu();

  tray.on("click", onShow);
  // Windows convention: double-click opens the window.
  tray.on("double-click", onShow);

  return {
    available: true,
    destroy: () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (process.platform === "win32") nativeTheme.removeListener("updated", onThemeUpdated);
      tray.destroy();
    },
    refreshMenu,
    setQuickComposerShortcut: (shortcut) => {
      quickComposerShortcut = shortcut;
      rebuildMenu();
    },
  };
}
