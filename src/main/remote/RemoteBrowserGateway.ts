import type { BrowserState } from "@/shared/ipc";
import type {
  RemoteBrowserCommand,
  RemoteBrowserFrameMetadata,
  RemoteBrowserInput,
  RemoteBrowserKey,
  RemoteBrowserMirrorStatus,
  RemoteBrowserState,
} from "@/shared/remote";
import type { BrowserPanelManager } from "../browser";
import type { BrowserTab } from "../browser/BrowserTab";
import { RemoteHttpError } from "./auth";

/**
 * Bridges the desktop's built-in browser to remote (PWA) clients.
 *
 * Tab commands map onto {@link BrowserPanelManager}; live mirroring runs a CDP
 * screencast (`Page.startScreencast`) on the active tab and fans JPEG frames
 * out to every watcher, and remote taps/scrolls are replayed into the page via
 * `Input.dispatchMouseEvent`.
 *
 * Constraint worth knowing: tab webContents are owned by `<webview>` elements
 * in the desktop renderer, which mount only while the browser panel/overlay is
 * open there. Watching therefore reveals the panel on the desktop and waits
 * for the webview to attach; if it never does, watchers get an "unavailable"
 * status with the reason instead of frames.
 */

export interface RemoteBrowserFrame {
  readonly tabId: string;
  readonly data: string;
  readonly metadata: RemoteBrowserFrameMetadata;
}

export interface RemoteBrowserWatcherSink {
  onFrame(frame: RemoteBrowserFrame): void;
  onState(state: RemoteBrowserState): void;
  onStatus(status: RemoteBrowserMirrorStatus): void;
}

interface MirrorSession {
  readonly tabId: string;
  stop(): void;
}

const ATTACH_WAIT_MS = 6000;
const ATTACH_POLL_MS = 150;
const BROWSER_UNAVAILABLE_REASON = "The desktop browser is not available.";

const KEY_DEFINITIONS: Record<
  RemoteBrowserKey,
  { key: string; code: string; keyCode: number; text?: string }
> = {
  enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" },
  backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
  tab: { key: "Tab", code: "Tab", keyCode: 9 },
  escape: { key: "Escape", code: "Escape", keyCode: 27 },
  "arrow-up": { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
  "arrow-down": { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
  "arrow-left": { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
  "arrow-right": { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
};
/** JPEG quality / bounds tuned for LAN streaming: ~30-80 KB per frame. */
const SCREENCAST_PARAMS = {
  format: "jpeg",
  quality: 60,
  maxWidth: 1280,
  maxHeight: 1280,
  everyNthFrame: 1,
} as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toRemoteState(state: BrowserState): RemoteBrowserState {
  return {
    tabs: state.tabs.map((tab) => ({
      tabId: tab.tabId,
      url: tab.url,
      title: tab.title,
      loading: tab.loading,
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
      ...(tab.faviconUrl ? { faviconUrl: tab.faviconUrl } : {}),
    })),
    activeTabId: state.activeTabId,
  };
}

export class RemoteBrowserGateway {
  private readonly sinks = new Set<RemoteBrowserWatcherSink>();
  private unsubscribeManager: (() => void) | null = null;
  private mirror: MirrorSession | null = null;
  /** Increments per ensureMirror run so stale async continuations bail out. */
  private ensureToken = 0;

  constructor(private readonly getManager: () => BrowserPanelManager | null) {}

  state(): RemoteBrowserState {
    return toRemoteState(this.requireManager().snapshot());
  }

  async command(command: RemoteBrowserCommand): Promise<RemoteBrowserState> {
    const manager = this.requireManager();
    switch (command.kind) {
      case "create-tab":
        // Surface the panel so the renderer mounts the <webview> that will
        // host the new tab (createTab itself waits for the attach).
        manager.revealPanel();
        await manager.createTab({ ...(command.url ? { url: command.url } : {}), activate: true });
        break;
      case "close-tab":
        await manager.closeTab(command.tabId);
        break;
      case "activate-tab":
        manager.setActiveTab(command.tabId);
        break;
      case "move-tab":
        manager.moveTab(command.tabId, command.targetTabId, command.position);
        break;
      case "navigate":
        await manager.navigate(command.tabId, command.url);
        break;
      case "back":
        await manager.back(command.tabId);
        break;
      case "forward":
        await manager.forward(command.tabId);
        break;
      case "reload":
        await manager.reload(command.tabId);
        break;
    }
    return toRemoteState(manager.snapshot());
  }

  /** Replays remote taps/scrolls/typing into the active (mirrored) tab. */
  async dispatchInput(input: RemoteBrowserInput): Promise<void> {
    const tab = this.getManager()?.getActiveTab();
    if (!tab || !tab.isAttached()) return;
    const cdp = tab.cdp;
    switch (input.kind) {
      case "tap": {
        const base = { x: input.x, y: input.y, button: "left", clickCount: 1 };
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: input.x, y: input.y });
        await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...base });
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...base });
        return;
      }
      case "scroll":
        await cdp.send("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x: input.x,
          y: input.y,
          deltaX: input.deltaX,
          deltaY: input.deltaY,
        });
        return;
      case "insert-text":
        // Lands in the page's focused editable; a no-op when nothing is focused.
        await cdp.send("Input.insertText", { text: input.text });
        return;
      case "key": {
        const def = KEY_DEFINITIONS[input.key];
        const codes = {
          windowsVirtualKeyCode: def.keyCode,
          nativeVirtualKeyCode: def.keyCode,
        };
        await cdp.send("Input.dispatchKeyEvent", {
          // Keys with text produce char events (Enter inserts a newline);
          // pure control keys use rawKeyDown.
          type: def.text ? "keyDown" : "rawKeyDown",
          key: def.key,
          code: def.code,
          ...codes,
          ...(def.text ? { text: def.text, unmodifiedText: def.text } : {}),
        });
        await cdp.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: def.key,
          code: def.code,
          ...codes,
        });
        return;
      }
    }
  }

  /**
   * Registers a watcher and (re)starts the screencast. Returns the
   * unsubscribe; the screencast stops when the last watcher leaves.
   */
  watch(sink: RemoteBrowserWatcherSink): () => void {
    this.sinks.add(sink);
    if (this.sinks.size === 1) {
      const manager = this.getManager();
      if (manager) {
        this.unsubscribeManager = manager.addEventListener((event) => {
          if (event.type !== "state" && event.type !== "tab-updated") return;
          this.broadcastState();
          // Active-tab switches and late <webview> attaches both surface as
          // these events; re-ensure so the mirror follows them.
          void this.ensureMirror();
        });
      }
    }
    try {
      sink.onState(this.state());
    } catch {
      sink.onStatus({
        status: "unavailable",
        tabId: null,
        reason: BROWSER_UNAVAILABLE_REASON,
      });
    }
    void this.ensureMirror();
    return () => {
      this.sinks.delete(sink);
      if (this.sinks.size === 0) this.teardown();
    };
  }

  /** Client-requested retry (e.g. after an "unavailable" status). */
  refresh(): void {
    void this.ensureMirror();
  }

  dispose(): void {
    this.sinks.clear();
    this.teardown();
  }

  private teardown(): void {
    this.ensureToken++;
    this.unsubscribeManager?.();
    this.unsubscribeManager = null;
    this.stopMirror();
  }

  private stopMirror(): void {
    const mirror = this.mirror;
    this.mirror = null;
    mirror?.stop();
  }

  private async ensureMirror(): Promise<void> {
    const token = ++this.ensureToken;
    if (this.sinks.size === 0) return;
    const manager = this.getManager();
    if (!manager) {
      this.broadcastStatus({
        status: "unavailable",
        tabId: null,
        reason: BROWSER_UNAVAILABLE_REASON,
      });
      return;
    }
    const active = manager.getActiveTab();
    if (!active) {
      this.stopMirror();
      this.broadcastStatus({
        status: "unavailable",
        tabId: null,
        reason: "No browser tabs are open.",
      });
      return;
    }
    if (this.mirror?.tabId === active.tabId) return;
    this.stopMirror();
    this.broadcastStatus({ status: "starting", tabId: active.tabId });

    if (!active.isAttached()) {
      // The webview mounts once the panel is visible on the desktop.
      manager.revealPanel();
      const deadline = Date.now() + ATTACH_WAIT_MS;
      while (!active.isAttached() && !active.isDestroyed() && Date.now() < deadline) {
        await delay(ATTACH_POLL_MS);
        if (token !== this.ensureToken) return;
      }
    }
    if (token !== this.ensureToken) return;
    if (active.isDestroyed() || !active.isAttached()) {
      this.broadcastStatus({
        status: "unavailable",
        tabId: active.tabId,
        reason: "The desktop browser panel did not open. Open it on the desktop, then retry.",
      });
      return;
    }

    try {
      const session = await startMirrorSession(active, {
        onFrame: (frame) => this.broadcastFrame(frame),
        onEnded: () => {
          if (this.mirror?.tabId !== active.tabId) return;
          this.mirror = null;
          this.broadcastStatus({
            status: "unavailable",
            tabId: active.tabId,
            reason: "Mirroring stopped — the tab closed or the desktop panel was closed.",
          });
        },
      });
      if (token !== this.ensureToken || this.sinks.size === 0) {
        session.stop();
        return;
      }
      this.mirror = session;
      this.broadcastStatus({ status: "active", tabId: active.tabId });
    } catch (error) {
      this.broadcastStatus({
        status: "unavailable",
        tabId: active.tabId,
        reason: error instanceof Error ? error.message : "Screencast failed to start.",
      });
    }
  }

  /** Deliver to every sink, never letting one sink's failure stop the rest. */
  private fanOut(deliver: (sink: RemoteBrowserWatcherSink) => void): void {
    for (const sink of this.sinks) {
      try {
        deliver(sink);
      } catch {}
    }
  }

  private broadcastState(): void {
    const manager = this.getManager();
    if (!manager) return;
    const state = toRemoteState(manager.snapshot());
    this.fanOut((sink) => sink.onState(state));
  }

  private broadcastStatus(status: RemoteBrowserMirrorStatus): void {
    this.fanOut((sink) => sink.onStatus(status));
  }

  private broadcastFrame(frame: RemoteBrowserFrame): void {
    this.fanOut((sink) => sink.onFrame(frame));
  }

  private requireManager(): BrowserPanelManager {
    const manager = this.getManager();
    if (!manager) {
      throw new RemoteHttpError("browser_unavailable", BROWSER_UNAVAILABLE_REASON, 503);
    }
    return manager;
  }
}

async function startMirrorSession(
  tab: BrowserTab,
  callbacks: { onFrame(frame: RemoteBrowserFrame): void; onEnded(): void },
): Promise<MirrorSession> {
  const cdp = tab.cdp;
  await cdp.attach();
  const wc = tab.webContents;
  let stopped = false;

  const unsubscribeFrames = cdp.on("Page.screencastFrame", (params) => {
    const frame = params as {
      data?: unknown;
      sessionId?: unknown;
      metadata?: Record<string, unknown>;
    };
    // Ack first — Chromium pauses the screencast until the frame is acked.
    if (typeof frame.sessionId === "number") {
      void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
    }
    if (typeof frame.data !== "string" || frame.data.length === 0) return;
    const metadata = frame.metadata ?? {};
    callbacks.onFrame({
      tabId: tab.tabId,
      data: frame.data,
      metadata: {
        deviceWidth: toNumber(metadata.deviceWidth),
        deviceHeight: toNumber(metadata.deviceHeight),
        pageScaleFactor: toNumber(metadata.pageScaleFactor, 1),
        offsetTop: toNumber(metadata.offsetTop),
        scrollOffsetX: toNumber(metadata.scrollOffsetX),
        scrollOffsetY: toNumber(metadata.scrollOffsetY),
      },
    });
  });

  const onDestroyed = () => stop(true);
  wc.once("destroyed", onDestroyed);

  function stop(ended: boolean): void {
    if (stopped) return;
    stopped = true;
    unsubscribeFrames();
    try {
      wc.removeListener("destroyed", onDestroyed);
    } catch {}
    if (!ended && tab.isAttached() && cdp.isAttached()) {
      void cdp.send("Page.stopScreencast").catch(() => {});
    }
    if (ended) callbacks.onEnded();
  }

  try {
    await cdp.send("Page.startScreencast", { ...SCREENCAST_PARAMS });
  } catch (error) {
    // startScreencast rejected before we returned a session, so `stop` is never
    // wired up and the frame + 'destroyed' listeners (and the attached CDP
    // session) would leak, accumulating on every retry. Unregister them and
    // detach CDP before rethrowing.
    unsubscribeFrames();
    try {
      wc.removeListener("destroyed", onDestroyed);
    } catch {}
    try {
      cdp.detach();
    } catch {}
    throw error;
  }
  return {
    tabId: tab.tabId,
    stop: () => stop(false),
  };
}
