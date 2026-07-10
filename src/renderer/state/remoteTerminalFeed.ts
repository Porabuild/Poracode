import {
  createTerminalFeed,
  type TerminalFeedListener,
  type TerminalSocketSender,
} from "@/shared/remote/terminalFeed";

/**
 * Renderer instance of the shared terminal feed, used by remote thread views.
 * See `src/shared/remote/terminalFeed.ts` for the protocol.
 */

export type RemoteTerminalListener = TerminalFeedListener;

const feed = createTerminalFeed();

export function setRemoteTerminalSocketSender(next: TerminalSocketSender | null): void {
  feed.setSender(next);
}

export function watchRemoteTerminal(id: string, listener: RemoteTerminalListener): () => void {
  return feed.watch(id, listener);
}

export const handleRemoteTerminalServerMessage = feed.handleServerMessage;
export const emitRemoteTerminalReset = feed.emitReset;
export const emitRemoteTerminalExited = feed.emitExited;

/** Drops the sender and all subscriptions (e.g. when the store disconnects). */
export function resetRemoteTerminalFeed(): void {
  feed.setSender(null);
  feed.reset();
}
