import type { RuntimeEvent } from "@/shared/contracts";
import type { EventSequenceSpace } from "@/shared/eventSequenceSpace";

/**
 * The final renderer consumer cannot apply an unbounded stream of runtime
 * deltas. Keep the queue finite and make overflow an explicit recovery event;
 * callers must rebuild the affected thread from authoritative state before
 * resuming live delivery.
 */
export const RUNTIME_EVENT_QUEUE_LIMITS = {
  maxEvents: 4_096,
  maxBytes: 8 * 1024 * 1024,
  maxThreadBytes: 2 * 1024 * 1024,
} as const;

export interface RuntimeEventQueueBatch {
  readonly threadId: string;
  readonly events: RuntimeEvent[];
}

export interface RuntimeEventQueueEnqueueResult {
  readonly accepted: boolean;
  readonly overflowed: boolean;
  readonly blocked: boolean;
}

export interface RuntimeEventQueueDiagnostics {
  readonly queuedEvents: number;
  readonly queuedBytes: number;
  readonly blockedThreads: number;
  readonly overflowCount: number;
  readonly peakQueuedBytes: number;
}

interface PendingThreadEvents {
  events: Array<{ event: RuntimeEvent; sequence?: number; space: EventSequenceSpace }>;
  bytes: number;
}

const textEncoder = new TextEncoder();

export class RuntimeEventQueue {
  private readonly pending = new Map<string, PendingThreadEvents>();
  private readonly blockedThreads = new Set<string>();
  private queuedEvents = 0;
  private queuedBytes = 0;
  private overflowCount = 0;
  private peakQueuedBytes = 0;

  constructor(
    private readonly limits: {
      readonly maxEvents?: number;
      readonly maxBytes?: number;
      readonly maxThreadBytes?: number;
    } = {},
  ) {}

  enqueue(
    threadId: string,
    events: readonly RuntimeEvent[],
    sequence?: number,
    space: EventSequenceSpace = "ipc",
  ): RuntimeEventQueueEnqueueResult {
    if (events.length === 0) return { accepted: true, overflowed: false, blocked: false };
    if (this.blockedThreads.has(threadId)) {
      // Keep a bounded post-baseline tail while authoritative recovery is in
      // flight. It is hidden from drain until resume(), so events observed
      // after the recovery read are replayed instead of silently discarded.
      const existing = this.pending.get(threadId);
      const bytes = events.reduce((total, event) => total + runtimeEventBytes(event), 0);
      const nextThreadBytes = (existing?.bytes ?? 0) + bytes;
      const exceedsLimits =
        nextThreadBytes >
          (this.limits.maxThreadBytes ?? RUNTIME_EVENT_QUEUE_LIMITS.maxThreadBytes) ||
        this.queuedEvents + events.length >
          (this.limits.maxEvents ?? RUNTIME_EVENT_QUEUE_LIMITS.maxEvents) ||
        this.queuedBytes + bytes > (this.limits.maxBytes ?? RUNTIME_EVENT_QUEUE_LIMITS.maxBytes);
      if (exceedsLimits) {
        if (existing) this.removePending(threadId, existing);
        this.overflowCount += 1;
        return { accepted: false, overflowed: true, blocked: true };
      }
      if (existing) {
        existing.events.push(...events.map((event) => stampQueuedEvent(event, sequence, space)));
        existing.bytes += bytes;
      } else {
        this.pending.set(threadId, {
          events: events.map((event) => stampQueuedEvent(event, sequence, space)),
          bytes,
        });
      }
      this.queuedEvents += events.length;
      this.queuedBytes += bytes;
      this.peakQueuedBytes = Math.max(this.peakQueuedBytes, this.queuedBytes);
      return { accepted: true, overflowed: false, blocked: true };
    }
    const bytes = events.reduce((total, event) => total + runtimeEventBytes(event), 0);
    const existing = this.pending.get(threadId);
    const nextThreadBytes = (existing?.bytes ?? 0) + bytes;
    const exceedsLimits =
      nextThreadBytes > (this.limits.maxThreadBytes ?? RUNTIME_EVENT_QUEUE_LIMITS.maxThreadBytes) ||
      this.queuedEvents + events.length >
        (this.limits.maxEvents ?? RUNTIME_EVENT_QUEUE_LIMITS.maxEvents) ||
      this.queuedBytes + bytes > (this.limits.maxBytes ?? RUNTIME_EVENT_QUEUE_LIMITS.maxBytes);
    if (exceedsLimits) {
      if (existing) this.removePending(threadId, existing);
      this.blockedThreads.add(threadId);
      this.overflowCount += 1;
      return { accepted: false, overflowed: true, blocked: true };
    }
    if (existing) {
      existing.events.push(...events.map((event) => stampQueuedEvent(event, sequence, space)));
      existing.bytes += bytes;
    } else {
      this.pending.set(threadId, {
        events: events.map((event) => stampQueuedEvent(event, sequence, space)),
        bytes,
      });
    }
    this.queuedEvents += events.length;
    this.queuedBytes += bytes;
    this.peakQueuedBytes = Math.max(this.peakQueuedBytes, this.queuedBytes);
    return { accepted: true, overflowed: false, blocked: false };
  }

  drain(shouldFlush: (threadId: string) => boolean): RuntimeEventQueueBatch[] {
    const batches: RuntimeEventQueueBatch[] = [];
    for (const [threadId, pending] of this.pending) {
      if (this.blockedThreads.has(threadId) || !shouldFlush(threadId)) continue;
      batches.push({
        threadId,
        events: pending.events.map((entry) => entry.event),
      });
      this.removePending(threadId, pending);
    }
    return batches;
  }

  resume(threadId: string): void {
    this.blockedThreads.delete(threadId);
  }

  threadIds(): string[] {
    return [...this.pending.keys()].filter((threadId) => !this.blockedThreads.has(threadId));
  }

  has(threadId: string): boolean {
    return this.pending.has(threadId);
  }

  discard(threadId: string): void {
    const pending = this.pending.get(threadId);
    if (pending) this.removePending(threadId, pending);
  }

  discardThroughSequence(
    threadId: string,
    sequence: number,
    space: EventSequenceSpace = "ipc",
  ): void {
    const pending = this.pending.get(threadId);
    if (!pending) return;
    const retained = pending.events.filter(
      (entry) => entry.space !== space || entry.sequence === undefined || entry.sequence > sequence,
    );
    if (retained.length === pending.events.length) return;
    this.queuedEvents -= pending.events.length - retained.length;
    this.queuedBytes -= pending.events
      .filter(
        (entry) =>
          entry.space === space && entry.sequence !== undefined && entry.sequence <= sequence,
      )
      .reduce((total, entry) => total + runtimeEventBytes(entry.event), 0);
    if (retained.length === 0) this.pending.delete(threadId);
    else {
      this.pending.set(threadId, {
        events: retained,
        bytes: retained.reduce((total, entry) => total + runtimeEventBytes(entry.event), 0),
      });
    }
  }

  hasUnsequenced(threadId: string): boolean {
    return (
      this.pending.get(threadId)?.events.some((entry) => entry.sequence === undefined) ?? false
    );
  }

  clear(): void {
    this.pending.clear();
    this.blockedThreads.clear();
    this.queuedEvents = 0;
    this.queuedBytes = 0;
  }

  getDiagnostics(): RuntimeEventQueueDiagnostics {
    return {
      queuedEvents: this.queuedEvents,
      queuedBytes: this.queuedBytes,
      blockedThreads: this.blockedThreads.size,
      overflowCount: this.overflowCount,
      peakQueuedBytes: this.peakQueuedBytes,
    };
  }

  private removePending(threadId: string, pending: PendingThreadEvents): void {
    this.pending.delete(threadId);
    this.queuedEvents -= pending.events.length;
    this.queuedBytes -= pending.bytes;
  }
}

function stampQueuedEvent(
  event: RuntimeEvent,
  sequence: number | undefined,
  space: EventSequenceSpace,
): { event: RuntimeEvent; sequence?: number; space: EventSequenceSpace } {
  return sequence !== undefined ? { event, sequence, space } : { event, space };
}

function runtimeEventBytes(event: RuntimeEvent): number {
  return textEncoder.encode(JSON.stringify(event)).byteLength;
}
