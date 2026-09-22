import { describe, expect, it } from "vitest";
import type {
  RendererPerfEventTimingObserverState,
  RendererPerfEventTimingRecord,
  RendererPerfLongTaskObserverState,
  RendererPerfLongTaskRecord,
  RendererPerfPhaseAggregate,
  RendererPerfSlowFrameRecord,
  RendererPerfSnapshot,
} from "../../../src/renderer/diagnostics/rendererPerfDiagnostics.ts";
import {
  availabilityFor,
  observerStatusEvidence,
  phaseWindowEvidence,
  summarizeEventTimingRecords,
  summarizeInteractions,
  summarizeLongTaskRecords,
  summarizeSamples,
  summarizeSlowFrameRecords,
} from "./rendererPhaseEvidence.ts";

/**
 * Phase-window evidence unit tests.
 *
 * The A0 gate reads two snapshots and derives one phase window. These tests
 * pin the three availability states (unavailable / no-samples / measured), the
 * censored event-timing semantics (thresholds published, null durations never
 * counted as zero), and ring-loss reporting, so a dropped or absent sample is
 * never presented as a measured zero.
 */

function eventRecord(
  overrides: Partial<RendererPerfEventTimingRecord>,
): RendererPerfEventTimingRecord {
  return {
    name: "click",
    interactionId: 1,
    startMs: 0,
    inputDelayMs: 0,
    processingMs: 0,
    interactionDurationMs: 0,
    ...overrides,
  };
}

function makeSnapshot(overrides: {
  capturedAtMonotonicMs?: number;
  phases?: Record<string, RendererPerfPhaseAggregate>;
  recentEventTimings?: RendererPerfEventTimingRecord[];
  droppedEventTimings?: number;
  recentLongTasks?: RendererPerfLongTaskRecord[];
  droppedLongTasks?: number;
  recentSlowFrames?: RendererPerfSlowFrameRecord[];
  droppedSlowFrames?: number;
  droppedSpans?: number;
  eventTimingObserver?: Partial<RendererPerfEventTimingObserverState>;
  longTaskObserver?: Partial<RendererPerfLongTaskObserverState>;
}): RendererPerfSnapshot {
  const eventTiming: RendererPerfEventTimingObserverState = {
    status: "supported",
    requestedDurationThresholdMs: 16,
    durationThresholdMs: 16,
    sampleCount: 0,
    skippedEntryCount: 0,
    ...overrides.eventTimingObserver,
  };
  const longTask: RendererPerfLongTaskObserverState = {
    status: "supported",
    sampleCount: 0,
    skippedEntryCount: 0,
    ...overrides.longTaskObserver,
  };
  return {
    formatVersion: 2,
    phase: "trusted-idle",
    frameBudgetMs: 1000 / 120,
    timeOriginEpochMs: 1_700_000_000_000,
    startedMonotonicMs: 0,
    capturedAtMonotonicMs: overrides.capturedAtMonotonicMs ?? 0,
    phases: overrides.phases ?? {},
    observers: { eventTiming, longTask },
    recentSpans: [],
    droppedSpans: overrides.droppedSpans ?? 0,
    recentEventTimings: overrides.recentEventTimings ?? [],
    droppedEventTimings: overrides.droppedEventTimings ?? 0,
    recentLongTasks: overrides.recentLongTasks ?? [],
    droppedLongTasks: overrides.droppedLongTasks ?? 0,
    recentSlowFrames: overrides.recentSlowFrames ?? [],
    droppedSlowFrames: overrides.droppedSlowFrames ?? 0,
  };
}

describe("summarizeSamples", () => {
  it("computes nearest-rank quantiles and preserves sub-millisecond precision", () => {
    const summary = summarizeSamples([16, 8.125, 24, 32, 48]);
    expect(summary).toEqual({
      count: 5,
      p50Ms: 24,
      p95Ms: 48,
      p99Ms: 48,
      maxMs: 48,
    });
    expect(summarizeSamples([0.125, 0.5, 1.875]).p50Ms).toBe(0.5);
  });

  it("reports an empty sample set as count 0 with zero quantiles", () => {
    expect(summarizeSamples([])).toEqual({
      count: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
    });
  });
});

describe("availabilityFor", () => {
  it("never reports samples as measured when the observer is unsupported", () => {
    expect(availabilityFor("unsupported", 0)).toBe("unavailable");
    expect(availabilityFor("not-installed", 12)).toBe("unavailable");
    expect(availabilityFor("supported", 0)).toBe("no-samples");
    expect(availabilityFor("supported", 3)).toBe("measured");
  });
});

describe("summarizeInteractions", () => {
  it("groups by interaction id, excludes null/0 ids and counts them separately", () => {
    const summary = summarizeInteractions([
      eventRecord({ interactionId: 10, interactionDurationMs: 24 }),
      eventRecord({ interactionId: 10, interactionDurationMs: 16 }),
      eventRecord({ interactionId: 11, interactionDurationMs: 40 }),
      eventRecord({ interactionId: 0, interactionDurationMs: 8 }),
      eventRecord({ interactionId: null, interactionDurationMs: 8 }),
    ]);
    expect(summary.count).toBe(2);
    expect(summary.duration.count).toBe(2);
    expect(summary.duration.maxMs).toBe(40);
    expect(summary.samplesWithoutInteraction).toBe(2);
  });

  it("skips null interaction durations without dropping the interaction id", () => {
    const summary = summarizeInteractions([
      eventRecord({ interactionId: 5, interactionDurationMs: null }),
      eventRecord({ interactionId: 5, interactionDurationMs: 32 }),
    ]);
    expect(summary.count).toBe(1);
    expect(summary.duration.maxMs).toBe(32);
  });
});

describe("summarizeEventTimingRecords", () => {
  it("publishes requested and effective censoring thresholds with the sample status", () => {
    const evidence = summarizeEventTimingRecords(
      [eventRecord({ inputDelayMs: 4, processingMs: 2, interactionDurationMs: null })],
      2,
      { status: "supported", requestedThresholdMs: 20, thresholdMs: 24 },
    );
    expect(evidence.status).toBe("measured");
    expect(evidence.requestedCensoredAtMs).toBe(20);
    expect(evidence.censoredAtMs).toBe(24);
    expect(evidence.samples).toBe(1);
    expect(evidence.interactionDurationNullCount).toBe(1);
    expect(evidence.interactionDuration.count).toBe(0);
    expect(evidence.droppedDuringWindow).toBe(2);
    expect(evidence.inputDelay.maxMs).toBe(4);
    expect(evidence.processing.maxMs).toBe(2);
  });

  it("counts an all-zero record as a measured zero, not as missing", () => {
    const evidence = summarizeEventTimingRecords([eventRecord({})], 0, {
      status: "supported",
      requestedThresholdMs: 16,
      thresholdMs: 16,
    });
    expect(evidence.status).toBe("measured");
    expect(evidence.measuredZeroCount).toBe(1);
  });

  it("reports no-samples with a supported observer and unavailable without one", () => {
    const noSamples = summarizeEventTimingRecords([], 0, {
      status: "supported",
      requestedThresholdMs: 16,
      thresholdMs: 16,
    });
    expect(noSamples.status).toBe("no-samples");
    expect(noSamples.samples).toBe(0);
    const unavailable = summarizeEventTimingRecords([eventRecord({})], 0, {
      status: "unsupported",
      requestedThresholdMs: null,
      thresholdMs: null,
    });
    expect(unavailable.status).toBe("unavailable");
  });
});

describe("summarizeLongTaskRecords", () => {
  it("counts tasks at or over 200 ms separately from the duration summary", () => {
    const evidence = summarizeLongTaskRecords(
      [
        { startMs: 0, durationMs: 120 },
        { startMs: 200, durationMs: 200 },
        { startMs: 400, durationMs: 260 },
      ],
      1,
      "supported",
    );
    expect(evidence.samples).toBe(3);
    expect(evidence.over200Ms).toBe(2);
    expect(evidence.duration.maxMs).toBe(260);
    expect(evidence.droppedDuringWindow).toBe(1);
  });
});

describe("summarizeSlowFrameRecords", () => {
  it("summarizes frame deltas and ring loss", () => {
    const evidence = summarizeSlowFrameRecords(
      [
        { atMs: 0, deltaMs: 16.7 },
        { atMs: 20, deltaMs: 33.4 },
      ],
      3,
    );
    expect(evidence.samples).toBe(2);
    expect(evidence.delta.maxMs).toBe(33.4);
    expect(evidence.droppedDuringWindow).toBe(3);
  });
});

describe("phaseWindowEvidence", () => {
  it("includes only records inside the half-open snapshot window", () => {
    const before = makeSnapshot({ capturedAtMonotonicMs: 1_000 });
    const after = makeSnapshot({
      capturedAtMonotonicMs: 2_000,
      recentEventTimings: [
        eventRecord({ startMs: 999 }),
        eventRecord({ startMs: 1_000 }),
        eventRecord({ startMs: 1_500 }),
        eventRecord({ startMs: 2_000 }),
        eventRecord({ startMs: 2_001 }),
      ],
      recentLongTasks: [
        { startMs: 1_000, durationMs: 300 },
        { startMs: 1_500, durationMs: 260 },
        { startMs: 2_000, durationMs: 90 },
      ],
      recentSlowFrames: [
        { atMs: 1_000, deltaMs: 33 },
        { atMs: 1_500, deltaMs: 17 },
      ],
    });

    const evidence = phaseWindowEvidence(before, after, "trusted-idle");
    expect(evidence.eventTimings.samples).toBe(2);
    expect(evidence.longTasks.samples).toBe(2);
    expect(evidence.longTasks.over200Ms).toBe(1);
    expect(evidence.slowFrames.samples).toBe(1);
    expect(evidence.phase).toBe("trusted-idle");
    expect(evidence.capturedAtMonotonicMs).toBe(2_000);
  });

  it("reports ring loss as the drop-count delta between the two snapshots", () => {
    const before = makeSnapshot({
      capturedAtMonotonicMs: 1_000,
      droppedEventTimings: 10,
      droppedLongTasks: 4,
      droppedSlowFrames: 2,
      droppedSpans: 7,
    });
    const after = makeSnapshot({
      capturedAtMonotonicMs: 2_000,
      droppedEventTimings: 13,
      droppedLongTasks: 4,
      droppedSlowFrames: 5,
      droppedSpans: 9,
    });

    const evidence = phaseWindowEvidence(before, after, "steady");
    expect(evidence.eventTimings.droppedDuringWindow).toBe(3);
    expect(evidence.longTasks.droppedDuringWindow).toBe(0);
    expect(evidence.slowFrames.droppedDuringWindow).toBe(3);
    expect(evidence.droppedSpansDuringWindow).toBe(2);
  });

  it("carries the phase aggregate and observer status through the window", () => {
    const aggregate: RendererPerfPhaseAggregate = {
      frames: 120,
      onTimeFrames: 118,
      maxFrameDeltaMs: 33.4,
      spans: {},
      eventTimings: {
        count: 2,
        maxInputDelayMs: 8,
        maxProcessingMs: 4,
        maxInteractionDurationMs: 24,
      },
      longTasks: { count: 1, maxDurationMs: 260 },
    };
    const before = makeSnapshot({ capturedAtMonotonicMs: 1_000 });
    const after = makeSnapshot({
      capturedAtMonotonicMs: 2_000,
      phases: { "trusted-blocked": aggregate },
      eventTimingObserver: {
        status: "unsupported",
        requestedDurationThresholdMs: null,
        durationThresholdMs: null,
      },
    });

    const evidence = phaseWindowEvidence(before, after, "trusted-blocked");
    expect(evidence.aggregate).toEqual(aggregate);
    expect(evidence.eventTimings.status).toBe("unavailable");
    expect(evidence.longTasks.status).toBe("no-samples");
  });
});

describe("observerStatusEvidence", () => {
  it("maps both observer states without dropping skip counters", () => {
    const snapshot = makeSnapshot({
      eventTimingObserver: {
        status: "supported",
        requestedDurationThresholdMs: 20,
        durationThresholdMs: 24,
        sampleCount: 4,
        skippedEntryCount: 1,
      },
      longTaskObserver: { status: "unsupported", sampleCount: 0, skippedEntryCount: 0 },
    });
    expect(observerStatusEvidence(snapshot)).toEqual({
      eventTimingStatus: "supported",
      eventTimingRequestedDurationThresholdMs: 20,
      eventTimingDurationThresholdMs: 24,
      eventTimingSampleCount: 4,
      eventTimingSkippedEntryCount: 1,
      longTaskStatus: "unsupported",
      longTaskSampleCount: 0,
      longTaskSkippedEntryCount: 0,
    });
  });
});
