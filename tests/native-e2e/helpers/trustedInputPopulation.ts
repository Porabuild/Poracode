import type {
  RendererPerfEventTimingRecord,
  RendererPerfLongTaskRecord,
  RendererPerfSlowFrameRecord,
  RendererPerfSnapshot,
} from "../../../src/renderer/diagnostics/rendererPerfDiagnostics.ts";
import type { TrustedTypingEvidence } from "./managedAppSession.ts";
import {
  phaseWindowEvidence,
  summarizeEventTimingRecords,
  summarizeLongTaskRecords,
  summarizeSlowFrameRecords,
  type EventTimingPopulationProvenance,
  type EventTimingPopulationStatus,
  type EventTimingWindowEvidence,
  type PhaseWindowEvidence,
} from "./rendererPhaseEvidence.ts";
import type {
  ObserverSettledBarrier,
  RecorderState,
  RecorderTrustedEvent,
} from "./trustedInputProtocol.ts";

/**
 * Pure population accounting for the segmented trusted-idle phase.
 *
 * This module owns the arithmetic that turns the renderer diagnostics ring
 * snapshots plus the per-segment reads into a measured population, and the
 * eligibility policy over that population. It intentionally contains no CDP
 * or page-side protocol code so the accounting can be proven by unit tests
 * against frozen raw evidence.
 *
 * ## Ring identity (source: `perfRingBuffer.ts`)
 *
 * The diagnostics rings are count-capped FIFO buffers with drop-oldest
 * eviction. `droppedEventTimings` counts evictions since construction and
 * `recentEventTimings` is oldest-to-newest, so the *global push ordinal* of the
 * retained record at index `i` is `droppedEventTimings + i`. That ordinal is
 * invariant for a record while it stays retained and lets the harness treat
 * records as identities instead of comparing truncated value shapes (two
 * distinct delivered records can share every serialized field).
 *
 * ## Delivered population and loss
 *
 * The number of entries pushed during a window is the delta of
 * `dropped + retained`, not `retained + dropped` of the closing snapshot
 * alone: the closing ring still retains records delivered *before* the phase,
 * and an eviction of one of those is not a phase loss. For the whole phase:
 *
 *   deliveredDuringPhase = totalPushed(after) - totalPushed(before)
 *   unreadLostEntries    = max(0, deliveredDuringPhase - observedUnion)
 *
 * where `observedUnion` counts the distinct in-phase push ordinals every
 * segment actually read. A zero-sample union is a censored population (see
 * {@link evaluateIdlePopulation}); a positive `unreadLostEntries` is a lossy
 * population that never satisfies a numeric budget. Population state is
 * explicit — `complete`, `lossy` or `unknown` — and an `unknown` population
 * (missing snapshot, ring reset/reload, unattributable identity) can never
 * become numeric-budget eligible, even when its known loss figure is zero.
 */

export type SegmentedIdentityBasis = "ring-ordinals" | "structural-windows";
export type SegmentedPopulationStatus = EventTimingPopulationStatus;

/** An Event Timing record read from the ring, with its inferred push ordinal. */
export interface SegmentedEventTimingSample extends RendererPerfEventTimingRecord {
  /**
   * Global FIFO push ordinal (`droppedEventTimings + indexInSnapshot`) at the
   * read that produced this record. Optional so frozen pre-correction evidence
   * (value-shaped records only) can still be aggregated structurally.
   */
  readonly ringOrdinal?: number;
}

export interface SegmentedIdleSegmentEvidence {
  readonly index: number;
  readonly kind: "click-batch" | "type-batch";
  readonly dispatchedClicks: number;
  readonly dispatchedTypedChars: number;
  /** Disjoint snapshot window `(before, after]` for this batch. */
  readonly beforeCapturedAtMonotonicMs: number;
  readonly afterCapturedAtMonotonicMs: number;
  /** True when this window starts exactly where the previous window ended. */
  readonly contiguousWithPrevious: boolean;
  /**
   * Actual in-window Event Timing records read from the ring for this batch.
   * Ordinal-backed collection also records each record's `ringOrdinal`.
   */
  readonly samples: readonly SegmentedEventTimingSample[];
  /**
   * Records whose ring push happened inside this batch's window but whose
   * `startMs` belongs to an earlier segment (late observer delivery). They are
   * counted exactly once in the union.
   */
  readonly lateArrivalSamples: readonly SegmentedEventTimingSample[];
  readonly longTasks: readonly RendererPerfLongTaskRecord[];
  readonly slowFrames: readonly RendererPerfSlowFrameRecord[];
  readonly droppedEventTimings: number;
  readonly droppedLongTasks: number;
  readonly droppedSlowFrames: number;
  readonly droppedSpans: number;
  readonly skippedDelta: number;
  readonly eligibleTrustedInputs: number;
  readonly pageSideMaxDelayMs: number | null;
  readonly rafFramesDuringSegment: number;
  readonly durationMs: number;
  readonly barrier: ObserverSettledBarrier;
  readonly phaseEvents: readonly RecorderTrustedEvent[];
  readonly recorderBefore: RecorderState | null;
  readonly recorderAfter: RecorderState | null;
  /**
   * Typing fidelity for this segment's type batch: the actual editable text
   * read from the real composer before/after the batch, and whether the
   * declared chunk was inserted exactly once. Null for click batches. The
   * declared workload is only an honest declaration when this says verified.
   */
  readonly typingFidelity: TrustedTypingEvidence | null;
  /** Total accepted pushes (`dropped + retained`) at this window's opening read. */
  readonly openingTotalPushed?: number | null;
  /** Total accepted pushes (`dropped + retained`) at this window's closing read. */
  readonly closingTotalPushed?: number | null;
  /**
   * Newly pushed records observed in this window whose `startMs` is after the
   * closing boundary (clock-boundary anomaly). They are not timestamp-eligible
   * for the window but are still part of the delivered population and counted
   * in the union.
   */
  readonly futureStartSamples?: readonly SegmentedEventTimingSample[];
}

export interface SegmentedCollectionIntervalEvidence {
  readonly openingCapturedAtMonotonicMs: number | null;
  readonly closingCapturedAtMonotonicMs: number | null;
  /** Total accepted Event Timing pushes before the phase. */
  readonly openingTotalPushed: number | null;
  /** Total accepted Event Timing pushes after the phase. */
  readonly closingTotalPushed: number | null;
  /** Records already retained (and observed) before the phase started. */
  readonly prePhaseRetainedCount: number;
  readonly prePhaseDroppedCount: number;
  /** Records retained in the ring at the closing snapshot. */
  readonly retainedRingCount: number;
  readonly closingDroppedCount: number;
}

export interface SegmentedIdleAggregateEvidence {
  readonly batchCount: number;
  readonly clickBatches: number;
  readonly typeBatches: number;
  /** Sum of the raw in-window timestamp samples read from each segment window. */
  readonly rawSampleCount: number;
  /** Late-delivered records captured by the segment that observed them first. */
  readonly lateArrivalCount: number;
  /** Newly pushed records observed with a startMs after the closing boundary. */
  readonly futureStartSampleCount: number;
  /** Actual measured population: distinct observed in-phase ring identities. */
  readonly unionSampleCount: number;
  /** How the union deduplicated identities. */
  readonly identityBasis: SegmentedIdentityBasis;
  /** Records still retained in the bounded ring at the closing snapshot. */
  readonly retainedRingCount: number;
  readonly collectionInterval: SegmentedCollectionIntervalEvidence;
  /**
   * Corrected delivered population: every Event Timing entry pushed between
   * the phase's opening and closing snapshots. Null when it cannot be derived
   * (missing snapshot or ring reset).
   */
  readonly deliveredDuringPhase: number | null;
  /**
   * Delivered records evicted from the bounded ring before any segment read
   * them. Zero is required for a full-population percentile; it is only a
   * known lower bound when `populationStatus` is `unknown`.
   */
  readonly unreadLostEntries: number;
  /** Distinct records read more than once (identity collision; 0 expected). */
  readonly duplicateOrdinalCount: number;
  /** Observed ordinals outside the segment's own push interval (0 expected). */
  readonly ordinalOutOfRangeCount: number;
  readonly populationStatus: SegmentedPopulationStatus;
  readonly populationNotes: readonly string[];
  readonly rawLongTaskCount: number;
  readonly droppedEventTimingsTotal: number;
  readonly droppedLongTasksTotal: number;
  readonly droppedSlowFramesTotal: number;
  readonly droppedSpansTotal: number;
  readonly skippedDeltaTotal: number;
  readonly eligibleTrustedInputsTotal: number;
  readonly pageSideMaxDelayMs: number | null;
  readonly rafFramesDuringPhase: number;
  /** Declared trusted typing workload: sum of the type batches' declared chars. */
  readonly declaredTypedCharsTotal: number;
  /** Actual editable-text delta observed in the real composer across type batches. */
  readonly observedInsertedCharsTotal: number | null;
  readonly composerTextBefore: string | null;
  readonly composerTextAfter: string | null;
  /**
   * True when every type batch verified exactly-once insertion in the real
   * composer and the observed editable-text delta equals the declared character
   * count. Null when the cell declared no typed characters.
   */
  readonly typingFidelityVerified: boolean | null;
  /** Every segment window starts exactly where the previous one ended. */
  readonly windowsContiguous: boolean;
  /** No segment window overlaps another (checked from the recorded boundaries). */
  readonly windowsDisjoint: boolean;
  /** The bounded ring evicted records during the segmented phase. */
  readonly ringEvictionObserved: boolean;
  /**
   * True only when the delivered population is fully accounted for: no unread
   * loss, no skipped entries, no reset/missing snapshot and a supported
   * identity basis. Only then may the union satisfy a numeric budget.
   */
  readonly populationComplete: boolean;
}

/**
 * Total accepted pushes represented by a diagnostics snapshot: every record
 * ever pushed is either still retained or counted in `droppedEventTimings`.
 * Returns null when the snapshot is missing or malformed (never a fabricated
 * number).
 */
export function ringTotalPushed(
  snapshot: {
    readonly recentEventTimings: readonly unknown[];
    readonly droppedEventTimings: number;
  } | null,
): number | null {
  if (snapshot === null) return null;
  const dropped = snapshot.droppedEventTimings;
  if (!Number.isSafeInteger(dropped) || dropped < 0) return null;
  return dropped + snapshot.recentEventTimings.length;
}

/** Global push ordinal of the retained record at `index` in `snapshot`. */
export function ringOrdinalOf(
  snapshot: { readonly droppedEventTimings: number } | null,
  index: number,
): number | null {
  if (snapshot === null) return null;
  const dropped = snapshot.droppedEventTimings;
  if (!Number.isSafeInteger(dropped) || dropped < 0) return null;
  return dropped + index;
}

function trustedPageSideDelay(events: readonly RecorderTrustedEvent[]): number | null {
  const delays = events
    .filter((event) => event.isTrusted)
    .map((event) => event.recordedAtMs - event.timeStamp);
  return delays.length > 0 ? Math.max(...delays) : null;
}

interface ObservedUnion {
  readonly sampleCount: number;
  readonly identityBasis: SegmentedIdentityBasis;
  readonly duplicateOrdinalCount: number;
  readonly ordinalOutOfRangeCount: number;
  readonly records: readonly SegmentedEventTimingSample[];
}

/**
 * Distinct observed in-phase identities. Ordinal-backed evidence dedupes by
 * the ring push ordinal (exact identity, no value comparison); pre-correction
 * evidence without ordinals falls back to the structural window partition,
 * whose segments already classify each record into exactly one segment.
 */
function collectObservedUnion(segments: readonly SegmentedIdleSegmentEvidence[]): ObservedUnion {
  const segmentRecords = (segment: SegmentedIdleSegmentEvidence) => [
    ...segment.samples,
    ...segment.lateArrivalSamples,
    ...(segment.futureStartSamples ?? []),
  ];
  const ordinalBacked =
    segments.length > 0 &&
    segments.every(
      (segment) =>
        typeof segment.openingTotalPushed === "number" &&
        typeof segment.closingTotalPushed === "number" &&
        segmentRecords(segment).every((record) => typeof record.ringOrdinal === "number"),
    );
  if (!ordinalBacked) {
    const records = segments.flatMap((segment) => segmentRecords(segment));
    return {
      sampleCount: records.length,
      identityBasis: "structural-windows",
      duplicateOrdinalCount: 0,
      ordinalOutOfRangeCount: 0,
      records,
    };
  }
  const ordinals = new Set<number>();
  let duplicateOrdinalCount = 0;
  let ordinalOutOfRangeCount = 0;
  const records: SegmentedEventTimingSample[] = [];
  for (const segment of segments) {
    const low = segment.openingTotalPushed as number;
    const high = segment.closingTotalPushed as number;
    for (const record of segmentRecords(segment)) {
      const ordinal = record.ringOrdinal as number;
      if (ordinal < low || ordinal >= high) ordinalOutOfRangeCount += 1;
      if (ordinals.has(ordinal)) {
        duplicateOrdinalCount += 1;
        continue;
      }
      ordinals.add(ordinal);
      records.push(record);
    }
  }
  return {
    sampleCount: ordinals.size,
    identityBasis: "ring-ordinals",
    duplicateOrdinalCount,
    ordinalOutOfRangeCount,
    records,
  };
}

/**
 * Pure aggregate for a completed segmented idle phase.
 *
 * The measured population is the union of the actual records each segment
 * read, identified by their global ring push ordinal when available. The
 * delivered population is the delta of total accepted pushes across the whole
 * phase, so records already retained before the phase (and later evicted) are
 * never counted as phase loss. The only genuine loss is a delivered record
 * evicted before any segment read it:
 *
 *   deliveredDuringPhase = totalPushed(after) - totalPushed(before)
 *   unreadLostEntries    = max(0, deliveredDuringPhase - unionSampleCount)
 *
 * Union percentiles are computed from the actual union records, never by
 * combining per-segment percentiles. A population whose accounting cannot be
 * completed (missing snapshot, counter reset, structural identity with a
 * broken window chain) is reported as `unknown` and never satisfies a numeric
 * budget through arithmetic alone.
 */
export function buildSegmentedIdleAggregate(input: {
  readonly before: RendererPerfSnapshot | null;
  readonly after: RendererPerfSnapshot | null;
  readonly phase: string;
  readonly segments: readonly SegmentedIdleSegmentEvidence[];
  readonly rafFramesBefore: number;
  readonly rafFramesAfter: number;
}): {
  readonly window: PhaseWindowEvidence | null;
  readonly ringWindow: PhaseWindowEvidence | null;
  readonly aggregate: SegmentedIdleAggregateEvidence;
} {
  const segments = input.segments;
  const ringWindow =
    input.before !== null && input.after !== null
      ? phaseWindowEvidence(input.before, input.after, input.phase)
      : null;
  const observed = collectObservedUnion(segments);
  const unionSamples = observed.records;
  const unionLongTasks = segments.flatMap((segment) => segment.longTasks);
  const unionSlowFrames = segments.flatMap((segment) => segment.slowFrames);
  const phaseEvents = segments.flatMap((segment) => segment.phaseEvents);
  const rawSampleCount = segments.reduce((sum, segment) => sum + segment.samples.length, 0);
  const lateArrivalCount = segments.reduce(
    (sum, segment) => sum + segment.lateArrivalSamples.length,
    0,
  );
  const futureStartSampleCount = segments.reduce(
    (sum, segment) => sum + (segment.futureStartSamples ?? []).length,
    0,
  );
  const rawLongTaskCount = unionLongTasks.length;
  const droppedEventTimingsTotal = segments.reduce(
    (sum, segment) => sum + segment.droppedEventTimings,
    0,
  );
  const droppedLongTasksTotal = segments.reduce(
    (sum, segment) => sum + segment.droppedLongTasks,
    0,
  );
  const droppedSlowFramesTotal = segments.reduce(
    (sum, segment) => sum + segment.droppedSlowFrames,
    0,
  );
  const droppedSpansTotal = segments.reduce((sum, segment) => sum + segment.droppedSpans, 0);
  const skippedDeltaTotal = segments.reduce((sum, segment) => sum + segment.skippedDelta, 0);
  const openingTotalPushed = ringTotalPushed(input.before);
  const closingTotalPushed = ringTotalPushed(input.after);
  const prePhaseRetainedCount = input.before?.recentEventTimings.length ?? 0;
  const prePhaseDroppedCount = input.before?.droppedEventTimings ?? 0;
  const retainedRingCount = input.after?.recentEventTimings.length ?? 0;
  const closingDroppedCount = input.after?.droppedEventTimings ?? 0;

  const notes: string[] = [];
  const counterResetObserved =
    (openingTotalPushed !== null &&
      closingTotalPushed !== null &&
      closingTotalPushed < openingTotalPushed) ||
    segments.some(
      (segment) =>
        typeof segment.openingTotalPushed === "number" &&
        typeof segment.closingTotalPushed === "number" &&
        segment.closingTotalPushed < segment.openingTotalPushed,
    ) ||
    skippedDeltaTotal < 0;
  // Sum of the segment push deltas: telescopes to the outer delivered count
  // when the window chain is contiguous, and exposes a gap or reset otherwise.
  const deliveredFromSegments = segments.every(
    (segment) =>
      typeof segment.openingTotalPushed === "number" &&
      typeof segment.closingTotalPushed === "number",
  )
    ? segments.reduce(
        (sum, segment) =>
          sum + ((segment.closingTotalPushed as number) - (segment.openingTotalPushed as number)),
        0,
      )
    : null;

  let deliveredDuringPhase: number | null = null;
  let populationStatus: SegmentedPopulationStatus;
  if (openingTotalPushed === null || closingTotalPushed === null) {
    populationStatus = "unknown";
    notes.push("phase snapshots are missing; the delivered population cannot be derived");
  } else if (counterResetObserved) {
    populationStatus = "unknown";
    notes.push("the diagnostics ring counters moved backwards (renderer reload/reset)");
  } else {
    deliveredDuringPhase = closingTotalPushed - openingTotalPushed;
    const windowsContiguous = segments.every((segment) => segment.contiguousWithPrevious);
    const identityComplete = observed.identityBasis === "ring-ordinals" || windowsContiguous;
    const segmentDeltaMatches =
      deliveredFromSegments === null || deliveredFromSegments === deliveredDuringPhase;
    const skipped = skippedDeltaTotal;
    if (skipped > 0) {
      populationStatus = "lossy";
      notes.push(`${String(skipped)} delivered entries were rejected by the observer adapters`);
    } else if (deliveredDuringPhase < observed.sampleCount) {
      // More distinct observed identities than pushes: the ring was reset or
      // the ordinal inference is invalid, so the population is not knowable.
      populationStatus = "unknown";
      notes.push(
        `observed ${String(observed.sampleCount)} identities exceed the ${String(
          deliveredDuringPhase,
        )} pushes in the collection interval`,
      );
    } else if (deliveredDuringPhase - observed.sampleCount > 0) {
      populationStatus = "lossy";
      notes.push(
        `${String(deliveredDuringPhase - observed.sampleCount)} delivered entries were evicted before any read`,
      );
    } else if (!identityComplete) {
      populationStatus = "unknown";
      notes.push(
        "segment windows are not contiguous and records carry no ring identity, so the union may miss entries",
      );
    } else if (!segmentDeltaMatches) {
      populationStatus = "unknown";
      notes.push(
        `segment push deltas (${String(deliveredFromSegments)}) do not account for the outer ` +
          `delivered interval (${String(deliveredDuringPhase)})`,
      );
    } else if (observed.ordinalOutOfRangeCount > 0) {
      populationStatus = "unknown";
      notes.push(
        `${String(observed.ordinalOutOfRangeCount)} observed records fell outside their segment's push interval`,
      );
    } else if (observed.duplicateOrdinalCount > 0) {
      // Deduplication is exact here; identical-valued but distinct records are
      // never merged. Duplicates only mean a read overlapped an earlier window.
      populationStatus = "complete";
      notes.push(
        `${String(observed.duplicateOrdinalCount)} records were observed in more than one window and counted once`,
      );
    } else {
      populationStatus = "complete";
    }
  }
  const unreadLostEntries =
    deliveredDuringPhase === null ? 0 : Math.max(0, deliveredDuringPhase - observed.sampleCount);
  const windowsContiguous = segments.every((segment) => segment.contiguousWithPrevious);
  const observer = {
    status: input.after?.observers.eventTiming.status ?? "not-installed",
    requestedThresholdMs: input.after?.observers.eventTiming.requestedDurationThresholdMs ?? null,
    thresholdMs: input.after?.observers.eventTiming.durationThresholdMs ?? null,
  };
  const provenance: EventTimingPopulationProvenance = { status: populationStatus, notes };
  const window: PhaseWindowEvidence | null =
    input.after === null
      ? null
      : {
          phase: input.phase,
          capturedAtMonotonicMs: input.after.capturedAtMonotonicMs,
          aggregate: input.after.phases[input.phase] ?? null,
          eventTimings: summarizeEventTimingRecords(
            unionSamples,
            unreadLostEntries,
            observer,
            provenance,
          ),
          longTasks: summarizeLongTaskRecords(
            unionLongTasks,
            droppedLongTasksTotal,
            input.after.observers.longTask.status,
          ),
          slowFrames: summarizeSlowFrameRecords(unionSlowFrames, droppedSlowFramesTotal),
          droppedSpansDuringWindow: droppedSpansTotal,
        };
  const aggregate: SegmentedIdleAggregateEvidence = {
    batchCount: segments.length,
    clickBatches: segments.filter((segment) => segment.kind === "click-batch").length,
    typeBatches: segments.filter((segment) => segment.kind === "type-batch").length,
    rawSampleCount,
    lateArrivalCount,
    futureStartSampleCount,
    unionSampleCount: observed.sampleCount,
    identityBasis: observed.identityBasis,
    retainedRingCount,
    collectionInterval: {
      openingCapturedAtMonotonicMs: input.before?.capturedAtMonotonicMs ?? null,
      closingCapturedAtMonotonicMs: input.after?.capturedAtMonotonicMs ?? null,
      openingTotalPushed,
      closingTotalPushed,
      prePhaseRetainedCount,
      prePhaseDroppedCount,
      retainedRingCount,
      closingDroppedCount,
    },
    deliveredDuringPhase,
    unreadLostEntries,
    duplicateOrdinalCount: observed.duplicateOrdinalCount,
    ordinalOutOfRangeCount: observed.ordinalOutOfRangeCount,
    populationStatus,
    populationNotes: notes,
    rawLongTaskCount,
    droppedEventTimingsTotal,
    droppedLongTasksTotal,
    droppedSlowFramesTotal,
    droppedSpansTotal,
    skippedDeltaTotal,
    eligibleTrustedInputsTotal: phaseEvents.filter((event) => event.isTrusted).length,
    pageSideMaxDelayMs: trustedPageSideDelay(phaseEvents),
    rafFramesDuringPhase: input.rafFramesAfter - input.rafFramesBefore,
    ...typingFidelityAggregate(segments),
    windowsContiguous,
    windowsDisjoint: windowsContiguous,
    ringEvictionObserved: droppedEventTimingsTotal > 0,
    populationComplete: populationStatus === "complete",
  };
  return { window, ringWindow, aggregate };
}

/**
 * Declared-vs-observed typing fidelity across the segmented type batches. The
 * declared workload is only honest when every batch's real-composer read-back
 * verified exactly-once insertion and the summed editable-text delta equals the
 * summed declared character count; a type batch that could not read the
 * composer back forces the observed total (and the verdict) to null.
 */
function typingFidelityAggregate(segments: readonly SegmentedIdleSegmentEvidence[]): {
  readonly declaredTypedCharsTotal: number;
  readonly observedInsertedCharsTotal: number | null;
  readonly composerTextBefore: string | null;
  readonly composerTextAfter: string | null;
  readonly typingFidelityVerified: boolean | null;
} {
  const typeSegments = segments.filter((segment) => segment.kind === "type-batch");
  const declaredTypedCharsTotal = typeSegments.reduce(
    (sum, segment) => sum + segment.dispatchedTypedChars,
    0,
  );
  if (typeSegments.length === 0 || declaredTypedCharsTotal === 0) {
    return {
      declaredTypedCharsTotal,
      observedInsertedCharsTotal: null,
      composerTextBefore: null,
      composerTextAfter: null,
      typingFidelityVerified: null,
    };
  }
  const first = typeSegments[0]!;
  const last = typeSegments[typeSegments.length - 1]!;
  const observedValues = typeSegments.map(
    (segment) => segment.typingFidelity?.insertedChars ?? null,
  );
  const observedInsertedCharsTotal = observedValues.every(
    (value): value is number => value !== null,
  )
    ? observedValues.reduce((sum, value) => sum + value, 0)
    : null;
  const typingFidelityVerified =
    observedInsertedCharsTotal !== null &&
    observedInsertedCharsTotal === declaredTypedCharsTotal &&
    typeSegments.every((segment) => segment.typingFidelity?.insertedExactlyOnce === true);
  return {
    declaredTypedCharsTotal,
    observedInsertedCharsTotal,
    composerTextBefore: first.typingFidelity?.beforeText ?? null,
    composerTextAfter: last.typingFidelity?.afterText ?? null,
    typingFidelityVerified,
  };
}

// ── Idle population eligibility policy ──────────────────────────────────────

export interface SurfacePolicy {
  readonly status: "measured" | "censored" | "unavailable";
  readonly numericBudgetEligible: boolean;
  readonly reasons: readonly string[];
  readonly eligibleTrustedInputs: number;
  readonly pageSideMaxDelayMs: number | null;
  readonly effectiveThresholdMs: number | null;
  readonly droppedDuringWindow: number;
  readonly skippedDelta: number;
  readonly rafFramesDuringPhase: number;
  readonly screenshotBytes: number | null;
}

export interface IdlePopulationInput {
  readonly window: EventTimingWindowEvidence | null;
  readonly skippedBefore: number;
  readonly skippedAfter: number;
  readonly phaseEvents: readonly RecorderTrustedEvent[];
  readonly rafFramesDuringPhase: number;
  readonly screenshotBytes: number | null;
  readonly surface: {
    readonly visibilityState: string | null;
    readonly hasFocus: boolean | null;
  };
  readonly positiveControlMeasured: boolean;
}

function populationAccountingReason(window: EventTimingWindowEvidence | null): string | null {
  const status = window?.populationStatus;
  if (status === undefined || status === "complete") return null;
  const notes = window?.populationNotes ?? [];
  return `event-timing population accounting is ${status}${
    notes.length > 0 ? `: ${notes.join("; ")}` : ""
  }`;
}

/**
 * Idle population policy. `measured` (samples > 0) is the only state where a
 * numeric percentile exists. A supported observer with zero samples may be
 * accepted as `censored` — an explicitly unavailable percentile — only when
 * every eligible trusted event was below the effective threshold, nothing was
 * dropped, skipped or left unaccounted, the surface was visible/focused/
 * painting, and the blocked positive control measured. Even then it never
 * satisfies a numeric budget (`numericBudgetEligible` stays false).
 */
export function evaluateIdlePopulation(input: IdlePopulationInput): SurfacePolicy {
  const win = input.window;
  const observerStatus = win?.observerStatus ?? "not-installed";
  const samples = win?.samples ?? 0;
  const effectiveThresholdMs = win?.censoredAtMs ?? null;
  const droppedDuringWindow = win?.droppedDuringWindow ?? 0;
  const skippedDelta = input.skippedAfter - input.skippedBefore;
  const eligible = input.phaseEvents.filter((event) => event.isTrusted).length;
  const delays = input.phaseEvents
    .filter((event) => event.isTrusted)
    .map((event) => event.recordedAtMs - event.timeStamp);
  const pageSideMaxDelayMs = delays.length > 0 ? Math.max(...delays) : null;
  const base = {
    eligibleTrustedInputs: eligible,
    pageSideMaxDelayMs,
    effectiveThresholdMs,
    droppedDuringWindow,
    skippedDelta,
    rafFramesDuringPhase: input.rafFramesDuringPhase,
    screenshotBytes: input.screenshotBytes,
  };
  const unavailable = (reasons: string[]): SurfacePolicy => ({
    ...base,
    status: "unavailable",
    numericBudgetEligible: false,
    reasons,
  });
  if (observerStatus !== "supported") {
    return unavailable([`event timing observer is ${observerStatus}`]);
  }
  if (input.surface.visibilityState !== "visible" || input.surface.hasFocus !== true) {
    return unavailable([
      `measurement surface not visible/focused (visibility=${String(
        input.surface.visibilityState,
      )}, hasFocus=${String(input.surface.hasFocus)})`,
    ]);
  }
  if (input.rafFramesDuringPhase <= 0 || (input.screenshotBytes ?? 0) <= 0) {
    return unavailable([
      `no frame/paint evidence during the phase (rafFrames=${String(
        input.rafFramesDuringPhase,
      )}, screenshotBytes=${String(input.screenshotBytes)})`,
    ]);
  }
  const accountingReason = populationAccountingReason(win);
  if (samples > 0) {
    // A delivered sample set is only a full-population percentile when the
    // bounded ring lost nothing, no entry was skipped and the population
    // accounting completed. With loss or an unknown population, the window is
    // still recorded as measured, but it never satisfies a numeric budget (the
    // missing entries could be the slow ones, and unknown is not zero).
    const partialReasons: string[] = [];
    if (droppedDuringWindow !== 0) {
      partialReasons.push(
        `event-timing ring dropped ${String(
          droppedDuringWindow,
        )} entries during the window; percentile is not full-population`,
      );
    }
    if (skippedDelta !== 0) {
      partialReasons.push(`observer skipped ${String(skippedDelta)} entries`);
    }
    if (accountingReason !== null) partialReasons.push(accountingReason);
    return {
      ...base,
      status: "measured",
      numericBudgetEligible: partialReasons.length === 0,
      reasons: partialReasons,
    };
  }
  const reasons: string[] = [];
  if (eligible <= 0) reasons.push("no eligible trusted input was dispatched in the window");
  if (droppedDuringWindow !== 0) {
    reasons.push(`event-timing ring dropped ${String(droppedDuringWindow)} entries`);
  }
  if (skippedDelta !== 0) {
    reasons.push(`observer skipped ${String(skippedDelta)} entries`);
  }
  if (accountingReason !== null) reasons.push(accountingReason);
  if (effectiveThresholdMs === null) {
    reasons.push("no effective duration threshold was published");
  } else if (pageSideMaxDelayMs === null) {
    reasons.push("no page-side trusted-event timestamps were recorded");
  } else if (pageSideMaxDelayMs >= effectiveThresholdMs) {
    reasons.push(
      `page-side trusted-event delay ${String(pageSideMaxDelayMs)}ms reaches the ` +
        `${String(effectiveThresholdMs)}ms threshold; the absence is not explained by censoring`,
    );
  }
  if (!input.positiveControlMeasured) {
    reasons.push("the blocked positive control did not measure");
  }
  if (reasons.length > 0) return unavailable(reasons);
  return {
    ...base,
    status: "censored",
    numericBudgetEligible: false,
    reasons: [
      `supported observer, 0 samples: all ${String(eligible)} eligible trusted events below the ` +
        `${String(effectiveThresholdMs)}ms threshold; percentile unavailable (censored)`,
    ],
  };
}
