import { BrowserWindow, globalShortcut, screen, type Display } from "electron";
import {
  ComputerUseActivityTracker,
  type ComputerUseActivityState,
} from "./ComputerUseActivityTracker";
import type { ComputerUseActivityEvent } from "./ComputerUseMcpIngress";
import {
  COMPUTER_USE_OVERLAY_TITLE,
  TAKEOVER_OVERLAY_URL,
  createBadgeOverlayUrl,
} from "./ComputerUseOverlayHtml";

export const COMPUTER_USE_OVERLAY_RELEASE_DELAY_MS = 5_000;

const ESCAPE_ACCELERATOR = "Escape";

function badgeDisplayId(
  displays: readonly Display[],
  targetBounds: ComputerUseActivityState["badgeTargetBounds"],
): number | undefined {
  if (!targetBounds) return screen.getPrimaryDisplay().id;
  const dipBounds =
    process.platform === "win32" ? screen.screenToDipRect(null, targetBounds) : targetBounds;
  const matching = screen.getDisplayMatching(dipBounds);
  return displays.find((display) => display.id === matching.id)?.id ?? displays[0]?.id;
}

interface OverlayWindow {
  contentKey: string;
  loaded: boolean;
  window: BrowserWindow;
}

export interface ComputerUseDesktopOverlayOptions {
  onExit(threadIds: string[]): void;
}

export class ComputerUseDesktopOverlay {
  private readonly tracker: ComputerUseActivityTracker;
  private state: ComputerUseActivityState = {
    escapeEnabled: false,
    level: "hidden",
    threadIds: [],
  };
  private readonly windows = new Map<number, OverlayWindow>();
  private escapeRegistered = false;
  private disposed = false;

  constructor(private readonly options: ComputerUseDesktopOverlayOptions) {
    this.tracker = new ComputerUseActivityTracker({
      releaseDelayMs: COMPUTER_USE_OVERLAY_RELEASE_DELAY_MS,
      onChange: (state) => {
        this.state = state;
        this.applyState();
      },
    });
  }

  setActivity(event: ComputerUseActivityEvent): void {
    if (!this.disposed) this.tracker.setActivity(event);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.tracker.clear();
    for (const overlay of this.windows.values()) {
      if (!overlay.window.isDestroyed()) overlay.window.destroy();
    }
    this.windows.clear();
  }

  private applyState(): void {
    if (this.state.level === "hidden") this.hide();
    else this.show();
    this.syncEscapeShortcut();
  }

  private show(): void {
    const displays = screen.getAllDisplays();
    this.removeMissingDisplays(displays);
    const visibleDisplayIds = new Set(
      this.state.level === "takeover"
        ? displays.map((display) => display.id)
        : [badgeDisplayId(displays, this.state.badgeTargetBounds)].filter(
            (id): id is number => id !== undefined,
          ),
    );
    for (const display of displays) {
      const existing = this.windows.get(display.id);
      if (!visibleDisplayIds.has(display.id)) {
        if (existing && !existing.window.isDestroyed()) {
          existing.contentKey = "";
          existing.loaded = false;
          existing.window.hide();
        }
        continue;
      }
      const overlay = existing ?? this.createWindow(display);
      // The takeover border frames the whole display; the badge is anchored to
      // the top of its window, so it uses the work area to stay clear of the
      // macOS menu bar and the focused app's title bar.
      overlay.window.setBounds(this.state.level === "takeover" ? display.bounds : display.workArea);
      this.updateContent(overlay);
      if (overlay.loaded && !overlay.window.isVisible()) overlay.window.showInactive();
    }
  }

  private createWindow(display: Display): OverlayWindow {
    const window = new BrowserWindow({
      ...display.bounds,
      transparent: true,
      backgroundColor: "#00000000",
      frame: false,
      focusable: false,
      fullscreenable: false,
      hasShadow: false,
      maximizable: false,
      minimizable: false,
      movable: false,
      resizable: false,
      skipTaskbar: true,
      show: false,
      title: COMPUTER_USE_OVERLAY_TITLE,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const overlay: OverlayWindow = { contentKey: "", loaded: false, window };
    this.windows.set(display.id, overlay);
    window.setAlwaysOnTop(true, "screen-saver");
    window.setContentProtection(true);
    window.setIgnoreMouseEvents(true);
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.on("closed", () => {
      if (this.windows.get(display.id)?.window === window) this.windows.delete(display.id);
    });
    return overlay;
  }

  private updateContent(overlay: OverlayWindow): void {
    const contentKey = `${this.state.level}:${this.state.badgeTarget ?? ""}`;
    if (overlay.contentKey === contentKey) return;
    overlay.contentKey = contentKey;
    overlay.loaded = false;
    const url =
      this.state.level === "takeover"
        ? TAKEOVER_OVERLAY_URL
        : createBadgeOverlayUrl(this.state.badgeTarget);
    void overlay.window
      .loadURL(url)
      .then(() => {
        if (overlay.contentKey !== contentKey) return;
        overlay.loaded = true;
        if (!this.disposed && this.state.level !== "hidden" && !overlay.window.isDestroyed()) {
          overlay.window.showInactive();
        }
      })
      .catch((error: unknown) => {
        if (overlay.contentKey !== contentKey) return;
        overlay.contentKey = "";
        overlay.loaded = false;
        // Degrade to no overlay rather than leaving the previous level's
        // content on screen (a stale badge during a takeover would understate
        // what the agent is doing).
        if (!overlay.window.isDestroyed()) overlay.window.hide();
        console.error("[computer-use] failed to load desktop activity overlay", error);
      });
  }

  private removeMissingDisplays(displays: Display[]): void {
    const displayIds = new Set(displays.map((display) => display.id));
    for (const [displayId, overlay] of this.windows) {
      if (displayIds.has(displayId)) continue;
      this.windows.delete(displayId);
      if (!overlay.window.isDestroyed()) overlay.window.destroy();
    }
  }

  private hide(): void {
    this.unregisterEscape();
    for (const overlay of this.windows.values()) {
      if (!overlay.window.isDestroyed()) overlay.window.hide();
    }
  }

  private syncEscapeShortcut(): void {
    if (this.state.escapeEnabled === this.escapeRegistered) return;
    if (!this.state.escapeEnabled) {
      this.unregisterEscape();
      return;
    }
    this.escapeRegistered = globalShortcut.register(ESCAPE_ACCELERATOR, () => {
      const threadIds = this.state.threadIds;
      this.tracker.clear();
      this.options.onExit(threadIds);
    });
  }

  private unregisterEscape(): void {
    if (!this.escapeRegistered) return;
    globalShortcut.unregister(ESCAPE_ACCELERATOR);
    this.escapeRegistered = false;
  }
}
