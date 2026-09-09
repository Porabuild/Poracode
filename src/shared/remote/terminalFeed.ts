import type {
  RemoteTerminalWatchResultError,
  RemoteTerminalWatchResultReady,
  RemoteWebSocketClientMessage,
  RemoteWebSocketServerMessage,
} from "./protocol";
import { TERMINAL_CURSOR_SYNC_VERSION } from "./protocol";
import {
  TERMINAL_WATCH_DEFAULT_LIMITS,
  TERMINAL_WATCH_DEFAULT_RETRY,
  TerminalWatchSession,
  type TerminalWatchScheduler,
  type TerminalWatchLimits,
  type TerminalWatchRetryOptions,
} from "./terminalFeedWatch";

/**
 * Client half of live terminal streaming, shared by browser and Electron remote
 * views. The remote session owner holds the WebSocket; it registers a sender
 * here and routes incoming `terminal-output`/`terminal-watch-result` messages
 * through {@link TerminalFeed.handleServerMessage}, and forwards the
 * `thread-reset`/`thread-exited` supervisor events (which ride the replayable
 * event stream, not the terminal-output channel) via emitReset/emitExited.
 * A terminal surface subscribes via {@link TerminalFeed.watch}, which sends a
 * `terminal-watch` so the desktop only streams PTY bytes for terminals on
 * screen — the feed never creates extra output watches for background
 * liveness.
 *
 * **Two connection modes.** `setSender(next, { cursorSyncVersion: 1 })` opts
 * every watch on that connection into cursor-sync v1: the server replies with
 * an authoritative `terminal-watch-result` baseline and tags subsequent live
 * frames with UTF-16 cursor ranges, which the feed reconciles via
 * `reconcileTerminalRange`. Omitting the option keeps the legacy live-only
 * feed for legacy hosts — no history, no pretend guarantee. Calling
 * `setSender` with the same sender function and the same mode is a no-op, so
 * re-activating an already-open socket does not resubscribe; a different
 * function (new connection) or a mode change rewatches everything, and every
 * new watch/resync/reconnect uses a fresh `watchId` whose stale ids/tags are
 * ignored afterwards.
 *
 * **Strict snapshot/live separation.** History reaches listeners only through
 * the optional `onSnapshot`; `onOutput` carries uncovered live bytes only —
 * never snapshot data. Listeners without `onSnapshot` never
 * receive replay of any kind, so they cannot mistake history for fresh output.
 * `onReset`/`onExited` are only ever real supervisor events, never synthesized
 * from snapshots.
 */

export interface TerminalFeedListener {
  readonly onOutput: (data: string) => void;
  readonly onReset: () => void;
  readonly onExited: (exitCode: number | null) => void;
  /**
   * Authoritative baseline / active-cache snapshot for cursor-sync watches.
   * Explicit history opt-in, for display or current-command completion checks.
   * Never called for legacy-mode watches, and never
   * routed through {@link onOutput}.
   */
  readonly onSnapshot?: (snapshot: RemoteTerminalWatchResultReady) => void;
  /**
   * Terminal watch failed. Server verdicts (`forbidden`, `not-found`,
   * server `unavailable`) are forwarded verbatim; client-side recovery
   * failures synthesize `unavailable` only. After a non-retryable error the
   * watch stops until reset / new connection / re-watch — no silent
   * live-only fallback.
   */
  readonly onWatchError?: (error: RemoteTerminalWatchResultError) => void;
}

export type TerminalSocketSender = (message: RemoteWebSocketClientMessage) => boolean;

/** Per-connection cursor-sync opt-in, sent with each `terminal-watch`. */
export interface TerminalFeedSenderOptions {
  readonly cursorSyncVersion?: typeof TERMINAL_CURSOR_SYNC_VERSION;
}

export interface TerminalFeedOptions {
  /** Watch-id source; defaults to `crypto.randomUUID` (with a fallback). */
  readonly generateWatchId?: () => string;
  /** Timer seam for baseline timeouts and backoff retries. */
  readonly schedule?: TerminalWatchScheduler;
  /** Bounded-memory caps. Defaults mirror the server's retained tail. */
  readonly limits?: Partial<TerminalWatchLimits>;
  /** Bounded retry/resync budget. See `terminalFeedWatch.ts`. */
  readonly retry?: Partial<TerminalWatchRetryOptions>;
}

export interface TerminalFeed {
  /**
   * A fresh sender re-subscribes every still-watched terminal (survives
   * reconnects); `null` suspends new writes and retries while listeners stay
   * retained. Idempotent when the sender identity and mode are unchanged.
   */
  setSender(next: TerminalSocketSender | null, options?: TerminalFeedSenderOptions): void;
  /** Returns an unsubscribe that stops the desktop stream once the last listener detaches. */
  watch(id: string, listener: TerminalFeedListener): () => void;
  /** Routes a parsed socket message; returns true if it was a terminal frame. */
  handleServerMessage(message: RemoteWebSocketServerMessage): boolean;
  /** A terminal's PTY restarted. Re-arms the cursor-sync watch with a fresh id. */
  emitReset(id: string): void;
  /** A terminal's PTY exited. */
  emitExited(id: string, exitCode: number | null): void;
  /** Drops all subscriptions (e.g. when switching desktops); keeps the sender. */
  reset(): void;
}

let fallbackWatchIdCounter = 0;

function defaultGenerateWatchId(): string {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  fallbackWatchIdCounter += 1;
  return `watch-${fallbackWatchIdCounter}-${Math.random().toString(36).slice(2)}`;
}

function defaultSchedule(delayMs: number, fn: () => void): () => void {
  const timer = setTimeout(fn, delayMs);
  return () => clearTimeout(timer);
}

export function createTerminalFeed(options: TerminalFeedOptions = {}): TerminalFeed {
  const generateWatchId = options.generateWatchId ?? defaultGenerateWatchId;
  const schedule = options.schedule ?? defaultSchedule;
  const limits: TerminalWatchLimits = { ...TERMINAL_WATCH_DEFAULT_LIMITS, ...options.limits };
  const retry: TerminalWatchRetryOptions = { ...TERMINAL_WATCH_DEFAULT_RETRY, ...options.retry };

  const listeners = new Map<string, Set<TerminalFeedListener>>();
  /** Cursor-sync sessions; only present while the connection opted in. */
  const sessions = new Map<string, TerminalWatchSession>();
  /** Per-terminal epoch bumped by emitReset. A fanout that started before a
   * reset stops delivering when it sees a new epoch: listeners not yet reached
   * must not receive pre-reset bytes after onReset. */
  const resetEpochs = new Map<string, number>();
  let sender: TerminalSocketSender | null = null;
  let cursorSyncActive = false;

  /** Deliver to the listener list as it was when the fanout began. A listener
   * added mid-fanout (inside another listener's callback) is served by its own
   * watch() path — e.g. the active-cache snapshot, which already contains the
   * in-flight append — so visiting it here would duplicate history + live. A
   * listener removed mid-fanout is skipped. */
  const fanout = (id: string, deliver: (listener: TerminalFeedListener) => void): void => {
    const set = listeners.get(id);
    if (!set) return;
    const snapshot = [...set];
    const epoch = resetEpochs.get(id) ?? 0;
    for (const listener of snapshot) {
      if (listeners.get(id) !== set) return;
      if (!set.has(listener)) continue;
      if ((resetEpochs.get(id) ?? 0) !== epoch) return;
      deliver(listener);
    }
  };

  const createSession = (id: string): TerminalWatchSession =>
    new TerminalWatchSession({
      host: {
        sendWatch: (watchId) => {
          const message: RemoteWebSocketClientMessage = {
            type: "terminal-watch",
            id,
            cursorSync: { version: TERMINAL_CURSOR_SYNC_VERSION, watchId },
          };
          sender?.(message);
        },
        sendUnwatch: () => {
          sender?.({ type: "terminal-unwatch", id });
        },
        deliverOutput: (data) => {
          fanout(id, (listener) => listener.onOutput(data));
        },
        deliverSnapshot: (snapshot) => {
          fanout(id, (listener) => listener.onSnapshot?.(snapshot));
        },
        deliverWatchError: (error) => {
          fanout(id, (listener) => listener.onWatchError?.(error));
        },
      },
      generateWatchId,
      schedule,
      limits,
      retry,
    });

  return {
    setSender(next, senderOptions) {
      // Suspension retains the cache's mode so resets still invalidate it.
      // The next live socket must negotiate its own mode afresh.
      const wantCursorSync =
        next === null
          ? cursorSyncActive
          : senderOptions?.cursorSyncVersion === TERMINAL_CURSOR_SYNC_VERSION;
      // Idempotent: re-activating the same socket with the same mode must not
      // resend watches (and must not retransmit history). A null -> callback
      // transition is a change and still rewatches.
      if (next === sender && wantCursorSync === cursorSyncActive) return;
      sender = next;
      cursorSyncActive = wantCursorSync;
      if (!next) {
        for (const session of sessions.values()) session.suspend();
        return;
      }
      for (const id of listeners.keys()) {
        if (wantCursorSync) {
          let session = sessions.get(id);
          if (!session) {
            session = createSession(id);
            sessions.set(id, session);
          }
          // New connection: fresh watchId baseline; stale ids/tags from the
          // previous connection are ignored from here on.
          session.rearm();
        } else {
          sessions.get(id)?.dispose();
          sessions.delete(id);
          next({ type: "terminal-watch", id });
        }
      }
    },
    watch(id, listener) {
      let set = listeners.get(id);
      const isFirst = !set;
      if (!set) {
        set = new Set();
        listeners.set(id, set);
      }
      // Register before any send so no baseline/output can race the listener.
      set.add(listener);
      if (isFirst) {
        if (sender && cursorSyncActive) {
          const session = createSession(id);
          sessions.set(id, session);
          session.rearm();
        } else {
          sender?.({ type: "terminal-watch", id });
        }
      } else if (cursorSyncActive) {
        // Mid-session join to an existing cursor-sync watch: serve the bounded
        // active cache so the view is never live-only empty. Script listeners
        // (no onSnapshot) get nothing here — no replay, ever.
        const session = sessions.get(id);
        const snapshot = session?.currentSnapshot();
        if (snapshot) listener.onSnapshot?.(snapshot);
        const error = session?.currentError();
        if (error) listener.onWatchError?.(error);
      }
      return () => {
        const current = listeners.get(id);
        if (!current || !current.delete(listener)) return;
        if (current.size === 0) {
          listeners.delete(id);
          // Final unsubscribe: unwatch and drop cache/queues/timers.
          sessions.get(id)?.dispose();
          sessions.delete(id);
          resetEpochs.delete(id);
          sender?.({ type: "terminal-unwatch", id });
        }
      };
    },
    handleServerMessage(message) {
      if (message.type === "terminal-output") {
        if (cursorSyncActive) {
          // Cursor-authoritative mode: untagged frames are never passed
          // through raw (that would be a silent live-only fallback); a tagged
          // frame for an unknown/stale watch is ignored.
          const session = sessions.get(message.id);
          if (session) {
            const cursorSync = message.cursorSync;
            if (cursorSync) {
              session.handleFrame(cursorSync.watchId, {
                generation: cursorSync.generation,
                fromCursor: cursorSync.fromCursor,
                toCursor: cursorSync.toCursor,
                data: message.data,
              });
            } else {
              session.handleUntaggedFrame();
            }
          }
          return true;
        }
        fanout(message.id, (listener) => listener.onOutput(message.data));
        return true;
      }
      if (message.type === "terminal-watch-result") {
        if (cursorSyncActive) {
          sessions
            .get(message.id)
            ?.handleResult(message.cursorSync.watchId, message.cursorSync.result);
        }
        return true;
      }
      return false;
    },
    emitReset(id) {
      const set = listeners.get(id);
      if (!set) return;
      // Bump before notifying: any output fanout still in flight (a reset can
      // only be triggered from inside a callback) sees the new epoch and stops
      // delivering pre-reset bytes to listeners not yet reached.
      resetEpochs.set(id, (resetEpochs.get(id) ?? 0) + 1);
      fanout(id, (listener) => listener.onReset());
      // A reset is a legitimate re-arm: fresh watchId, prior generation and
      // cache invalid. This is also how a not-found watch recovers once a
      // deferred spawn actually starts the PTY (the server clears the failed
      // watch, so the new watch installs cleanly). While disconnected the
      // cache/generation is still invalidated — no timers, no sends; the new
      // connection's setSender re-arm sends the fresh watch.
      if (!cursorSyncActive || listeners.get(id) !== set || set.size === 0) return;
      let session = sessions.get(id);
      if (!session) {
        session = createSession(id);
        sessions.set(id, session);
      }
      if (sender) session.restart();
      else session.invalidate();
    },
    emitExited(id, exitCode) {
      // The retained cache must not keep advertising a running process to
      // late visual listeners.
      if (cursorSyncActive) sessions.get(id)?.markExited();
      fanout(id, (listener) => listener.onExited(exitCode));
    },
    reset() {
      for (const id of listeners.keys()) sender?.({ type: "terminal-unwatch", id });
      listeners.clear();
      for (const session of sessions.values()) session.dispose();
      sessions.clear();
      resetEpochs.clear();
    },
  };
}
