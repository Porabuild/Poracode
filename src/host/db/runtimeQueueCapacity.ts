import type { RuntimeQueueBounds } from "./runtimeWriteQueue";

export interface RuntimeThreadQueueCapacity {
  threadId: string;
  pendingEvents: number;
  pendingBytes: number;
  reservedEvents: number;
  reservedBytes: number;
  remainingEvents: number;
  remainingBytes: number;
  /** A lone event may use the existing oversize slot only in an empty thread. */
  maxNextEventBytes: number;
  pinnedThrough: number | null;
}

export interface RuntimeQueueCapacitySnapshot {
  generation: number;
  revision: number;
  /** Queue intake watermark, distinct from supervisor transport flow sequences. */
  throughPersistSeq: number;
  global: {
    pendingEvents: number;
    pendingBytes: number;
    reservedEvents: number;
    reservedBytes: number;
    remainingEvents: number;
    remainingBytes: number;
  };
  limits: Readonly<RuntimeQueueBounds>;
  threads: RuntimeThreadQueueCapacity[];
}

export interface RuntimeQueueCapacityChange {
  generation: number;
  revision: number;
  throughPersistSeq: number;
  kind:
    | "admitted"
    | "committed"
    | "discarded"
    | "pin"
    | "reset"
    | "reserved"
    | "reservation-released";
  threadId?: string;
}

/**
 * Read-only queue geometry, not a reservation or a producer credit grant.
 * The caller selects threads so hot-path reads never scan all pending entries.
 * A future negotiated admission contract must reserve grants against other
 * writers and subtract envelopes not incorporated by its own input watermark.
 */
export function runtimeQueueCapacitySnapshot(options: {
  generation: number;
  revision: number;
  throughPersistSeq: number;
  pendingEvents: number;
  pendingBytes: number;
  reservedEvents?: number;
  reservedBytes?: number;
  bounds: RuntimeQueueBounds;
  threadIds: readonly string[];
  readThread: (threadId: string) => {
    pendingEvents: number;
    pendingBytes: number;
    reservedEvents?: number;
    reservedBytes?: number;
    pinnedThrough: number | null;
  };
}): RuntimeQueueCapacitySnapshot {
  const { bounds } = options;
  const reservedEvents = options.reservedEvents ?? 0;
  const reservedBytes = options.reservedBytes ?? 0;
  const remainingEvents = Math.max(
    0,
    bounds.maxPendingEventsGlobal - options.pendingEvents - reservedEvents,
  );
  const remainingBytes = Math.max(
    0,
    bounds.maxPendingBytesGlobal - options.pendingBytes - reservedBytes,
  );
  return {
    generation: options.generation,
    revision: options.revision,
    throughPersistSeq: options.throughPersistSeq,
    global: {
      pendingEvents: options.pendingEvents,
      pendingBytes: options.pendingBytes,
      reservedEvents,
      reservedBytes,
      remainingEvents,
      remainingBytes,
    },
    limits: { ...bounds },
    threads: options.threadIds.map((threadId) => {
      const observed = options.readThread(threadId);
      const thread = {
        ...observed,
        reservedEvents: observed.reservedEvents ?? 0,
        reservedBytes: observed.reservedBytes ?? 0,
      };
      const threadRemainingEvents = Math.max(
        0,
        bounds.maxPendingEventsPerThread - thread.pendingEvents - thread.reservedEvents,
      );
      const threadRemainingBytes = Math.max(
        0,
        bounds.maxPendingBytesPerThread - thread.pendingBytes - thread.reservedBytes,
      );
      return {
        threadId,
        ...thread,
        remainingEvents: threadRemainingEvents,
        remainingBytes: threadRemainingBytes,
        maxNextEventBytes:
          remainingEvents === 0 || threadRemainingEvents === 0
            ? 0
            : Math.min(
                remainingBytes,
                bounds.maxSingleEventBytes,
                thread.pendingEvents + thread.reservedEvents === 0
                  ? bounds.maxSingleEventBytes
                  : threadRemainingBytes,
              ),
      };
    }),
  };
}
