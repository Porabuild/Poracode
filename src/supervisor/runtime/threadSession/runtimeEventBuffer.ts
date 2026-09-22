import type { RuntimeEvent } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { coalesceRuntimeEvents } from "@/shared/coalesce";
import { estimateRuntimeEventBytes } from "@/shared/runtimeEventSize";

const RUNTIME_EVENT_BATCH_MS = 16;
const DEFAULT_MAX_PENDING_EVENTS_GLOBAL = 20_000;
const DEFAULT_MAX_PENDING_BYTES_GLOBAL = 8 * 1024 * 1024;
const DEFAULT_MAX_PENDING_EVENTS_PER_THREAD = 2_000;
const DEFAULT_MAX_PENDING_BYTES_PER_THREAD = 2 * 1024 * 1024;
/**
 * Envelope chunking bounds. One canonical envelope never carries more than
 * `maxEnvelopeBytesPerThread` estimated bytes for one thread (a single larger
 * event is emitted alone up to `maxSingleEventBytes`), and one multi envelope
 * never exceeds `maxEnvelopeBytesTotal` across threads. This keeps every host
 * admission <= its per-thread budget and makes the advertised in-flight window
 * arithmetic truthful.
 */
const DEFAULT_MAX_ENVELOPE_BYTES_PER_THREAD = 1024 * 1024;
const DEFAULT_MAX_ENVELOPE_BYTES_TOTAL = 4 * 1024 * 1024;
/** A canonical event above this is refused explicitly (session stop), never split. */
const DEFAULT_MAX_SINGLE_EVENT_BYTES = 8 * 1024 * 1024;

export const RUNTIME_EVENT_MAX_ENVELOPE_BYTES_PER_THREAD = DEFAULT_MAX_ENVELOPE_BYTES_PER_THREAD;
export const RUNTIME_EVENT_MAX_ENVELOPE_BYTES_TOTAL = DEFAULT_MAX_ENVELOPE_BYTES_TOTAL;
export const RUNTIME_EVENT_MAX_SINGLE_EVENT_BYTES = DEFAULT_MAX_SINGLE_EVENT_BYTES;

export interface RuntimeEventBufferOverflow {
  threadId: string;
  pendingEvents: number;
  pendingBytes: number;
  reason: "thread" | "global" | "oversize";
  /** True when the boundary was the host's canonical credit window. */
  creditBound?: boolean;
}

export interface RuntimeEventBufferOptions {
  /** Global count cap across all threads. */
  maxPendingEventsGlobal?: number;
  /** Global estimated-byte cap across all threads. */
  maxPendingBytesGlobal?: number;
  maxPendingEventsPerThread?: number;
  maxPendingBytesPerThread?: number;
  maxEnvelopeBytesPerThread?: number;
  maxEnvelopeBytesTotal?: number;
  maxSingleEventBytes?: number;
  /**
   * Remaining canonical bytes the host will credit right now. `Infinity` when
   * no credit window is negotiated (legacy host). Bytes counted here include
   * anything the supervisor already handed to the IPC channel but the host has
   * not acknowledged, so the window bounds kernel/receiver buffers too.
   */
  canonicalCapacity?: () => number;
  /**
   * B1 producer control: called (once per thread per overflow episode) when a
   * bounded batch exceeds a bound. The session manager stops the affected
   * session because this runtime has no declared provider pause; the bounded
   * batch is retained and flushed on resume, never silently dropped.
   */
  onOverflow?(info: RuntimeEventBufferOverflow): void;
}

interface PendingBatch {
  events: RuntimeEvent[];
  bytes: number;
  overflowNotified: boolean;
}

/**
 * Coalesces runtime events per thread and flushes them as IPC envelopes. A
 * single-thread tick uses the cheap `thread-runtime-event(s)` envelope; a
 * multi-thread tick collapses into one or more `thread-runtime-events-multi`
 * envelopes so IPC round-trips stay bounded when many threads stream at once.
 *
 * Consecutive `content.delta` events for the same item and stream are merged
 * at this boundary: a token-sized delta otherwise rides a ~250-byte envelope
 * end to end (persisted copies are coalesced separately), and every consumer
 * already merges identical-shape deltas on apply, so the merged form is
 * byte-compatible downstream.
 *
 * B1: the buffer is bounded per thread and globally. The per-thread cap is
 * enforced on the HEALTHY path too (a burst larger than the cap flushes
 * immediately, chunked, instead of growing to the global cap), and while host
 * backpressure (or an exhausted credit window) pauses flushing the caps trigger
 * the overflow hook instead of growing without limit. A single event above the
 * hard single-event bound is refused explicitly; it is never split or truncated.
 *
 * Credit accounting: every emitted envelope carries its exact estimated byte
 * size to the sender, which charges that same value to the negotiated window.
 * The gate is re-read before each envelope, so a batch may be emitted partially
 * when only part of it fits; the remainder stays in the bounded batch and is
 * released when an ack/drain/resume raises capacity. A stop marker queued for a
 * thread is held behind that thread's retained content and emitted only once
 * the content is fully out, so a client never sees a stop before the events it
 * supersedes.
 */
export class RuntimeEventBuffer {
  private readonly pending = new Map<string, PendingBatch>();
  /** Stop markers waiting for their thread's retained batch to drain. */
  private readonly stopMarkers = new Map<string, SupervisorEvent>();
  private readonly maxPendingEventsGlobal: number;
  private readonly maxPendingBytesGlobal: number;
  private readonly maxPendingEventsPerThread: number;
  private readonly maxPendingBytesPerThread: number;
  private readonly maxEnvelopeBytesPerThread: number;
  private readonly maxEnvelopeBytesTotal: number;
  private readonly maxSingleEventBytes: number;
  private readonly canonicalCapacity: () => number;
  private readonly onOverflow: RuntimeEventBufferOptions["onOverflow"];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private paused = false;
  private totalEvents = 0;
  private totalBytes = 0;

  constructor(
    private readonly emit: (
      event: SupervisorEvent,
      meta?: { estimatedBytes?: number },
    ) => boolean | void,
    options: RuntimeEventBufferOptions = {},
  ) {
    this.maxPendingEventsGlobal =
      options.maxPendingEventsGlobal ?? DEFAULT_MAX_PENDING_EVENTS_GLOBAL;
    this.maxPendingBytesGlobal = options.maxPendingBytesGlobal ?? DEFAULT_MAX_PENDING_BYTES_GLOBAL;
    this.maxPendingEventsPerThread =
      options.maxPendingEventsPerThread ?? DEFAULT_MAX_PENDING_EVENTS_PER_THREAD;
    this.maxPendingBytesPerThread =
      options.maxPendingBytesPerThread ?? DEFAULT_MAX_PENDING_BYTES_PER_THREAD;
    this.maxEnvelopeBytesPerThread =
      options.maxEnvelopeBytesPerThread ?? DEFAULT_MAX_ENVELOPE_BYTES_PER_THREAD;
    this.maxEnvelopeBytesTotal = options.maxEnvelopeBytesTotal ?? DEFAULT_MAX_ENVELOPE_BYTES_TOTAL;
    this.maxSingleEventBytes = options.maxSingleEventBytes ?? DEFAULT_MAX_SINGLE_EVENT_BYTES;
    this.canonicalCapacity = options.canonicalCapacity ?? (() => Number.POSITIVE_INFINITY);
    this.onOverflow = options.onOverflow;
  }

  append(threadId: string, event: RuntimeEvent): void {
    const bytes = estimateRuntimeEventBytes(event);
    if (bytes > this.maxSingleEventBytes) {
      // Explicit refusal: stop the session; the event is never split.
      const batch = this.pending.get(threadId);
      this.reportOverflow({
        threadId,
        pendingEvents: (batch?.events.length ?? 0) + 1,
        pendingBytes: (batch?.bytes ?? 0) + bytes,
        reason: "oversize",
      });
      return;
    }
    let batch = this.pending.get(threadId);
    if (!batch) {
      batch = { events: [], bytes: 0, overflowNotified: false };
      this.pending.set(threadId, batch);
    }
    batch.events.push(event);
    batch.bytes += bytes;
    this.totalEvents += 1;
    this.totalBytes += bytes;

    if (this.paused || this.canonicalCapacity() <= 0) {
      this.enforceCaps(threadId, this.canonicalCapacity() <= 0);
      return;
    }
    if (this.exceedsThreadCap(batch) || this.exceedsAnyGlobalCap()) {
      // A burst larger than the caps: flush now (chunked) instead of waiting
      // for the tick, so a healthy-path spike cannot reach the host at all.
      this.flush();
      const held = this.pending.get(threadId);
      if (held && (this.exceedsThreadCap(held) || this.exceedsAnyGlobalCap())) {
        // The flush could not release the burst (credit < batch or the sender
        // refused): the cap must still stop the producer instead of letting
        // the batch grow without limit while waiting for credit.
        this.enforceCaps(threadId, this.canonicalCapacity() < held.bytes);
      }
      return;
    }
    this.timer ??= setTimeout(() => {
      this.flush();
    }, RUNTIME_EVENT_BATCH_MS);
    this.timer.unref?.();
  }

  /**
   * Host persistence backpressure. While paused, no canonical envelope is
   * flushed; the bounded batch waits for resume. Control traffic
   * (thread-state, exits, requests) does not travel through this buffer.
   */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused) this.flush();
  }

  /**
   * Host credit window changed. When capacity returns, outstanding batches
   * flush; when it exhausts, flushing holds exactly like a pause but is
   * reported with `creditBound` so the stop path can tell the two apart.
   */
  setCanonicalCapacity(_remainingBytes: number): void {
    if (this.paused) return;
    if (this.canonicalCapacity() > 0) this.flush();
  }

  isPaused(): boolean {
    return this.paused;
  }

  hasPending(): boolean {
    return this.pending.size > 0;
  }

  pendingStats(): { events: number; bytes: number; threads: number } {
    return { events: this.totalEvents, bytes: this.totalBytes, threads: this.pending.size };
  }

  /**
   * Release one thread's retained batch ahead of a stop marker (post-batch
   * control ordering): the batch is emitted first, so a consumer never sees a
   * stop before the content it supersedes. Capacity-aware: whatever cannot be
   * credited stays buffered (bounded, flushed on the next credit grant).
   */
  releaseThread(threadId: string): void {
    this.clearTimerIfIdle();
    const batch = this.pending.get(threadId);
    if (!batch) {
      this.emitStopMarkerFor(threadId);
      return;
    }
    this.emitOneThread(threadId, batch);
  }

  /**
   * Queue an explicit stop marker for one thread. The marker is emitted as its
   * own control-class canonical envelope, but never before content the thread
   * already produced: while any part of the thread's batch is still retained
   * (credit or pause), the marker waits and is released the moment the batch
   * fully drains. When nothing is retained, the marker goes out immediately.
   */
  queueStopMarker(threadId: string, marker: SupervisorEvent): void {
    const batch = this.pending.get(threadId);
    if (!batch || batch.events.length === 0) {
      this.emitStopMarker(marker);
      return;
    }
    this.stopMarkers.set(threadId, marker);
    this.flush();
  }

  flush(): void {
    this.clearTimerIfIdle();
    if (this.paused || this.pending.size === 0) return;

    const entries = [...this.pending.entries()].filter(([, batch]) => batch.events.length > 0);
    if (entries.length === 0) return;

    if (entries.length === 1) {
      const [threadId, batch] = entries[0]!;
      this.emitOneThread(threadId, batch);
      return;
    }
    this.emitMultiThread(entries);
  }

  clearAllForThread(threadId: string): void {
    this.dropThread(threadId);
  }

  /** Drop every buffered batch (session teardown; bounded, rebuildable path only). */
  clear(): void {
    this.pending.clear();
    this.stopMarkers.clear();
    this.totalEvents = 0;
    this.totalBytes = 0;
  }

  /**
   * Emit one thread's batch as chunked envelopes, consuming whole chunks while
   * the live credit window accepts them. Whatever does not fit is retained
   * (coalesced) for the next credit grant.
   */
  private emitOneThread(threadId: string, batch: PendingBatch): void {
    const merged = coalesceRuntimeEvents(batch.events);
    const chunks = this.chunkEvents(merged);
    let emitted = 0;
    for (const chunk of chunks) {
      const envelope: SupervisorEvent =
        chunk.length === 1
          ? { type: "thread-runtime-event", threadId, event: chunk[0]! }
          : { type: "thread-runtime-events", threadId, events: chunk };
      if (!this.emitEnvelope(envelope)) break;
      emitted += chunk.length;
    }
    this.retainTail(threadId, merged, emitted);
  }

  /**
   * Pack per-thread chunks into multi envelopes bounded by
   * `maxEnvelopeBytesTotal`, emitting whole envelopes while the credit window
   * accepts them. Emitted events are counted per thread so a partially
   * delivered multi tick retains exactly the undelivered tail.
   */
  private emitMultiThread(entries: ReadonlyArray<[string, PendingBatch]>): void {
    const mergedByThread = new Map<string, RuntimeEvent[]>();
    const emittedByThread = new Map<string, number>();
    let current: Array<{ threadId: string; events: RuntimeEvent[] }> = [];
    let currentBytes = 0;
    let held = false;

    const flushCurrent = (): boolean => {
      if (current.length === 0) return true;
      const envelope: SupervisorEvent = { type: "thread-runtime-events-multi", batches: current };
      const bytes = estimateEnvelopeBytes(envelope);
      if (this.canonicalCapacity() < bytes) {
        held = true;
        return false;
      }
      if (this.emit(envelope, { estimatedBytes: bytes }) === false) {
        held = true;
        return false;
      }
      for (const batch of current) {
        emittedByThread.set(
          batch.threadId,
          (emittedByThread.get(batch.threadId) ?? 0) + batch.events.length,
        );
      }
      current = [];
      currentBytes = 0;
      return true;
    };

    outer: for (const [threadId, batch] of entries) {
      const merged = coalesceRuntimeEvents(batch.events);
      mergedByThread.set(threadId, merged);
      for (const chunk of this.chunkEvents(merged)) {
        const estimate = estimateEnvelopeBytes({
          type: "thread-runtime-events",
          threadId,
          events: chunk,
        });
        if (current.length > 0 && currentBytes + estimate > this.maxEnvelopeBytesTotal) {
          if (!flushCurrent()) break outer;
        }
        current.push({ threadId, events: chunk });
        currentBytes += estimate;
        if (currentBytes >= this.maxEnvelopeBytesTotal && !flushCurrent()) break outer;
      }
    }
    if (!held) flushCurrent();

    for (const [threadId, merged] of mergedByThread) {
      this.retainTail(threadId, merged, emittedByThread.get(threadId) ?? 0);
    }
  }

  /**
   * Send one envelope when the live credit window covers it and the downstream
   * callback accepts it. The envelope's estimate is passed to the sender so the
   * buffer gate and the sender ledger charge the same bytes.
   */
  private emitEnvelope(envelope: SupervisorEvent): boolean {
    const bytes = estimateEnvelopeBytes(envelope);
    if (this.canonicalCapacity() < bytes) return false;
    return this.emit(envelope, { estimatedBytes: bytes }) !== false;
  }

  /**
   * Replace a thread's batch with the coalesced representation, dropping it
   * when every event was emitted. Undelivered events stay in order.
   */
  private retainTail(threadId: string, merged: readonly RuntimeEvent[], emitted: number): void {
    const batch = this.pending.get(threadId);
    if (!batch) return;
    if (emitted >= merged.length) {
      this.dropThread(threadId);
      return;
    }
    const tail = emitted === 0 ? [...merged] : merged.slice(emitted);
    const bytes = tail.reduce((sum, event) => sum + estimateRuntimeEventBytes(event), 0);
    this.totalEvents += tail.length - batch.events.length;
    this.totalBytes += bytes - batch.bytes;
    batch.events = tail;
    batch.bytes = bytes;
  }

  private dropThread(threadId: string): void {
    const batch = this.pending.get(threadId);
    if (batch) {
      this.pending.delete(threadId);
      this.totalEvents -= batch.events.length;
      this.totalBytes -= batch.bytes;
      this.clearTimerIfIdle();
    }
    // The batch is fully out (or cleared): the thread's stop marker can no
    // longer overtake retained content.
    this.emitStopMarkerFor(threadId);
  }

  private emitStopMarkerFor(threadId: string): void {
    const marker = this.stopMarkers.get(threadId);
    if (!marker) return;
    this.stopMarkers.delete(threadId);
    this.emitStopMarker(marker);
  }

  private emitStopMarker(marker: SupervisorEvent): void {
    const bytes = estimateEnvelopeBytes(marker);
    try {
      this.emit(marker, { estimatedBytes: bytes });
    } catch (error) {
      console.error("[supervisor] runtime event buffer stop marker failed:", error);
    }
  }

  private clearTimerIfIdle(): void {
    if (this.pending.size > 0 || this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private exceedsThreadCap(batch: PendingBatch): boolean {
    return (
      batch.events.length > this.maxPendingEventsPerThread ||
      batch.bytes > this.maxPendingBytesPerThread
    );
  }

  private exceedsAnyGlobalCap(): boolean {
    return (
      this.totalEvents > this.maxPendingEventsGlobal || this.totalBytes > this.maxPendingBytesGlobal
    );
  }

  /**
   * Split coalesced events into chunks <= the per-thread envelope bound. A
   * single event above the bound is emitted alone (it was already bounded by
   * `maxSingleEventBytes` at append time).
   */
  private chunkEvents(events: readonly RuntimeEvent[]): RuntimeEvent[][] {
    const chunks: RuntimeEvent[][] = [];
    let current: RuntimeEvent[] = [];
    let currentBytes = 0;
    for (const event of events) {
      const bytes = estimateRuntimeEventBytes(event);
      if (current.length > 0 && currentBytes + bytes > this.maxEnvelopeBytesPerThread) {
        chunks.push(current);
        current = [];
        currentBytes = 0;
      }
      current.push(event);
      currentBytes += bytes;
      if (currentBytes >= this.maxEnvelopeBytesPerThread) {
        chunks.push(current);
        current = [];
        currentBytes = 0;
      }
    }
    if (current.length > 0) chunks.push(current);
    return chunks;
  }

  /**
   * The bounded batch is held (paused or credit-limited) and a cap is exceeded:
   * report the exact bound once per thread and stop the largest paused
   * producers until the global caps fit. A batch is never evicted here.
   */
  private enforceCaps(triggeredBy: string, creditBound: boolean): void {
    const triggered = this.pending.get(triggeredBy);
    if (
      triggered &&
      !triggered.overflowNotified &&
      (triggered.events.length > this.maxPendingEventsPerThread ||
        triggered.bytes > this.maxPendingBytesPerThread)
    ) {
      triggered.overflowNotified = true;
      this.reportOverflow({
        threadId: triggeredBy,
        pendingEvents: triggered.events.length,
        pendingBytes: triggered.bytes,
        reason: "thread",
        ...(creditBound ? { creditBound: true } : {}),
      });
    }
    if (
      this.totalEvents <= this.maxPendingEventsGlobal &&
      this.totalBytes <= this.maxPendingBytesGlobal
    ) {
      return;
    }
    // Global overflow: stop the largest held producers first; their bounded
    // batches stay resident and flush on resume.
    const ordered = [...this.pending.entries()]
      .filter(([, batch]) => !batch.overflowNotified)
      .sort((a, b) => b[1].bytes - a[1].bytes);
    let projectedEvents = this.totalEvents;
    let projectedBytes = this.totalBytes;
    for (const [threadId, batch] of ordered) {
      if (
        projectedEvents <= this.maxPendingEventsGlobal &&
        projectedBytes <= this.maxPendingBytesGlobal
      ) {
        break;
      }
      batch.overflowNotified = true;
      projectedEvents -= batch.events.length;
      projectedBytes -= batch.bytes;
      this.reportOverflow({
        threadId,
        pendingEvents: batch.events.length,
        pendingBytes: batch.bytes,
        reason: "global",
        ...(creditBound ? { creditBound: true } : {}),
      });
    }
  }

  private reportOverflow(info: RuntimeEventBufferOverflow): void {
    try {
      this.onOverflow?.(info);
    } catch (error) {
      console.error("[supervisor] runtime event buffer overflow handler failed:", error);
    }
  }
}

function estimateEnvelopeBytes(event: SupervisorEvent): number {
  if (
    event.type === "thread-runtime-event" ||
    event.type === "thread-runtime-events" ||
    event.type === "thread-runtime-events-multi"
  ) {
    const events =
      event.type === "thread-runtime-event"
        ? [event.event]
        : event.type === "thread-runtime-events"
          ? event.events
          : event.batches.flatMap((batch) => batch.events);
    let total = 256;
    for (const runtimeEvent of events) total += estimateRuntimeEventBytes(runtimeEvent);
    return total;
  }
  try {
    return Buffer.byteLength(JSON.stringify(event), "utf8");
  } catch {
    return DEFAULT_MAX_SINGLE_EVENT_BYTES + 1;
  }
}
