import {
  createTerminalFeed,
  type TerminalFeedListener,
  type TerminalSocketSender,
} from "@/shared/remote/terminalFeed";
import type { RemoteWebSocketServerMessage } from "@/shared/remote";

/**
 * Renderer instance of the shared terminal feed, used by remote thread views.
 * See `src/shared/remote/terminalFeed.ts` for the protocol.
 */

export type RemoteTerminalListener = TerminalFeedListener;

const feeds = new Map<string, ReturnType<typeof createTerminalFeed>>();

function feedFor(desktopId: string) {
  const current = feeds.get(desktopId);
  if (current) return current;
  const feed = createTerminalFeed();
  feeds.set(desktopId, feed);
  return feed;
}

export function setRemoteTerminalSocketSender(
  desktopId: string,
  next: TerminalSocketSender | null,
): void {
  feedFor(desktopId).setSender(next);
}

export function watchRemoteTerminal(
  desktopId: string,
  id: string,
  listener: RemoteTerminalListener,
): () => void {
  return feedFor(desktopId).watch(id, listener);
}

export function handleRemoteTerminalServerMessage(
  desktopId: string,
  message: RemoteWebSocketServerMessage,
): boolean {
  return feedFor(desktopId).handleServerMessage(message);
}

export function emitRemoteTerminalReset(desktopId: string, id: string): void {
  feedFor(desktopId).emitReset(id);
}

export function emitRemoteTerminalExited(
  desktopId: string,
  id: string,
  exitCode: number | null,
): void {
  feedFor(desktopId).emitExited(id, exitCode);
}

/** Drops the sender and all subscriptions (e.g. when the store disconnects). */
export function resetRemoteTerminalFeed(desktopId?: string): void {
  if (desktopId) {
    const feed = feeds.get(desktopId);
    feed?.reset();
    feed?.setSender(null);
    feeds.delete(desktopId);
    return;
  }
  for (const feed of feeds.values()) {
    feed.reset();
    feed.setSender(null);
  }
  feeds.clear();
}
