import { BrowserWindow, globalShortcut, screen, type Display } from "electron";
import type { ComputerUseActivityEvent } from "./ComputerUseMcpIngress";
import { isKeyChordToolName } from "./mcp/toolRegistry";

export const COMPUTER_USE_OVERLAY_RELEASE_DELAY_MS = 500;

const ESCAPE_ACCELERATOR = "Escape";
const OVERLAY_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="color-scheme" content="dark">
    <title>Computer Use Overlay</title>
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      body {
        background: rgba(8, 12, 20, 0.08);
        box-shadow:
          inset 0 0 0 3px rgba(92, 167, 255, 0.95),
          inset 0 0 24px rgba(92, 167, 255, 0.2);
      }
      .badge {
        position: fixed;
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        padding: 8px 14px;
        border: 1px solid rgba(92, 167, 255, 0.7);
        border-top: 0;
        border-radius: 0 0 12px 12px;
        background: rgba(8, 12, 20, 0.92);
        color: #f7f9fc;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
        font: 600 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        white-space: nowrap;
      }
    </style>
  </head>
  <body>
    <div class="badge">Poracode using your computer | Esc to Exit</div>
  </body>
</html>`;
const OVERLAY_URL = `data:text/html;charset=utf-8,${encodeURIComponent(OVERLAY_HTML)}`;

interface OverlayWindow {
  loaded: boolean;
  window: BrowserWindow;
}

export interface ComputerUseDesktopOverlayOptions {
  onExit(threadIds: string[]): void;
}

export class ComputerUseDesktopOverlay {
  private readonly activeThreads = new Set<string>();
  private readonly activeCalls = new Map<string, number>();
  private escapeSuppressedCalls = 0;
  private readonly releaseTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly windows = new Map<number, OverlayWindow>();
  private escapeRegistered = false;
  private visible = false;
  private disposed = false;

  constructor(private readonly options: ComputerUseDesktopOverlayOptions) {}

  setActivity(event: ComputerUseActivityEvent): void {
    if (this.disposed) return;
    const releaseTimer = this.releaseTimers.get(event.threadId);
    if (releaseTimer) {
      clearTimeout(releaseTimer);
      this.releaseTimers.delete(event.threadId);
    }

    if (event.active) {
      this.activeCalls.set(event.threadId, (this.activeCalls.get(event.threadId) ?? 0) + 1);
      this.activeThreads.add(event.threadId);
      if (isKeyChordToolName(event.toolName)) this.escapeSuppressedCalls += 1;
      this.show();
      this.syncEscapeShortcut();
      return;
    }

    const activeCalls = Math.max(0, (this.activeCalls.get(event.threadId) ?? 1) - 1);
    if (activeCalls > 0) this.activeCalls.set(event.threadId, activeCalls);
    else this.activeCalls.delete(event.threadId);
    if (isKeyChordToolName(event.toolName)) {
      this.escapeSuppressedCalls = Math.max(0, this.escapeSuppressedCalls - 1);
    }
    this.syncEscapeShortcut();
    if (!this.activeThreads.has(event.threadId) || activeCalls > 0) return;
    this.releaseTimers.set(
      event.threadId,
      setTimeout(() => {
        this.releaseTimers.delete(event.threadId);
        this.activeThreads.delete(event.threadId);
        if (this.activeThreads.size === 0) this.hide();
      }, COMPUTER_USE_OVERLAY_RELEASE_DELAY_MS),
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearActivity();
    for (const overlay of this.windows.values()) {
      if (!overlay.window.isDestroyed()) overlay.window.destroy();
    }
    this.windows.clear();
  }

  private show(): void {
    if (this.visible) return;
    this.visible = true;
    const displays = screen.getAllDisplays();
    this.removeMissingDisplays(displays);
    for (const display of displays) {
      const overlay = this.windows.get(display.id) ?? this.createWindow(display);
      overlay.window.setBounds(display.bounds);
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
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const overlay: OverlayWindow = { loaded: false, window };
    this.windows.set(display.id, overlay);
    window.setAlwaysOnTop(true, "screen-saver");
    window.setIgnoreMouseEvents(true);
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.on("closed", () => {
      if (this.windows.get(display.id)?.window === window) this.windows.delete(display.id);
    });
    void window.loadURL(OVERLAY_URL).then(() => {
      overlay.loaded = true;
      if (!this.disposed && this.activeThreads.size > 0 && !window.isDestroyed()) {
        window.showInactive();
      }
    });
    return overlay;
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
    this.visible = false;
    this.unregisterEscape();
    for (const overlay of this.windows.values()) {
      if (!overlay.window.isDestroyed()) overlay.window.hide();
    }
  }

  private syncEscapeShortcut(): void {
    const shouldRegister = this.activeThreads.size > 0 && this.escapeSuppressedCalls === 0;
    if (shouldRegister === this.escapeRegistered) return;
    if (!shouldRegister) {
      this.unregisterEscape();
      return;
    }
    this.escapeRegistered = globalShortcut.register(ESCAPE_ACCELERATOR, () => {
      const threadIds = [...this.activeThreads];
      this.clearActivity();
      this.options.onExit(threadIds);
    });
  }

  private unregisterEscape(): void {
    if (!this.escapeRegistered) return;
    globalShortcut.unregister(ESCAPE_ACCELERATOR);
    this.escapeRegistered = false;
  }

  private clearActivity(): void {
    for (const releaseTimer of this.releaseTimers.values()) clearTimeout(releaseTimer);
    this.releaseTimers.clear();
    this.activeThreads.clear();
    this.activeCalls.clear();
    this.escapeSuppressedCalls = 0;
    this.hide();
  }
}
