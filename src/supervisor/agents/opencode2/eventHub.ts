/**
 * Shared OpenCode 2 SSE fan-out.
 *
 * One `client.event.subscribe()` async-iteration per acquired `opencode2
 * serve` process (the V2 stream is server-wide and live-tail only), fanning
 * each event out to the per-session subscribers whose session id matches the
 * event's `data.sessionID`. Mirrors OpenCode 1's `sdkEventHub`: coalesced
 * flush frames, an activity heartbeat that aborts a silently-dead stream, and
 * reconnect-with-backoff — except that the V2 client reports keepalive frames
 * through `onActivity` instead of a heartbeat envelope, and stream errors
 * surface as the V2 error model (`ClientError` "Transport" carrying an
 * `AbortError` cause on a deliberate abort).
 *
 * Server-process death is handled by the session class (it owns the lease and
 * reacquires); this hub only owns the stream.
 */

import type { OpenCode2Client, V2Event } from "./clientTypes";
import { readOpenCode2EventSessionID } from "./eventMapping";

export interface OpenCode2EventSubscription {
  /**
   * Live session id. `undefined` until `openThread` resolves — the stream is
   * subscribed before that so no early event is missed, and unmatched events
   * are dropped.
   */
  sessionId(): string | undefined;
  onEvent(event: V2Event): void;
  /** Reconcile live-tail gaps before the hub admits another prompt. */
  onReconnect?(): Promise<void>;
  /** Include provider-owned child sessions and their creation events. */
  acceptsEvent?(event: V2Event): boolean;
}

const hubs = new WeakMap<OpenCode2Client, OpenCode2EventHub>();

const FLUSH_FRAME_MS = 16;
const STREAM_YIELD_MS = 8;
const RECONNECT_DELAY_MS = 250;
const CONNECTION_TIMEOUT_MS = 15_000;
// The server sends keepalives every 15 seconds; allow two missed intervals.
const HEARTBEAT_TIMEOUT_MS = 45_000;

export function subscribeOpenCode2ServerEvents(input: {
  client: OpenCode2Client;
  subscription: OpenCode2EventSubscription;
}): () => void {
  let hub = hubs.get(input.client);
  if (!hub) {
    hub = new OpenCode2EventHub(input.client);
    hubs.set(input.client, hub);
  }
  return hub.subscribe(input.subscription);
}

/** Wait until the live-tail stream is connected before admitting work. */
export function waitForOpenCode2ServerEvents(client: OpenCode2Client): Promise<void> {
  const hub = hubs.get(client);
  if (!hub) return Promise.reject(new Error("OpenCode 2 event stream is not subscribed."));
  return hub.waitUntilConnected();
}

/** True when a stream error is the clean end of a deliberate abort. */
function isAbortShutdown(error: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  if (name === "AbortError") return true;
  // `ClientError("Transport")` wraps the underlying fetch failure on `cause`.
  const cause = (error as { cause?: unknown }).cause;
  return (
    !!cause && typeof cause === "object" && (cause as { name?: unknown }).name === "AbortError"
  );
}

/** Consecutive deltas for the same stream merge into one queued event. */
function coalesceKey(event: V2Event): string | undefined {
  if (
    event.type !== "session.text.delta" &&
    event.type !== "session.reasoning.delta" &&
    event.type !== "session.tool.input.delta"
  ) {
    return undefined;
  }
  const data = event.data as {
    sessionID: string;
    assistantMessageID: string;
    ordinal?: number;
    id?: string;
  };
  return `${event.type}:${data.sessionID}:${data.assistantMessageID}:${data.ordinal ?? data.id ?? ""}`;
}

class OpenCode2EventHub {
  private readonly client: OpenCode2Client;
  private readonly subscribers = new Set<OpenCode2EventSubscription>();
  private queue: V2Event[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private streamAbort: AbortController | undefined;
  private heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private connected = false;
  private connectedOnce = false;
  private readonly readyWaiters = new Set<(error?: Error) => void>();
  private generation = 0;
  private lastFlushAt = 0;
  private streamErrorLogged = false;

  constructor(client: OpenCode2Client) {
    this.client = client;
  }

  subscribe(subscriber: OpenCode2EventSubscription): () => void {
    this.subscribers.add(subscriber);
    if (!this.running) this.start();

    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.subscribers.delete(subscriber);
      if (this.subscribers.size === 0) this.stop();
    };
  }

  waitUntilConnected(): Promise<void> {
    if (this.connected) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const done = (error?: Error) => {
        clearTimeout(timer);
        this.readyWaiters.delete(done);
        if (error) reject(error);
        else resolve();
      };
      const timer = setTimeout(
        () => done(new Error("OpenCode 2 event stream connection timed out.")),
        CONNECTION_TIMEOUT_MS,
      );
      this.readyWaiters.add(done);
    });
  }

  private start(): void {
    this.running = true;
    const generation = ++this.generation;
    void this.consume(generation);
  }

  private stop(): void {
    this.running = false;
    this.connected = false;
    for (const done of this.readyWaiters) done(new Error("OpenCode 2 event stream closed."));
    this.generation += 1;
    this.streamAbort?.abort();
    this.streamAbort = undefined;
    this.clearHeartbeat();
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    this.queue = [];
    if (hubs.get(this.client) === this) hubs.delete(this.client);
  }

  private async consume(generation: number): Promise<void> {
    while (this.running && this.generation === generation) {
      const streamAbort = new AbortController();
      this.streamAbort = streamAbort;
      try {
        const events = this.client.event.subscribe({
          signal: streamAbort.signal,
          onActivity: () => this.resetHeartbeat(streamAbort),
        });
        let yieldedAt = Date.now();
        this.resetHeartbeat(streamAbort);
        for await (const event of events) {
          this.resetHeartbeat(streamAbort);
          this.streamErrorLogged = false;
          if (event.type === "server.connected") {
            this.flush();
            if (this.connectedOnce) {
              // Per-session reconcile must not gate stream admission: one
              // session's failing recovery RPCs must not wedge every other
              // session on this shared server.
              await Promise.allSettled(
                [...this.subscribers].map(async (subscriber) => subscriber.onReconnect?.()),
              );
            }
            if (!this.running || this.generation !== generation) return;
            if (streamAbort.signal.aborted)
              throw new Error("OpenCode 2 stream closed during recovery.");
            this.connectedOnce = true;
            this.connected = true;
            for (const done of this.readyWaiters) done();
          }
          this.enqueue(event);
          // Yield to the event loop on long streams so flush timers and the
          // supervisor's own timers stay live (same as OpenCode 1).
          if (Date.now() - yieldedAt < STREAM_YIELD_MS) continue;
          yieldedAt = Date.now();
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      } catch (error) {
        this.logStreamError(error, streamAbort.signal);
      } finally {
        this.connected = false;
        if (this.streamAbort === streamAbort) this.streamAbort = undefined;
        this.clearHeartbeat();
      }

      if (!this.running || this.generation !== generation) return;
      await new Promise<void>((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
    }
  }

  /** Nothing to unwrap on V2 — the shared stream yields events directly. */
  private enqueue(event: V2Event): void {
    const key = coalesceKey(event);
    const previous = this.queue[this.queue.length - 1];
    if (key && previous && coalesceKey(previous) === key) {
      // The key guarantees both sides are delta events, so the merged payload
      // keeps the shape of the first one.
      const data = previous.data as { delta: string };
      const next = event.data as { delta: string };
      this.queue[this.queue.length - 1] = {
        ...previous,
        data: { ...data, delta: data.delta + next.delta },
      } as V2Event;
      return;
    }
    this.queue.push(event);
    this.scheduleFlush();
  }

  private logStreamError(error: unknown, signal: AbortSignal): void {
    if (isAbortShutdown(error, signal) || this.streamErrorLogged) return;
    this.streamErrorLogged = true;
    console.error("[opencode2] event stream failed:", error);
  }

  private resetHeartbeat(streamAbort: AbortController): void {
    if (this.heartbeatTimer) {
      this.heartbeatTimer.refresh();
      return;
    }
    // The V2 stream reports keepalives through `onActivity`; a silent window
    // longer than this means the connection is wedged — abort and reconnect.
    this.heartbeatTimer = setTimeout(() => streamAbort.abort(), HEARTBEAT_TIMEOUT_MS);
    this.heartbeatTimer.unref?.();
  }

  private clearHeartbeat(): void {
    if (!this.heartbeatTimer) return;
    clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    const elapsed = Date.now() - this.lastFlushAt;
    this.flushTimer = setTimeout(() => this.flush(), Math.max(0, FLUSH_FRAME_MS - elapsed));
  }

  private flush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    if (this.queue.length === 0) return;

    const events = this.queue;
    this.queue = [];
    this.lastFlushAt = Date.now();
    for (const event of events) {
      const sessionID = readOpenCode2EventSessionID(event);
      if (!sessionID) continue;
      for (const subscriber of this.subscribers) {
        if (
          subscriber.acceptsEvent
            ? !subscriber.acceptsEvent(event)
            : subscriber.sessionId() !== sessionID
        )
          continue;
        try {
          subscriber.onEvent(event);
        } catch (error) {
          console.error("[opencode2] event subscriber failed:", error);
        }
      }
    }
  }
}
