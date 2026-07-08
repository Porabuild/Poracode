import { create } from "zustand";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import type {
  RemoteBrowserFrameMetadata,
  RemoteBrowserInput,
  RemoteBrowserMirrorStatus,
  RemoteBrowserState,
  RemoteWebSocketClientMessage,
  RemoteWebSocketServerMessage,
} from "@/shared/remote";

/**
 * Client half of browser mirroring. The remote session hook owns the
 * WebSocket; it registers a sender here and routes incoming browser-*
 * messages through {@link handleBrowserServerMessage}. The BrowserView reads
 * the store and sends watch/input messages through the registered sender.
 */

export interface BrowserMirrorFrame {
  readonly tabId: string;
  /** data: URL ready for an <img> src. */
  readonly dataUrl: string;
  readonly metadata: RemoteBrowserFrameMetadata;
}

interface BrowserMirrorStore {
  state: RemoteBrowserState | null;
  frame: BrowserMirrorFrame | null;
  status: RemoteBrowserMirrorStatus | null;
  /** True while the BrowserView wants frames; survives socket reconnects. */
  watching: boolean;
  /** True while the view is temporarily backgrounded: suppresses frames
   * (including across reconnects) without discarding the watching intent. */
  paused: boolean;
  setState(state: RemoteBrowserState): void;
  setFrame(frame: BrowserMirrorFrame): void;
  setStatus(status: RemoteBrowserMirrorStatus): void;
  setWatching(watching: boolean): void;
  setPaused(paused: boolean): void;
  reset(): void;
}

export const useBrowserMirrorStore = create<BrowserMirrorStore>()((set) => ({
  state: null,
  frame: null,
  status: null,
  watching: false,
  paused: false,
  // The reused desktop components (BrowserTabStrip, …) read tab state from
  // the renderer's browser panel store, so mirror it on every update.
  setState: (state) => {
    set({ state });
    useBrowserPanelStore.getState().setState(state);
  },
  setFrame: (frame) => set({ frame }),
  setStatus: (status) => set({ status }),
  setWatching: (watching) => set({ watching }),
  setPaused: (paused) => set({ paused }),
  reset: () => {
    set({ state: null, frame: null, status: null, watching: false, paused: false });
    useBrowserPanelStore.getState().setState({ tabs: [], activeTabId: null });
  },
}));

type BrowserSocketSender = (message: RemoteWebSocketClientMessage) => boolean;

let sender: BrowserSocketSender | null = null;

/** The remote session hook keeps this pointing at the open socket; passing a
 * fresh sender re-subscribes automatically when the view is still watching. */
export function setBrowserSocketSender(next: BrowserSocketSender | null): void {
  sender = next;
  const { watching, paused } = useBrowserMirrorStore.getState();
  // Only re-subscribe a view that still wants frames AND isn't paused, so a
  // reconnect while backgrounded doesn't resume streaming to a hidden view.
  if (next && watching && !paused) {
    next({ type: "browser-watch" });
  }
}

function send(message: RemoteWebSocketClientMessage): boolean {
  return sender ? sender(message) : false;
}

export function startBrowserWatch(): void {
  const store = useBrowserMirrorStore.getState();
  store.setWatching(true);
  store.setPaused(false);
  send({ type: "browser-watch" });
}

export function stopBrowserWatch(): void {
  useBrowserMirrorStore.getState().setWatching(false);
  send({ type: "browser-unwatch" });
}

/** Pause frames without giving up the watching intent (background tab). The
 * paused flag survives reconnects so {@link setBrowserSocketSender} won't
 * silently resume streaming to a hidden view. */
export function pauseBrowserWatch(): void {
  useBrowserMirrorStore.getState().setPaused(true);
  send({ type: "browser-unwatch" });
}

export function resumeBrowserWatch(): void {
  const store = useBrowserMirrorStore.getState();
  store.setPaused(false);
  if (store.watching) {
    send({ type: "browser-watch" });
  }
}

export function sendBrowserInput(input: RemoteBrowserInput): void {
  send({ type: "browser-input", input });
}

/** Routes a server message; returns true when it was a browser message. */
export function handleBrowserServerMessage(message: RemoteWebSocketServerMessage): boolean {
  const store = useBrowserMirrorStore.getState();
  if (message.type === "browser-state") {
    store.setState(message.state);
    return true;
  }
  if (message.type === "browser-frame") {
    store.setFrame({
      tabId: message.tabId,
      dataUrl: `data:image/jpeg;base64,${message.data}`,
      metadata: message.metadata,
    });
    return true;
  }
  if (message.type === "browser-mirror-status") {
    store.setStatus(message.status);
    return true;
  }
  return false;
}

export function resetBrowserMirror(): void {
  useBrowserMirrorStore.getState().reset();
}
