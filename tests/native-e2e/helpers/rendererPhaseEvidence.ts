import type {
  RendererPerfEventTimingRecord,
  RendererPerfLongTaskRecord,
  RendererPerfPhaseAggregate,
  RendererPerfSlowFrameRecord,
  RendererPerfSnapshot,
} from "../../../src/renderer/diagnostics/rendererPerfDiagnostics.ts";

/**
 * Phase-window extraction for the renderer diagnostics snapshot.
 *
 * The observer's ring buffers are global (not phase-tagged) and bounded, so
 * per-phase quantiles are computed from the records whose `startMs` falls
 * inside the phase window between two snapshots, and the number of records the
 * rings dropped during the window is reported alongside. Phase aggregates
 * (counts and maxima) are exact per phase and always reported too; a quantile
 * computed over a ring that dropped samples is not a full-population figure.
 *
 * Event Timing samples are event-level and censored at the observer's effective
 * `durationThreshold` (see `performanceObserverInstall.ts`). Every window
 * therefore publishes the effective/requested threshold, and interaction-level
 * figures group samples by `interactionId` (excluding null and 0) before
 * summarizing — a percentile over delivered events is never presented as an
 * interaction percentile.
 *
 * `status` distinguishes the three states the A0 gate requires:
 * - `unavailable`: the observer is not installed/unsupported; counts mean nothing.
 * - `no-samples`: supported but no entry was delivered in the window; this is
 *   NOT a measured zero.
 * - `measured`: at least one valid sample; a zero value here is a real zero.
 */

export interface LatencySummary {
  readonly count: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
}

export type SampleAvailability = "unavailable" | "no-samples" | "measured";

function roundMs(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}

export function summarizeSamples(samples: readonly number[]): LatencySummary {
  if (samples.length === 0) return { count: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
  const sorted = [...samples].sort((left, right) => left - right);
  const at = (fraction: number): number => {
    const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
    return roundMs(sorted[index] ?? 0);
  };
  return {
    count: sorted.length,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    p99Ms: at(0.99),
    maxMs: roundMs(sorted[sorted.length - 1] ?? 0),
  };
}

export function availabilityFor(observerStatus: string, sampleCount: number): SampleAvailability {
  if (observerStatus !== "supported") return "unavailable";
  return sampleCount > 0 ? "measured" : "no-samples";
}

export interface InteractionSummary {
  /** Distinct interaction ids (>0) with at least one usable duration. */
  readonly count: number;
  /** Per-interaction maximum event duration, summarized across interactions. */
  readonly duration: LatencySummary;
  /** Samples whose `interactionId` was null or 0 (not part of an interaction). */
  readonly samplesWithoutInteraction: number;
}

/**
 * Groups event records by `interactionId` and summarizes the per-interaction
 * maximum duration (INP-style). Samples with a null or 0 interaction id are
 * counted but excluded, because id 0 means "not part of an interaction".
 */
export function summarizeInteractions(
  records: readonly RendererPerfEventTimingRecord[],
): InteractionSummary {
  const maxima = new Map<number, number>();
  let samplesWithoutInteraction = 0;
  for (const record of records) {
    const id = record.interactionId;
    if (id === null || id === 0) {
      samplesWithoutInteraction += 1;
      continue;
    }
    if (record.interactionDurationMs === null) continue;
    const current = maxima.get(id);
    if (current === undefined || record.interactionDurationMs > current) {
      maxima.set(id, record.interactionDurationMs);
    }
  }
  return {
    count: maxima.size,
    duration: summarizeSamples([...maxima.values()]),
    samplesWithoutInteraction,
  };
}

/**
 * Completed accounting state of an Event Timing population. `unknown` means
 * the harness could not prove the window's delivered population (missing
 * snapshot, ring reset, unattributable identity); it is never numeric-budget
 * eligible, and it is not the same as a measured zero.
 */
export type EventTimingPopulationStatus = "complete" | "lossy" | "unknown";

export interface EventTimingPopulationProvenance {
  readonly status: EventTimingPopulationStatus;
  readonly notes: readonly string[];
}

export interface EventTimingWindowEvidence {
  readonly status: SampleAvailability;
  readonly observerStatus: string;
  readonly requestedCensoredAtMs: number | null;
  readonly censoredAtMs: number | null;
  readonly samples: number;
  readonly inputDelay: LatencySummary;
  readonly processing: LatencySummary;
  /** Event-level durations; censored at the effective threshold, 8 ms granularity. */
  readonly interactionDuration: LatencySummary;
  readonly interactionDurationNullCount: number;
  readonly interactions: InteractionSummary;
  /** Samples where every timing field is exactly 0 (a measured zero, not missing). */
  readonly measuredZeroCount: number;
  readonly droppedDuringWindow: number;
  /**
   * Population accounting provenance when the window was built by the
   * segmented aggregator. Absent on plain phase windows, where
   * `droppedDuringWindow` is already conservative (it counts every eviction in
   * the interval, including pre-window retained records).
   */
  readonly populationStatus?: EventTimingPopulationStatus;
  readonly populationNotes?: readonly string[];
}

export function summarizeEventTimingRecords(
  records: readonly RendererPerfEventTimingRecord[],
  droppedDuringWindow: number,
  observer: {
    readonly status: string;
    readonly requestedThresholdMs: number | null;
    readonly thresholdMs: number | null;
  },
  population?: EventTimingPopulationProvenance,
): EventTimingWindowEvidence {
  const interaction = records
    .map((record) => record.interactionDurationMs)
    .filter((value): value is number => value !== null);
  const measuredZeroCount = records.filter(
    (record) => record.inputDelayMs === 0 && record.processingMs === 0,
  ).length;
  return {
    status: availabilityFor(observer.status, records.length),
    observerStatus: observer.status,
    requestedCensoredAtMs: observer.requestedThresholdMs,
    censoredAtMs: observer.thresholdMs,
    samples: records.length,
    inputDelay: summarizeSamples(records.map((record) => record.inputDelayMs)),
    processing: summarizeSamples(records.map((record) => record.processingMs)),
    interactionDuration: summarizeSamples(interaction),
    interactionDurationNullCount: records.length - interaction.length,
    interactions: summarizeInteractions(records),
    measuredZeroCount,
    droppedDuringWindow,
    ...(population === undefined
      ? {}
      : { populationStatus: population.status, populationNotes: population.notes }),
  };
}

export interface LongTaskWindowEvidence {
  readonly status: SampleAvailability;
  readonly observerStatus: string;
  readonly samples: number;
  readonly over200Ms: number;
  readonly duration: LatencySummary;
  readonly droppedDuringWindow: number;
}

export function summarizeLongTaskRecords(
  records: readonly RendererPerfLongTaskRecord[],
  droppedDuringWindow: number,
  observerStatus: string,
): LongTaskWindowEvidence {
  return {
    status: availabilityFor(observerStatus, records.length),
    observerStatus,
    samples: records.length,
    over200Ms: records.filter((record) => record.durationMs >= 200).length,
    duration: summarizeSamples(records.map((record) => record.durationMs)),
    droppedDuringWindow,
  };
}

export interface SlowFrameWindowEvidence {
  readonly samples: number;
  readonly delta: LatencySummary;
  readonly droppedDuringWindow: number;
}

export function summarizeSlowFrameRecords(
  records: readonly RendererPerfSlowFrameRecord[],
  droppedDuringWindow: number,
): SlowFrameWindowEvidence {
  return {
    samples: records.length,
    delta: summarizeSamples(records.map((record) => record.deltaMs)),
    droppedDuringWindow,
  };
}

export interface ObserverStatusEvidence {
  readonly eventTimingStatus: string;
  readonly eventTimingRequestedDurationThresholdMs: number | null;
  readonly eventTimingDurationThresholdMs: number | null;
  readonly eventTimingSampleCount: number;
  readonly eventTimingSkippedEntryCount: number;
  readonly longTaskStatus: string;
  readonly longTaskSampleCount: number;
  readonly longTaskSkippedEntryCount: number;
}

export function observerStatusEvidence(snapshot: RendererPerfSnapshot): ObserverStatusEvidence {
  return {
    eventTimingStatus: snapshot.observers.eventTiming.status,
    eventTimingRequestedDurationThresholdMs:
      snapshot.observers.eventTiming.requestedDurationThresholdMs,
    eventTimingDurationThresholdMs: snapshot.observers.eventTiming.durationThresholdMs,
    eventTimingSampleCount: snapshot.observers.eventTiming.sampleCount,
    eventTimingSkippedEntryCount: snapshot.observers.eventTiming.skippedEntryCount,
    longTaskStatus: snapshot.observers.longTask.status,
    longTaskSampleCount: snapshot.observers.longTask.sampleCount,
    longTaskSkippedEntryCount: snapshot.observers.longTask.skippedEntryCount,
  };
}

export interface PhaseWindowEvidence {
  readonly phase: string;
  readonly capturedAtMonotonicMs: number;
  readonly aggregate: RendererPerfPhaseAggregate | null;
  readonly eventTimings: EventTimingWindowEvidence;
  readonly longTasks: LongTaskWindowEvidence;
  readonly slowFrames: SlowFrameWindowEvidence;
  readonly droppedSpansDuringWindow: number;
}

function inWindow(
  recordStartMs: number,
  before: RendererPerfSnapshot,
  after: RendererPerfSnapshot,
) {
  return (
    recordStartMs > before.capturedAtMonotonicMs && recordStartMs <= after.capturedAtMonotonicMs
  );
}

export function phaseWindowEvidence(
  before: RendererPerfSnapshot,
  after: RendererPerfSnapshot,
  phase: string,
): PhaseWindowEvidence {
  const eventRecords = after.recentEventTimings.filter((record) =>
    inWindow(record.startMs, before, after),
  );
  const longTaskRecords = after.recentLongTasks.filter((record) =>
    inWindow(record.startMs, before, after),
  );
  const slowFrameRecords = after.recentSlowFrames.filter((record) =>
    inWindow(record.atMs, before, after),
  );
  return {
    phase,
    capturedAtMonotonicMs: after.capturedAtMonotonicMs,
    aggregate: after.phases[phase] ?? null,
    eventTimings: summarizeEventTimingRecords(
      eventRecords,
      after.droppedEventTimings - before.droppedEventTimings,
      {
        status: after.observers.eventTiming.status,
        requestedThresholdMs: after.observers.eventTiming.requestedDurationThresholdMs,
        thresholdMs: after.observers.eventTiming.durationThresholdMs,
      },
    ),
    longTasks: summarizeLongTaskRecords(
      longTaskRecords,
      after.droppedLongTasks - before.droppedLongTasks,
      after.observers.longTask.status,
    ),
    slowFrames: summarizeSlowFrameRecords(
      slowFrameRecords,
      after.droppedSlowFrames - before.droppedSlowFrames,
    ),
    droppedSpansDuringWindow: after.droppedSpans - before.droppedSpans,
  };
}
