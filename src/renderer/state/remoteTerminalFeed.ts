import type { RemoteWebSocketClientMessage, RemoteWebSocketServerMessage } from "@/shared/remote";

export interface RemoteTerminalListener {
  readonly onOutput: (data: string) => void;
  readonly onReset: () => void;
  readonly onExited: (exitCode: number | null) => void;
}

type RemoteTerminalSocketSender = (message: RemoteWebSocketClientMessage) => boolean;

const listeners = new Map<string, Set<RemoteTerminalListener>>();
let sender: RemoteTerminalSocketSender | null = null;

export function setRemoteTerminalSocketSender(next: RemoteTerminalSocketSender | null): void {
  sender = next;
  if (next) {
    for (const id of listeners.keys()) next({ type: "terminal-watch", id });
  }
}

export function watchRemoteTerminal(id: string, listener: RemoteTerminalListener): () => void {
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

export function handleRemoteTerminalServerMessage(message: RemoteWebSocketServerMessage): boolean {
  if (message.type !== "terminal-output") return false;
  const set = listeners.get(message.id);
  if (set) for (const listener of set) listener.onOutput(message.data);
  return true;
}

export function emitRemoteTerminalReset(id: string): void {
  const set = listeners.get(id);
  if (set) for (const listener of set) listener.onReset();
}

export function emitRemoteTerminalExited(id: string, exitCode: number | null): void {
  const set = listeners.get(id);
  if (set) for (const listener of set) listener.onExited(exitCode);
}

export function resetRemoteTerminalFeed(): void {
  sender = null;
  listeners.clear();
}
