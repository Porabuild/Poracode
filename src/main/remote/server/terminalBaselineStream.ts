import type { WebSocket } from "ws";

/**
 * Cursor-sync v2 chunked-baseline delivery (design: WS3 #1, RESUME-V2-DESIGN).
 *
 * A chunked baseline is streamed per watch as ordered, pre-serialized
 * `terminal-watch-baseline-chunk` messages under two bounds:
 *
 * - **Chunk budget** — fixed at compose time by
 *   `sliceTerminalBaselineChunks` (encoded envelope bytes, code-point aligned).
 * - **Credit window** — the scheduler emits the next chunk only while the
 *   stream's unacknowledged envelope bytes stay under the client-negotiated
 *   window AND the real socket queue (`ws.bufferedAmount`) plus the next
 *   chunk stays under it. The window is what guarantees the 25 s/5 s app
 *   heartbeat still traverses a 32 kbps link mid-baseline: a pong enqueued
 *   mid-stream sits behind at most ~half a window of baseline bytes
 *   (control-frame bypass below), never behind a whole 138 kB v1 message.
 *
 * Fairness across the shared backend-host event loop: the drain loop yields
 * between sends (`setImmediate`) and releases at most one chunk per
 * connection per tick, so one slow client cannot monopolize the loop shared
 * with SQLite, supervisor IPC, and the PWA. Per connection at most
 * {@link MAX_STREAMS_PER_CONNECTION} baselines stream concurrently; further
 * v2 watches are fully installed (reliable registration, interest barrier)
 * but queue here for a stream slot, and the client's idle deadline only arms
 * at the first chunk.
 *
 * Cleanup is event-driven: every send re-validates the watch epoch (a rewatch
 * or unwatch abandons the stream at the next tick), and connection close
 * drops its streams. There are no timers to leak; the only re-check timer
 * runs while a stream is stalled on socket backpressure.
 */

export interface TerminalBaselineStreamDeps {
  /** True when this exact (connection, watchId, epoch) is still the installed watch. */
  readonly isCurrent: (
    ws: WebSocket,
    terminalId: string,
    watchId: string,
    epoch: number,
  ) => boolean;
  /** Send a pre-serialized chunk message. Returns false when the socket is gone. */
  readonly sendRaw: (ws: WebSocket, data: string) => boolean;
}

export interface TerminalBaselineStreamSpec {
  readonly terminalId: string;
  readonly watchId: string;
  /** Install epoch from `TerminalCursorSyncRegistry.setReliable`. */
  readonly epoch: number;
  /** Pre-serialized chunk messages, strictly ordered. */
  readonly messages: readonly string[];
  /** Encoded envelope bytes per message (same order). */
  readonly messageBytes: readonly number[];
  /** Baseline cursor reached by each message (same order). */
  readonly throughCursors: readonly number[];
  /** Final baseline cursor; the stream completes when an ACK reaches it. */
  readonly finalCursor: number;
  /** Unacknowledged encoded-byte credit window (server-clamped). */
  readonly windowBytes: number;
}

interface ActiveStream {
  readonly spec: TerminalBaselineStreamSpec;
  nextChunk: number;
  /** Index of the first chunk whose envelope bytes are still unreleased. */
  nextUnacked: number;
  unackedBytes: number;
}

/** Typical UI watches 1–2 terminals; extra baselines queue for a slot. */
export const MAX_STREAMS_PER_CONNECTION = 2;

export class TerminalBaselineStreamScheduler {
  private readonly deps: TerminalBaselineStreamDeps;

  private readonly active = new Map<WebSocket, ActiveStream[]>();
  private readonly queued = new Map<WebSocket, ActiveStream[]>();
  /** Set when a control frame (pong) was enqueued while streams were
   * streaming; the connection's streams then hold until the socket queue
   * drops to half the stream window so the control frame clears fast. */
  private readonly controlPending = new Set<WebSocket>();
  private drainScheduled = false;
  private backpressureTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: TerminalBaselineStreamDeps) {
    this.deps = deps;
  }

  /** Register a composed baseline. The watch is already reliably installed;
   * this only schedules the transport of its chunks. */
  enqueue(ws: WebSocket, spec: TerminalBaselineStreamSpec): void {
    if (ws.readyState !== ws.OPEN) return;
    const stream: ActiveStream = { spec, nextChunk: 0, nextUnacked: 0, unackedBytes: 0 };
    let list = this.queued.get(ws);
    if (!list) {
      list = [];
      this.queued.set(ws, list);
    }
    list.push(stream);
    this.promote(ws);
    this.scheduleDrain();
  }

  /** The server enqueued a control frame (pong) on this socket. */
  noteControlSend(ws: WebSocket): void {
    if (!this.hasStreams(ws)) return;
    this.controlPending.add(ws);
    this.scheduleDrain();
  }

  /**
   * Cumulative client ACK: releases the envelope bytes of every chunk whose
   * cursor the client has reached, and completes the stream once the final
   * cursor is acknowledged. ACKs for stale/unknown watchIds are ignored.
   */
  acknowledge(ws: WebSocket, terminalId: string, watchId: string, throughCursor: number): void {
    const list = this.active.get(ws);
    if (!list) return;
    const index = list.findIndex(
      (stream) => stream.spec.terminalId === terminalId && stream.spec.watchId === watchId,
    );
    if (index < 0) return;
    const stream = list[index]!;
    while (
      stream.nextUnacked < stream.spec.throughCursors.length &&
      stream.spec.throughCursors[stream.nextUnacked]! <= throughCursor
    ) {
      stream.unackedBytes -= stream.spec.messageBytes[stream.nextUnacked]!;
      stream.nextUnacked += 1;
    }
    if (throughCursor >= stream.spec.finalCursor) {
      this.removeActive(ws, index);
      this.promote(ws);
    }
    this.scheduleDrain();
  }

  /** Connection teardown: drop every stream and queued baseline. */
  clearConnection(ws: WebSocket): void {
    this.active.delete(ws);
    this.queued.delete(ws);
    this.controlPending.delete(ws);
  }

  /** Full reset (server dispose): drop every connection's streams. */
  clearAll(): void {
    this.active.clear();
    this.queued.clear();
    this.controlPending.clear();
  }

  /** Test/inspection hook: active and queued stream counts for a connection. */
  counts(ws: WebSocket): { active: number; queued: number } {
    return {
      active: this.active.get(ws)?.length ?? 0,
      queued: this.queued.get(ws)?.length ?? 0,
    };
  }

  private hasStreams(ws: WebSocket): boolean {
    return (this.active.get(ws)?.length ?? 0) > 0 || (this.queued.get(ws)?.length ?? 0) > 0;
  }

  private promote(ws: WebSocket): void {
    const queue = this.queued.get(ws);
    if (!queue?.length) return;
    let active = this.active.get(ws);
    if (!active) {
      active = [];
      this.active.set(ws, active);
    }
    while (queue.length > 0 && active.length < MAX_STREAMS_PER_CONNECTION) {
      active.push(queue.shift()!);
    }
  }

  private removeActive(ws: WebSocket, index: number): void {
    const list = this.active.get(ws);
    if (!list) return;
    list.splice(index, 1);
    if (list.length === 0) {
      this.active.delete(ws);
      this.controlPending.delete(ws);
    }
    this.promote(ws);
  }

  private scheduleDrain(): void {
    if (this.drainScheduled) return;
    this.drainScheduled = true;
    setImmediate(() => {
      this.drainScheduled = false;
      this.drain();
    });
  }

  /** One chunk per connection per tick, round-robin across connections and
   * across that connection's streams. */
  private drain(): void {
    let anySent = false;
    let anyStalled = false;
    for (const [ws] of [...this.active]) {
      if (ws.readyState !== ws.OPEN) {
        this.clearConnection(ws);
        continue;
      }
      // Drop streams whose watch was replaced (rewatch/unwatch/reset).
      const list = this.active.get(ws);
      if (!list) continue;
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const stream = list[i]!;
        if (
          !this.deps.isCurrent(ws, stream.spec.terminalId, stream.spec.watchId, stream.spec.epoch)
        ) {
          this.removeActive(ws, i);
        }
      }
      const remaining = this.active.get(ws);
      if (!remaining?.length) {
        anySent = true; // removal is progress; keep the loop alive
        continue;
      }
      let sent = false;
      for (let i = 0; i < remaining.length && !sent; i += 1) {
        const stream = remaining[i]!;
        if (stream.nextChunk >= stream.spec.messages.length) continue; // sent out; awaiting final ack
        sent = this.trySendNext(ws, stream);
        if (sent) {
          // Round-robin: move the just-served stream behind its siblings.
          remaining.push(remaining.splice(i, 1)[0]!);
        }
      }
      if (sent) {
        anySent = true;
      } else if (remaining.some((s) => s.nextChunk < s.spec.messages.length)) {
        anyStalled = true;
      }
    }
    if (anySent) {
      this.scheduleDrain();
      return;
    }
    if (anyStalled) this.scheduleBackpressureRecheck();
  }

  /** Socket queue drains asynchronously while the client reads; re-check
   * stalled streams briefly rather than busy-looping. */
  private scheduleBackpressureRecheck(): void {
    if (this.backpressureTimer) return;
    this.backpressureTimer = setTimeout(() => {
      this.backpressureTimer = null;
      this.drain();
    }, 50);
    this.backpressureTimer.unref?.();
  }

  private trySendNext(ws: WebSocket, stream: ActiveStream): boolean {
    const { spec } = stream;
    if (stream.nextChunk >= spec.messages.length) return false;
    if (stream.unackedBytes + spec.messageBytes[stream.nextChunk]! > spec.windowBytes) {
      return false;
    }
    const buffered = ws.bufferedAmount;
    // Control-frame bypass: while a pong is queued behind baseline bytes,
    // hold chunks until the queue halves so the pong clears quickly.
    if (this.controlPending.has(ws) && buffered > spec.windowBytes / 2) {
      return false;
    }
    if (buffered + spec.messageBytes[stream.nextChunk]! >= spec.windowBytes) {
      return false;
    }
    const sent = this.deps.sendRaw(ws, spec.messages[stream.nextChunk]!);
    if (!sent) {
      this.clearConnection(ws);
      return false;
    }
    stream.unackedBytes += spec.messageBytes[stream.nextChunk]!;
    stream.nextChunk += 1;
    return true;
  }
}
