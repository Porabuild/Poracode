/**
 * Additive diagnostics sample for the bounded runtime persistence pipeline.
 * Mirrors the `appMetrics` precedent: an optional field on existing sample
 * lines, no format renumber, no prompts/output/paths. Bounds are admission
 * bounds, not throughput claims.
 */
export interface RuntimePersistenceSample {
  state: "healthy" | "degraded" | "refusing";
  pendingThreads: number;
  pendingEvents: number;
  pendingEstimatedBytes: number;
  oldestPendingAgeMs: number | null;
  admittedEvents: number;
  refusedAdmissions: number;
  refusedEvents: number;
  refusedBytes: number;
  flushAttempts: number;
  flushSuccesses: number;
  flushFailuresRetryable: number;
  flushFailuresStorage: number;
  flushFailuresFatal: number;
  flushDurationMs: {
    count: number;
    p50: number | null;
    p95: number | null;
    max: number | null;
  };
  committedThroughPersistSeq: number;
  coalescedInputBytes: number;
  coalescedOutputBytes: number;
  producerSignal: "none" | "pause" | "stop";
  shutdown: "not-attempted" | "drained" | "incomplete";
  /** Resident lone-oversize events admitted through the reserved oversize slot. */
  oversizeEvents: number;
  oversizeBytes: number;
  /** Threads contaminated by an explicit admission refusal (cleared by a rebase). */
  contaminatedThreads: number;
  /** Computed pause threshold (configured bulk minus advertised in-flight). */
  pauseThresholdBytes: number;
  /**
   * True when the advertised in-flight window left no working set and the
   * threshold clamped to the minimum instead of changing the configured bound.
   */
  pauseThresholdClamped: boolean;
  /** Queued idempotent control writes awaiting retry. */
  controlOperationsPending: number;
  /** Fence/mutation waiters currently queued (bounded). */
  accessWaiters: number;
  /** Accepted-but-uncommitted events explicitly superseded by applied rebases. */
  supersededAcceptedEvents: number;
}
