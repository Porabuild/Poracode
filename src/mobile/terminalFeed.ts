import {
  createTerminalFeed,
  type TerminalFeedListener,
  type TerminalSocketSender,
} from "@/shared/remote/terminalFeed";

/**
 * Mobile instance of the shared terminal feed. The remote session hook owns
 * the WebSocket and registers a sender here; terminal surfaces (CLI thread or
 * dev shell) subscribe via {@link watchTerminal}. See
 * `src/shared/remote/terminalFeed.ts` for the protocol.
 */

export type TerminalListener = TerminalFeedListener;

const feed = createTerminalFeed();

export function setTerminalSocketSender(next: TerminalSocketSender | null): void {
  feed.setSender(next);
}

export function watchTerminal(id: string, listener: TerminalListener): () => void {
  return feed.watch(id, listener);
}

export const handleTerminalServerMessage = feed.handleServerMessage;
export const emitTerminalReset = feed.emitReset;
export const emitTerminalExited = feed.emitExited;

/** Drops all subscriptions (e.g. when switching desktops). */
export function resetTerminalFeed(): void {
  feed.reset();
}
