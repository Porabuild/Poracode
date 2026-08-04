import type { RemoteWebSocketClientMessage, RemoteWebSocketServerMessage } from "./protocol";

/**
 * Client half of live terminal streaming, shared by the mobile app and the
 * renderer's remote views. The remote session owner holds the WebSocket; it
 * registers a sender here and routes incoming `terminal-output` messages
 * through {@link TerminalFeed.handleServerMessage}, and forwards the
 * `thread-reset`/`thread-exited` supervisor events (which ride the replayable
 * event stream, not the terminal-output channel) via emitReset/emitExited.
 * A terminal surface subscribes via {@link TerminalFeed.watch}, which sends a
 * `terminal-watch` so the desktop only streams PTY bytes for terminals on
 * screen.
 */
export interface TerminalFeedListener {
  readonly onOutput: (data: string) => void;
  readonly onReset: () => void;
  readonly onExited: (exitCode: number | null) => void;
}

export type TerminalSocketSender = (message: RemoteWebSocketClientMessage) => boolean;

export interface TerminalFeed {
  /** A fresh sender re-subscribes every still-watched terminal (survives reconnects). */
  setSender(next: TerminalSocketSender | null): void;
  /** Returns an unsubscribe that stops the desktop stream once the last listener detaches. */
  watch(id: string, listener: TerminalFeedListener): () => void;
  /** Routes a parsed socket message; returns true if it was a terminal frame. */
  handleServerMessage(message: RemoteWebSocketServerMessage): boolean;
  /** A terminal's PTY restarted. */
  emitReset(id: string): void;
  /** A terminal's PTY exited. */
  emitExited(id: string, exitCode: number | null): void;
  /** Drops all subscriptions (e.g. when switching desktops); keeps the sender. */
  reset(): void;
}

export function createTerminalFeed(): TerminalFeed {
  const listeners = new Map<string, Set<TerminalFeedListener>>();
  let sender: TerminalSocketSender | null = null;

  return {
    setSender(next) {
      sender = next;
      if (next) {
        for (const id of listeners.keys()) next({ type: "terminal-watch", id });
      }
    },
    watch(id, listener) {
      let set = listeners.get(id);
      if (!set) {
        set = new Set();
        listeners.set(id, set);
        sender?.({ type: "terminal-watch", id });
      }
      set.add(listener);
      return () => {
        const current = listeners.get(id);
        if (!current) return;
        current.delete(listener);
        if (current.size === 0) {
          listeners.delete(id);
          sender?.({ type: "terminal-unwatch", id });
        }
      };
    },
    handleServerMessage(message) {
      if (message.type !== "terminal-output") return false;
      const set = listeners.get(message.id);
      if (set) for (const listener of set) listener.onOutput(message.data);
      return true;
    },
    emitReset(id) {
      const set = listeners.get(id);
      if (set) for (const listener of set) listener.onReset();
    },
    emitExited(id, exitCode) {
      const set = listeners.get(id);
      if (set) for (const listener of set) listener.onExited(exitCode);
    },
    reset() {
      for (const id of listeners.keys()) sender?.({ type: "terminal-unwatch", id });
      listeners.clear();
    },
  };
}
