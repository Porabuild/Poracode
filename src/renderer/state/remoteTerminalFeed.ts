import {
  createTerminalFeed,
  type TerminalCursorSyncFeedVersion,
  type TerminalFeedListener,
  type TerminalSocketSender,
} from "@/shared/remote/terminalFeed";
import type { RemoteWebSocketServerMessage } from "@/shared/remote";
import { readBridge } from "@/renderer/bridge";
import { remoteTerminalOwner } from "@/renderer/remoteProcedureRouter";
import { retainRendererEventInterest } from "@/renderer/state/rendererEventInterests";

/**
 * Renderer instance of the shared terminal feed, used by remote thread views.
 * See `src/shared/remote/terminalFeed.ts` for the protocol.
 *
 * Since the V5 plan 2.5 completion it ALSO backs the managed desktop's own
 * terminal surfaces: while the co-located loopback server serves this window,
 * local PTY bytes ride `terminal-watch` frames on the loopback socket
 * (`watchManagedTerminal` switches between that feed and the desktop-IPC
 * relay's `thread-output`, which remains only as the fallback leg).
 */

export type RemoteTerminalListener = TerminalFeedListener;

const feeds = new Map<string, ReturnType<typeof createTerminalFeed>>();

/** Feed-map key for the managed desktop's own PTY bytes. Not a paired-server id. */
const MANAGED_FEED_ID = "managed";

export function managedTerminalFeedId(): string {
  return MANAGED_FEED_ID;
}

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
  options?: { readonly cursorSyncVersion?: TerminalCursorSyncFeedVersion },
): void {
  feedFor(desktopId).setSender(next, options);
}

export function watchRemoteTerminal(
  desktopId: string,
  id: string,
  listener: RemoteTerminalListener,
): () => void {
  return feedFor(desktopId).watch(id, listener);
}

/** One subscription seam for utilities that can operate on either a local or
 * remote PTY. An explicit desktop id covers watchers installed before
 * `startShell`; otherwise the procedure router's terminal ownership map is the
 * source of truth, and an unowned (managed-local) id rides the unified
 * managed seam — loopback `terminal-watch` frames while that leg serves, the
 * desktop-IPC relay as the fallback. */
export function watchRoutedTerminal(
  id: string,
  listener: RemoteTerminalListener,
  desktopId: string | undefined = remoteTerminalOwner(id),
): () => void {
  if (desktopId) return watchRemoteTerminal(desktopId, id, listener);
  return watchManagedTerminal(id, listener);
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

/**
 * Managed loopback terminal leg (V5 plan 2.5 completion). While the leg is
 * active, local (managed) terminal surfaces consume PTY bytes through the
 * loopback feed's `terminal-watch` machinery — v1/v2 cursor sync and chunked
 * baselines included — exactly like remote terminals. While it is down there
 * is no IPC `thread-output` data plane (V6 B.6); `thread-scrollback-resync`
 * rehydration waits for the loopback leg to resume.
 */

const managedLegListeners = new Set<(active: boolean) => void>();
let managedLegActive = false;

/** True while the loopback leg serves this window's terminal watches. */
export function isManagedLoopbackTerminalLegActive(): boolean {
  return managedLegActive;
}

/** Called by the intake wiring on leg activation/deactivation. Activation
 * switches subscribed managed surfaces onto the loopback feed (baseline
 * snapshots follow); deactivation closes those watches so the fallback relay
 * feed resumes. Ordering contract: the wiring notifies this BEFORE the
 * transport's leg gate, so the transport's rebuild dispatch observes the
 * already-switched subscriptions. */
export function setManagedLoopbackTerminalLeg(active: boolean): void {
  if (managedLegActive === active) return;
  managedLegActive = active;
  if (!active) {
    // Watches detached by their owners below; drop the (dead) sender and all
    // feed state for the loopback identity.
    resetRemoteTerminalFeed(MANAGED_FEED_ID);
  }
  for (const listener of [...managedLegListeners]) listener(active);
}

/** One watcher of a managed terminal. The relay-side resync signal drives the
 * surface's existing scrollback rehydration on fallback. */
export type ManagedTerminalListener = TerminalFeedListener & {
  /** A `thread-scrollback-resync` for this terminal (rehydrate from the
   * authoritative persisted scrollback). */
  readonly onResync?: () => void;
};

/**
 * Subscription seam for LOCAL (managed) terminals — the unified successor of
 * the raw relay subscription. Chooses the active leg at subscribe time and
 * follows leg flips for the lifetime of the subscription:
 *
 * - loopback active: feeds through the loopback terminal feed (watches,
 *   baselines, cursor sync);
 * - loopback down: no live PTY until the intake reconnects (V6 B.6); the
 *   resync signal still drives scrollback recovery on the next rebuild.
 *
 * The renderer interest lease stays held in BOTH modes: it keeps the
 * backend's retention and the transport's rebuild scope intact, and mirrors
 * the previous relay-only subscription's retention behavior.
 */
export function watchManagedTerminal(
  id: string,
  listener: ManagedTerminalListener,
  desktopId: string | undefined = remoteTerminalOwner(id),
): () => void {
  // A remotely owned terminal routes as before (unchanged remote path).
  if (desktopId) return watchRemoteTerminal(desktopId, id, listener);

  const interest = retainRendererEventInterest("terminal", id);
  let feedUnsubscribe: (() => void) | null = null;

  const enterFeed = (): void => {
    if (feedUnsubscribe) return;
    feedUnsubscribe = watchRemoteTerminal(MANAGED_FEED_ID, id, listener);
  };
  const enterRelay = (): void => {
    // Clear the handle FIRST: a leg loss that reset the whole feed turns the
    // stale unsubscribe into a no-op, and the next activation must still be
    // able to re-enter the feed.
    const unsubscribeFeed = feedUnsubscribe;
    feedUnsubscribe = null;
    unsubscribeFeed?.();
  };

  const relayUnsubscribe = readBridge().onSupervisorEvent((event) => {
    if (!("threadId" in event) || event.threadId !== id) return;
    // Scrollback recovery always forwards: the rebuild dispatch emits it on
    // BOTH leg flips, and in feed mode the baseline supersedes it.
    if (event.type === "thread-scrollback-resync") {
      listener.onResync?.();
      return;
    }
    // While the loopback leg is up, PTY bytes and terminal lifecycle arrive
    // through the feed; the relay is suppressed (also at the transport gate).
    if (managedLegActive) return;
    if (event.type === "thread-output") listener.onOutput(event.data);
    else if (event.type === "thread-reset") listener.onReset();
    else if (event.type === "thread-exited") listener.onExited(event.exitCode);
  });

  const onLegChanged = (active: boolean): void => {
    if (active) enterFeed();
    else enterRelay();
  };
  managedLegListeners.add(onLegChanged);
  if (managedLegActive) enterFeed();

  return () => {
    managedLegListeners.delete(onLegChanged);
    enterRelay();
    relayUnsubscribe();
    interest.release();
  };
}
