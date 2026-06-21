import type { RemoteWebSocketClientMessage, RemoteWebSocketServerMessage } from "@/shared/remote";

/**
 * Client half of live terminal streaming. The remote session hook owns the
 * WebSocket; it registers a sender here and routes incoming `terminal-output`
 * messages through {@link handleTerminalServerMessage}, and forwards the
 * `thread-reset`/`thread-exited` supervisor events (which ride the replayable
 * event stream, not the terminal-output channel) via {@link emitTerminalReset}
 * / {@link emitTerminalExited}. A terminal surface (CLI thread or dev shell)
 * subscribes via {@link watchTerminal}, which sends a `terminal-watch` so the
 * desktop only streams PTY bytes for terminals on screen.
 */

export interface TerminalListener {
  readonly onOutput: (data: string) => void;
  readonly onReset: () => void;
  readonly onExited: (exitCode: number | null) => void;
}

type TerminalSocketSender = (message: RemoteWebSocketClientMessage) => boolean;

const listeners = new Map<string, Set<TerminalListener>>();
let sender: TerminalSocketSender | null = null;

/** The remote session hook keeps this pointing at the open socket. A fresh
 * sender re-subscribes every still-watched terminal (survives reconnects). */
export function setTerminalSocketSender(next: TerminalSocketSender | null): void {
  sender = next;
  if (next) {
    for (const id of listeners.keys()) next({ type: "terminal-watch", id });
  }
}

/** Subscribe a terminal surface to live output/reset/exit for an id; returns an
 * unsubscribe that stops the desktop stream once the last listener detaches. */
export function watchTerminal(id: string, listener: TerminalListener): () => void {
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
}

/** Routes a parsed socket message; returns true if it was a terminal frame. */
export function handleTerminalServerMessage(message: RemoteWebSocketServerMessage): boolean {
  if (message.type !== "terminal-output") return false;
  const set = listeners.get(message.id);
  if (set) for (const l of set) l.onOutput(message.data);
  return true;
}

/** Forwarded from the event stream (storeSync) — a terminal's PTY restarted. */
export function emitTerminalReset(id: string): void {
  const set = listeners.get(id);
  if (set) for (const l of set) l.onReset();
}

/** Forwarded from the event stream (storeSync) — a terminal's PTY exited. */
export function emitTerminalExited(id: string, exitCode: number | null): void {
  const set = listeners.get(id);
  if (set) for (const l of set) l.onExited(exitCode);
}

/** Drops all subscriptions (e.g. when switching desktops). */
export function resetTerminalFeed(): void {
  listeners.clear();
}
