import { describe, expect, it } from "vitest";
import type { RendererPerfSnapshot } from "../../../src/renderer/diagnostics/rendererPerfDiagnostics.ts";
import type { TrustedTypingEvidence } from "./managedAppSession.ts";
import type { EventTimingWindowEvidence } from "./rendererPhaseEvidence.ts";
import {
  buildSegmentedIdleAggregate,
  evaluateIdlePopulation,
  ringOrdinalOf,
  ringTotalPushed,
  type SegmentedEventTimingSample,
  type SegmentedIdleSegmentEvidence,
} from "./trustedInputPopulation.ts";
import type { RecorderTrustedEvent } from "./trustedInputProtocol.ts";

/**
 * Population accounting regression suite for the segmented trusted-idle
 * collection. The frozen-parent counterexample is the anchor: 172 Event Timing
 * entries retained (and already observed) before the phase must never be
 * reported as unread phase loss. Every case below is stated in ring identities
 * (`dropped + index`), so identical-valued but distinct records stay distinct.
 */

function trustedEvent(overrides: Partial<RecorderTrustedEvent> = {}): RecorderTrustedEvent {
  return { type: "click", isTrusted: true, timeStamp: 100, recordedAtMs: 103, ...overrides };
}

function eventTimingWindow(
  overrides: Partial<EventTimingWindowEvidence> = {},
): EventTimingWindowEvidence {
  return {
    status: "measured",
    observerStatus: "supported",
    requestedCensoredAtMs: 16,
    censoredAtMs: 16,
    samples: 5,
    inputDelay: { count: 5, p50Ms: 1, p95Ms: 2, p99Ms: 3, maxMs: 4 },
    processing: { count: 5, p50Ms: 1, p95Ms: 2, p99Ms: 3, maxMs: 4 },
    interactionDuration: { count: 5, p50Ms: 5, p95Ms: 9, p99Ms: 11, maxMs: 12 },
    interactionDurationNullCount: 0,
    interactions: {
      count: 5,
      duration: { count: 5, p50Ms: 5, p95Ms: 9, p99Ms: 11, maxMs: 12 },
      samplesWithoutInteraction: 0,
    },
    measuredZeroCount: 0,
    droppedDuringWindow: 0,
    ...overrides,
  };
}

function snapshotRecord(
  startMs: number,
  overrides: Partial<SegmentedEventTimingSample> = {},
): SegmentedEventTimingSample {
  return {
    name: "click",
    startMs,
    interactionId: 1,
    inputDelayMs: 2,
    processingMs: 1,
    interactionDurationMs: 10,
    ...overrides,
  };
}

function snapshot(input: {
  readonly capturedAtMonotonicMs: number;
  readonly eventTimings?: readonly SegmentedEventTimingSample[];
  readonly droppedEventTimings?: number;
  readonly skippedEntryCount?: number;
}): RendererPerfSnapshot {
  return {
    capturedAtMonotonicMs: input.capturedAtMonotonicMs,
    phases: {},
    observers: {
      eventTiming: {
        status: "supported",
        requestedDurationThresholdMs: 16,
        durationThresholdMs: 16,
        sampleCount: 0,
        skippedEntryCount: input.skippedEntryCount ?? 0,
      },
      longTask: { status: "supported", sampleCount: 0, skippedEntryCount: 0 },
    },
    recentEventTimings: input.eventTimings ?? [],
    droppedEventTimings: input.droppedEventTimings ?? 0,
    recentLongTasks: [],
    droppedLongTasks: 0,
    recentSlowFrames: [],
    droppedSlowFrames: 0,
    droppedSpans: 0,
  } as unknown as RendererPerfSnapshot;
}

function segment(input: {
  readonly index: number;
  readonly kind?: "click-batch" | "type-batch";
  readonly beforeMs: number;
  readonly afterMs: number;
  readonly contiguous: boolean;
  readonly samples?: readonly SegmentedEventTimingSample[];
  readonly lateArrivalSamples?: readonly SegmentedEventTimingSample[];
  readonly futureStartSamples?: readonly SegmentedEventTimingSample[];
  readonly openingTotalPushed?: number;
  readonly closingTotalPushed?: number;
  readonly skippedDelta?: number;
  readonly typedChars?: number;
  readonly typingFidelity?: TrustedTypingEvidence | null;
}): SegmentedIdleSegmentEvidence {
  return {
    index: input.index,
    kind: input.kind ?? "click-batch",
    dispatchedClicks: 1,
    dispatchedTypedChars: input.kind === "type-batch" ? (input.typedChars ?? 10) : 0,
    beforeCapturedAtMonotonicMs: input.beforeMs,
    afterCapturedAtMonotonicMs: input.afterMs,
    contiguousWithPrevious: input.contiguous,
    samples: input.samples ?? [],
    lateArrivalSamples: input.lateArrivalSamples ?? [],
    ...(input.futureStartSamples === undefined
      ? {}
      : { futureStartSamples: input.futureStartSamples }),
    ...(input.openingTotalPushed === undefined
      ? {}
      : { openingTotalPushed: input.openingTotalPushed }),
    ...(input.closingTotalPushed === undefined
      ? {}
      : { closingTotalPushed: input.closingTotalPushed }),
    longTasks: [],
    slowFrames: [],
    droppedEventTimings: 0,
    droppedLongTasks: 0,
    droppedSlowFrames: 0,
    droppedSpans: 0,
    skippedDelta: input.skippedDelta ?? 0,
    eligibleTrustedInputs: 1,
    pageSideMaxDelayMs: null,
    rafFramesDuringSegment: 10,
    durationMs: 100,
    barrier: {
      label: "test",
      waitedMs: 100,
      polls: 2,
      advanced: true,
      quietMs: 260,
      timedOut: false,
      beforeEventTimingSamples: 0,
      afterEventTimingSamples: 1,
      beforeLongTaskSamples: 0,
      afterLongTaskSamples: 0,
      snapshot: null,
    },
    phaseEvents: [trustedEvent()],
    recorderBefore: null,
    recorderAfter: null,
    typingFidelity: input.typingFidelity ?? null,
  };
}

function evaluateCompleteAggregate(input: {
  readonly before: RendererPerfSnapshot | null;
  readonly after: RendererPerfSnapshot | null;
  readonly segments: readonly SegmentedIdleSegmentEvidence[];
}) {
  return buildSegmentedIdleAggregate({
    before: input.before,
    after: input.after,
    phase: "trusted-idle",
    segments: input.segments,
    rafFramesBefore: 0,
    rafFramesAfter: 42,
  });
}

function policyFor(aggregate: ReturnType<typeof buildSegmentedIdleAggregate>) {
  return evaluateIdlePopulation({
    window: aggregate.window?.eventTimings ?? null,
    skippedBefore: 0,
    skippedAfter: 0,
    phaseEvents: [trustedEvent()],
    rafFramesDuringPhase: aggregate.aggregate.rafFramesDuringPhase,
    screenshotBytes: 10_000,
    surface: { visibilityState: "visible", hasFocus: true },
    positiveControlMeasured: true,
  });
}

describe("ring identity helpers", () => {
  it("derives the total pushed count and ordinal from retained index plus drops", () => {
    expect(ringTotalPushed({ recentEventTimings: [{}, {}, {}], droppedEventTimings: 7 })).toBe(10);
    expect(ringOrdinalOf({ droppedEventTimings: 7 }, 0)).toBe(7);
    expect(ringOrdinalOf({ droppedEventTimings: 7 }, 2)).toBe(9);
    expect(ringTotalPushed(null)).toBeNull();
    expect(ringOrdinalOf(null, 0)).toBeNull();
  });

  it("refuses malformed counters instead of fabricating an ordinal", () => {
    expect(ringTotalPushed({ recentEventTimings: [{}], droppedEventTimings: -1 })).toBeNull();
    expect(ringTotalPushed({ recentEventTimings: [{}], droppedEventTimings: 1.5 })).toBeNull();
    expect(
      ringTotalPushed({ recentEventTimings: [{}], droppedEventTimings: Number.NaN }),
    ).toBeNull();
  });
});

describe("segmented population accounting (parent counterexample corrected)", () => {
  it("never counts records already retained before the phase as unread phase loss", () => {
    // Shape of the frozen authoritative evidence, scaled down: 4 pre-phase
    // records were retained (dropped 0), 7 were evicted during the phase and 3
    // remained at the close, so 6 entries were delivered during the phase and
    // all 6 were read inside the segments.
    const before = snapshot({
      capturedAtMonotonicMs: 100,
      eventTimings: [0, 1, 2, 3].map((ordinal) =>
        snapshotRecord(90 + ordinal, { ringOrdinal: ordinal }),
      ),
    });
    const after = snapshot({
      capturedAtMonotonicMs: 200,
      eventTimings: [4, 5, 6].map((ordinal) =>
        snapshotRecord(150 + ordinal, { ringOrdinal: ordinal }),
      ),
      droppedEventTimings: 7,
    });
    const segments = [
      segment({
        index: 0,
        beforeMs: 100,
        afterMs: 200,
        contiguous: true,
        openingTotalPushed: 4,
        closingTotalPushed: 10,
        samples: [4, 5, 6, 7, 8, 9].map((ordinal) =>
          snapshotRecord(110 + ordinal, { ringOrdinal: ordinal }),
        ),
      }),
    ];
    const { aggregate, window } = evaluateCompleteAggregate({ before, after, segments });
    expect(ringTotalPushed(before)).toBe(4);
    expect(ringTotalPushed(after)).toBe(10);
    expect(aggregate.collectionInterval.prePhaseRetainedCount).toBe(4);
    expect(aggregate.deliveredDuringPhase).toBe(6);
    // The old `retained + dropped` reading would have claimed 10 delivered.
    expect(aggregate.retainedRingCount).toBe(3);
    expect(aggregate.droppedEventTimingsTotal).toBe(0);
    expect(aggregate.unionSampleCount).toBe(6);
    expect(aggregate.unreadLostEntries).toBe(0);
    expect(aggregate.populationStatus).toBe("complete");
    expect(aggregate.populationComplete).toBe(true);
    expect(aggregate.identityBasis).toBe("ring-ordinals");
    expect(window?.eventTimings.populationStatus).toBe("complete");
    // A complete population is the only state where the union may satisfy a
    // numeric budget; the policy itself still requires a measured window.
    const policy = policyFor({ aggregate, window, ringWindow: null });
    expect(policy.status).toBe("measured");
    expect(policy.numericBudgetEligible).toBe(true);
  });

  it("counts genuinely evicted in-phase entries as unread loss and blocks the numeric budget", () => {
    const before = snapshot({ capturedAtMonotonicMs: 100 });
    const after = snapshot({
      capturedAtMonotonicMs: 200,
      eventTimings: [0, 1, 2].map((ordinal) =>
        snapshotRecord(150 + ordinal, { ringOrdinal: ordinal }),
      ),
      droppedEventTimings: 5,
    });
    const segments = [
      segment({
        index: 0,
        beforeMs: 100,
        afterMs: 200,
        contiguous: true,
        openingTotalPushed: 0,
        closingTotalPushed: 8,
        samples: [3, 4, 5, 6, 7].map((ordinal) =>
          snapshotRecord(110 + ordinal, { ringOrdinal: ordinal }),
        ),
      }),
    ];
    const { aggregate, window } = evaluateCompleteAggregate({ before, after, segments });
    expect(aggregate.deliveredDuringPhase).toBe(8);
    expect(aggregate.unionSampleCount).toBe(5);
    expect(aggregate.unreadLostEntries).toBe(3);
    expect(aggregate.populationStatus).toBe("lossy");
    expect(aggregate.populationComplete).toBe(false);
    const policy = policyFor({ aggregate, window, ringWindow: null });
    expect(policy.status).toBe("measured");
    expect(policy.numericBudgetEligible).toBe(false);
    expect(policy.reasons.join(" ")).toContain("not full-population");
    expect(policy.reasons.join(" ")).toContain("population accounting is lossy");
  });

  it("keeps identical-valued distinct records separate through their ring ordinals", () => {
    const identical = (ringOrdinal: number): SegmentedEventTimingSample =>
      snapshotRecord(150, { ringOrdinal, inputDelayMs: 7, interactionDurationMs: 12 });
    const before = snapshot({
      capturedAtMonotonicMs: 100,
      eventTimings: [identical(0)],
    });
    const after = snapshot({
      capturedAtMonotonicMs: 200,
      eventTimings: [identical(0), identical(1), identical(2)],
    });
    // The pre-phase record (ordinal 0) is retained and already observed; only
    // ordinals 1 and 2 were pushed during the phase. All three serialized
    // values are identical, so a value-based dedup would collapse them.
    const segments = [
      segment({
        index: 0,
        beforeMs: 100,
        afterMs: 200,
        contiguous: true,
        openingTotalPushed: 1,
        closingTotalPushed: 3,
        samples: [identical(1), identical(2)],
      }),
    ];
    const { aggregate } = evaluateCompleteAggregate({ before, after, segments });
    expect(aggregate.deliveredDuringPhase).toBe(2);
    expect(aggregate.unionSampleCount).toBe(2);
    expect(aggregate.unreadLostEntries).toBe(0);
    expect(aggregate.populationComplete).toBe(true);
  });

  it("accounts late delivery by push ordinal across a phase boundary, not by value shape", () => {
    // The pre-phase record and the late-delivered record share every value
    // field; only the ordinal separates them. The late record's startMs (120)
    // belongs to segment 0's window but its push lands in segment 1.
    const identical = (ringOrdinal: number): SegmentedEventTimingSample =>
      snapshotRecord(120, { ringOrdinal, inputDelayMs: 5 });
    const before = snapshot({
      capturedAtMonotonicMs: 100,
      eventTimings: [identical(0)],
    });
    const after = snapshot({
      capturedAtMonotonicMs: 200,
      eventTimings: [identical(0), identical(1)],
    });
    const segments = [
      segment({
        index: 0,
        beforeMs: 100,
        afterMs: 150,
        contiguous: true,
        openingTotalPushed: 1,
        closingTotalPushed: 1,
      }),
      segment({
        index: 1,
        beforeMs: 150,
        afterMs: 200,
        contiguous: true,
        openingTotalPushed: 1,
        closingTotalPushed: 2,
        lateArrivalSamples: [identical(1)],
      }),
    ];
    const { aggregate } = evaluateCompleteAggregate({ before, after, segments });
    expect(aggregate.rawSampleCount).toBe(0);
    expect(aggregate.lateArrivalCount).toBe(1);
    expect(aggregate.deliveredDuringPhase).toBe(1);
    expect(aggregate.unionSampleCount).toBe(1);
    expect(aggregate.unreadLostEntries).toBe(0);
    expect(aggregate.populationComplete).toBe(true);
  });

  it("records a future startMs as accounted population without claiming window eligibility", () => {
    const before = snapshot({ capturedAtMonotonicMs: 100 });
    const future = snapshotRecord(250, { ringOrdinal: 0 });
    const after = snapshot({ capturedAtMonotonicMs: 200, eventTimings: [future] });
    const segments = [
      segment({
        index: 0,
        beforeMs: 100,
        afterMs: 200,
        contiguous: true,
        openingTotalPushed: 0,
        closingTotalPushed: 1,
        futureStartSamples: [future],
      }),
    ];
    const { aggregate, window } = evaluateCompleteAggregate({ before, after, segments });
    expect(aggregate.futureStartSampleCount).toBe(1);
    expect(aggregate.rawSampleCount).toBe(0);
    expect(aggregate.unionSampleCount).toBe(1);
    expect(aggregate.deliveredDuringPhase).toBe(1);
    expect(aggregate.unreadLostEntries).toBe(0);
    expect(aggregate.populationComplete).toBe(true);
    // The future record is in the population but not in the measured window.
    expect(window?.eventTimings.samples).toBe(1);
  });

  it("marks a reversed ring counter (renderer reset) unknown and blocks the numeric budget", () => {
    const before = snapshot({
      capturedAtMonotonicMs: 100,
      eventTimings: [0, 1].map((ordinal) => snapshotRecord(90, { ringOrdinal: ordinal })),
      droppedEventTimings: 5,
    });
    const after = snapshot({
      capturedAtMonotonicMs: 200,
      eventTimings: [snapshotRecord(150, { ringOrdinal: 0 })],
    });
    const segments = [
      segment({
        index: 0,
        beforeMs: 100,
        afterMs: 200,
        contiguous: true,
        openingTotalPushed: 0,
        closingTotalPushed: 1,
        samples: [snapshotRecord(150, { ringOrdinal: 0 })],
      }),
    ];
    const { aggregate, window } = evaluateCompleteAggregate({ before, after, segments });
    expect(aggregate.deliveredDuringPhase).toBeNull();
    expect(aggregate.populationStatus).toBe("unknown");
    expect(aggregate.populationComplete).toBe(false);
    expect(aggregate.populationNotes.join(" ")).toContain("moved backwards");
    const policy = policyFor({ aggregate, window, ringWindow: null });
    expect(policy.status).toBe("measured");
    expect(policy.numericBudgetEligible).toBe(false);
    expect(policy.reasons.join(" ")).toContain("population accounting is unknown");
  });

  it("marks missing phase snapshots unknown instead of assuming zero loss", () => {
    const after = snapshot({
      capturedAtMonotonicMs: 200,
      eventTimings: [snapshotRecord(150, { ringOrdinal: 0 })],
    });
    const segments = [
      segment({
        index: 0,
        beforeMs: 100,
        afterMs: 200,
        contiguous: true,
        samples: [snapshotRecord(150, { ringOrdinal: 0 })],
      }),
    ];
    const { aggregate, window } = evaluateCompleteAggregate({
      before: null,
      after,
      segments,
    });
    expect(aggregate.deliveredDuringPhase).toBeNull();
    expect(aggregate.populationStatus).toBe("unknown");
    expect(aggregate.populationComplete).toBe(false);
    expect(aggregate.populationNotes.join(" ")).toContain("snapshots are missing");
    const policy = policyFor({ aggregate, window, ringWindow: null });
    expect(policy.numericBudgetEligible).toBe(false);
    expect(policy.reasons.join(" ")).toContain("population accounting is unknown");
  });

  it("marks observer-rejected entries lossy even when every delivered record was read", () => {
    const before = snapshot({ capturedAtMonotonicMs: 100 });
    const after = snapshot({
      capturedAtMonotonicMs: 200,
      eventTimings: [snapshotRecord(150, { ringOrdinal: 0 })],
    });
    const segments = [
      segment({
        index: 0,
        beforeMs: 100,
        afterMs: 200,
        contiguous: true,
        openingTotalPushed: 0,
        closingTotalPushed: 1,
        samples: [snapshotRecord(150, { ringOrdinal: 0 })],
        skippedDelta: 2,
      }),
    ];
    const { aggregate, window } = evaluateCompleteAggregate({ before, after, segments });
    expect(aggregate.deliveredDuringPhase).toBe(1);
    expect(aggregate.unreadLostEntries).toBe(0);
    expect(aggregate.skippedDeltaTotal).toBe(2);
    expect(aggregate.populationStatus).toBe("lossy");
    expect(aggregate.populationComplete).toBe(false);
    const policy = policyFor({ aggregate, window, ringWindow: null });
    expect(policy.numericBudgetEligible).toBe(false);
    expect(policy.reasons.join(" ")).toContain("rejected by the observer adapters");
  });

  it("refuses to certify a structural union whose window chain is broken", () => {
    const before = snapshot({ capturedAtMonotonicMs: 100 });
    const after = snapshot({
      capturedAtMonotonicMs: 200,
      eventTimings: [
        snapshotRecord(120, { ringOrdinal: 0 }),
        snapshotRecord(180, { ringOrdinal: 1 }),
      ],
    });
    const segments = [
      segment({
        index: 0,
        beforeMs: 100,
        afterMs: 150,
        contiguous: true,
        samples: [snapshotRecord(120, { ringOrdinal: 0 })],
      }),
      segment({
        index: 1,
        beforeMs: 170,
        afterMs: 200,
        contiguous: false,
        samples: [snapshotRecord(180, { ringOrdinal: 1 })],
      }),
    ];
    const { aggregate } = evaluateCompleteAggregate({ before, after, segments });
    expect(aggregate.identityBasis).toBe("structural-windows");
    expect(aggregate.deliveredDuringPhase).toBe(2);
    expect(aggregate.unionSampleCount).toBe(2);
    expect(aggregate.populationStatus).toBe("unknown");
    expect(aggregate.populationComplete).toBe(false);
  });

  it("treats a complete empty phase as censored, never as unavailable loss", () => {
    const before = snapshot({ capturedAtMonotonicMs: 100 });
    const after = snapshot({ capturedAtMonotonicMs: 200 });
    const segments = [
      segment({
        index: 0,
        beforeMs: 100,
        afterMs: 200,
        contiguous: true,
        openingTotalPushed: 0,
        closingTotalPushed: 0,
      }),
    ];
    const { aggregate, window } = evaluateCompleteAggregate({ before, after, segments });
    expect(aggregate.deliveredDuringPhase).toBe(0);
    expect(aggregate.populationStatus).toBe("complete");
    const policy = policyFor({ aggregate, window, ringWindow: null });
    expect(policy.status).toBe("censored");
    expect(policy.numericBudgetEligible).toBe(false);
  });
});

// ── Union aggregation of segment windows ────────────────────────────────────

describe("segmented idle union", () => {
  it("unions contiguous disjoint segment windows into the measured population", () => {
    const segments = [
      segment({
        index: 0,
        beforeMs: 500,
        afterMs: 1_000,
        contiguous: true,
        samples: [snapshotRecord(600, { interactionId: 1, interactionDurationMs: 30 })],
      }),
      segment({
        index: 1,
        beforeMs: 1_000,
        afterMs: 3_000,
        contiguous: true,
        samples: [snapshotRecord(2_100, { interactionId: 3, interactionDurationMs: 50 })],
      }),
    ];
    const { aggregate, window } = evaluateCompleteAggregate({
      before: snapshot({ capturedAtMonotonicMs: 500 }),
      after: snapshot({
        capturedAtMonotonicMs: 3_000,
        eventTimings: [
          snapshotRecord(600, { interactionId: 1, interactionDurationMs: 30 }),
          snapshotRecord(2_100, { interactionId: 3, interactionDurationMs: 50 }),
        ],
      }),
      segments,
    });
    expect(aggregate.unionSampleCount).toBe(2);
    expect(window?.eventTimings.interactions.count).toBe(2);
    expect(window?.eventTimings.interactionDuration.p99Ms).toBe(50);
  });

  it("reads the outer union window percentiles from actual records, not per-segment quantiles", () => {
    const segments = [
      segment({
        index: 0,
        beforeMs: 0,
        afterMs: 100,
        contiguous: true,
        samples: [snapshotRecord(50, { interactionId: 1, interactionDurationMs: 10 })],
      }),
      segment({
        index: 1,
        beforeMs: 100,
        afterMs: 200,
        contiguous: true,
        samples: [snapshotRecord(150, { interactionId: 2, interactionDurationMs: 90 })],
      }),
    ];
    const { window } = evaluateCompleteAggregate({
      before: snapshot({ capturedAtMonotonicMs: 0 }),
      after: snapshot({
        capturedAtMonotonicMs: 200,
        eventTimings: [
          snapshotRecord(50, { interactionId: 1, interactionDurationMs: 10 }),
          snapshotRecord(150, { interactionId: 2, interactionDurationMs: 90 }),
        ],
      }),
      segments,
    });
    expect(window?.eventTimings.interactionDuration.count).toBe(2);
    expect(window?.eventTimings.interactionDuration.maxMs).toBe(90);
  });
});

// ── Typing fidelity aggregate (declared vs observed workload) ───────────────

function typingEvidence(overrides: Partial<TrustedTypingEvidence> = {}): TrustedTypingEvidence {
  return {
    selector: '[contenteditable="true"]',
    declaredText: "v2q probe ",
    declaredChars: 10,
    beforeText: "",
    afterText: "v2q probe ",
    insertedChars: 10,
    insertedExactlyOnce: true,
    insertionAssertion: "verified",
    ...overrides,
  };
}

describe("segmented typing fidelity", () => {
  function aggregateWithTypeBatches(typeSegments: readonly SegmentedIdleSegmentEvidence[]) {
    return evaluateCompleteAggregate({
      before: snapshot({ capturedAtMonotonicMs: 500 }),
      after: snapshot({
        capturedAtMonotonicMs: 5_000,
        eventTimings: [snapshotRecord(600, { interactionId: 1, interactionDurationMs: 30 })],
      }),
      segments: [
        segment({
          index: 0,
          beforeMs: 500,
          afterMs: 1_000,
          contiguous: true,
          samples: [snapshotRecord(600, { interactionId: 1, interactionDurationMs: 30 })],
        }),
        ...typeSegments,
      ],
    }).aggregate;
  }

  it("verifies the declared workload only when every batch inserted exactly once", () => {
    const aggregate = aggregateWithTypeBatches([
      segment({
        index: 1,
        kind: "type-batch",
        beforeMs: 1_000,
        afterMs: 2_000,
        contiguous: true,
        typedChars: 10,
        typingFidelity: typingEvidence({ beforeText: "", afterText: "v2q probe " }),
      }),
      segment({
        index: 2,
        kind: "type-batch",
        beforeMs: 2_000,
        afterMs: 3_000,
        contiguous: true,
        typedChars: 10,
        typingFidelity: typingEvidence({
          beforeText: "v2q probe ",
          afterText: "v2q probe v2q probe ",
        }),
      }),
    ]);
    expect(aggregate.declaredTypedCharsTotal).toBe(20);
    expect(aggregate.observedInsertedCharsTotal).toBe(20);
    expect(aggregate.composerTextBefore).toBe("");
    expect(aggregate.composerTextAfter).toBe("v2q probe v2q probe ");
    expect(aggregate.typingFidelityVerified).toBe(true);
  });

  it("refuses a doubled insertion and an unreadable composer as unverified", () => {
    const doubled = aggregateWithTypeBatches([
      segment({
        index: 1,
        kind: "type-batch",
        beforeMs: 1_000,
        afterMs: 2_000,
        contiguous: true,
        typedChars: 10,
        typingFidelity: typingEvidence({
          afterText: "v2q probe v2q probe ",
          insertedChars: 20,
          insertedExactlyOnce: false,
        }),
      }),
    ]);
    expect(doubled.observedInsertedCharsTotal).toBe(20);
    expect(doubled.typingFidelityVerified).toBe(false);
    const unreadable = aggregateWithTypeBatches([
      segment({
        index: 1,
        kind: "type-batch",
        beforeMs: 1_000,
        afterMs: 2_000,
        contiguous: true,
        typedChars: 10,
        typingFidelity: typingEvidence({
          afterText: null,
          insertedChars: null,
          insertedExactlyOnce: false,
          insertionAssertion: "not-asserted",
        }),
      }),
    ]);
    expect(unreadable.observedInsertedCharsTotal).toBeNull();
    expect(unreadable.typingFidelityVerified).toBe(false);
  });

  it("does not claim a verdict when no typed characters were declared", () => {
    const aggregate = aggregateWithTypeBatches([]);
    expect(aggregate.declaredTypedCharsTotal).toBe(0);
    expect(aggregate.observedInsertedCharsTotal).toBeNull();
    expect(aggregate.typingFidelityVerified).toBeNull();
  });
});

// ── Idle population policy (pure) ───────────────────────────────────────────

describe("evaluateIdlePopulation", () => {
  const surface = { visibilityState: "visible", hasFocus: true };

  it("is measured (numeric-budget eligible) when samples exist", () => {
    const policy = evaluateIdlePopulation({
      window: eventTimingWindow(),
      skippedBefore: 0,
      skippedAfter: 0,
      phaseEvents: [trustedEvent()],
      rafFramesDuringPhase: 30,
      screenshotBytes: 12_000,
      surface,
      positiveControlMeasured: true,
    });
    expect(policy.status).toBe("measured");
    expect(policy.numericBudgetEligible).toBe(true);
  });

  it("records a measured-but-lossy window without letting it satisfy a numeric budget", () => {
    const policy = evaluateIdlePopulation({
      window: eventTimingWindow({ droppedDuringWindow: 131 }),
      skippedBefore: 0,
      skippedAfter: 0,
      phaseEvents: [trustedEvent()],
      rafFramesDuringPhase: 30,
      screenshotBytes: 12_000,
      surface,
      positiveControlMeasured: true,
    });
    expect(policy.status).toBe("measured");
    expect(policy.numericBudgetEligible).toBe(false);
    expect(policy.reasons.join(" ")).toContain("not full-population");
  });

  it("accepts a supported zero-sample window only as censored, never a numeric budget", () => {
    const policy = evaluateIdlePopulation({
      window: eventTimingWindow({
        status: "no-samples",
        samples: 0,
        inputDelay: { count: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 },
      }),
      skippedBefore: 0,
      skippedAfter: 0,
      phaseEvents: [trustedEvent({ timeStamp: 100, recordedAtMs: 105 })],
      rafFramesDuringPhase: 30,
      screenshotBytes: 12_000,
      surface,
      positiveControlMeasured: true,
    });
    expect(policy.status).toBe("censored");
    expect(policy.numericBudgetEligible).toBe(false);
    expect(policy.eligibleTrustedInputs).toBe(1);
    expect(policy.reasons.join(" ")).toContain("percentile unavailable (censored)");
  });

  it("rejects a zero-sample window when the page-side delay reaches the threshold", () => {
    const policy = evaluateIdlePopulation({
      window: eventTimingWindow({ status: "no-samples", samples: 0 }),
      skippedBefore: 0,
      skippedAfter: 0,
      phaseEvents: [trustedEvent({ timeStamp: 100, recordedAtMs: 130 })],
      rafFramesDuringPhase: 30,
      screenshotBytes: 12_000,
      surface,
      positiveControlMeasured: true,
    });
    expect(policy.status).toBe("unavailable");
    expect(policy.reasons.join(" ")).toContain("not explained by censoring");
  });

  it("rejects censoring claims without eligible input, without frames, or without positive control", () => {
    const base = {
      window: eventTimingWindow({ status: "no-samples", samples: 0 }),
      skippedBefore: 0,
      skippedAfter: 0,
      phaseEvents: [trustedEvent()],
      rafFramesDuringPhase: 30,
      screenshotBytes: 12_000,
      surface,
      positiveControlMeasured: true,
    } as const;
    expect(evaluateIdlePopulation({ ...base, phaseEvents: [] }).reasons.join(" ")).toContain(
      "no eligible trusted input",
    );
    expect(
      evaluateIdlePopulation({ ...base, rafFramesDuringPhase: 0 }).reasons.join(" "),
    ).toContain("no frame/paint evidence");
    expect(
      evaluateIdlePopulation({ ...base, positiveControlMeasured: false }).reasons.join(" "),
    ).toContain("blocked positive control did not measure");
    expect(
      evaluateIdlePopulation({
        ...base,
        surface: { visibilityState: "hidden", hasFocus: false },
      }).reasons.join(" "),
    ).toContain("not visible/focused");
  });

  it("rejects ring loss and skipped entries instead of calling them censoring", () => {
    const policy = evaluateIdlePopulation({
      window: eventTimingWindow({ status: "no-samples", samples: 0, droppedDuringWindow: 3 }),
      skippedBefore: 0,
      skippedAfter: 2,
      phaseEvents: [trustedEvent()],
      rafFramesDuringPhase: 30,
      screenshotBytes: 12_000,
      surface,
      positiveControlMeasured: true,
    });
    expect(policy.status).toBe("unavailable");
    expect(policy.reasons.join(" ")).toContain("dropped 3 entries");
    expect(policy.reasons.join(" ")).toContain("skipped 2 entries");
  });

  it("never turns an unknown population into a censored or numeric-eligible verdict", () => {
    const unknown = eventTimingWindow({
      status: "no-samples",
      samples: 0,
      inputDelay: { count: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 },
      populationStatus: "unknown",
      populationNotes: ["phase snapshots are missing"],
    });
    const policy = evaluateIdlePopulation({
      window: unknown,
      skippedBefore: 0,
      skippedAfter: 0,
      phaseEvents: [trustedEvent({ timeStamp: 100, recordedAtMs: 105 })],
      rafFramesDuringPhase: 30,
      screenshotBytes: 12_000,
      surface,
      positiveControlMeasured: true,
    });
    expect(policy.status).toBe("unavailable");
    expect(policy.numericBudgetEligible).toBe(false);
    expect(policy.reasons.join(" ")).toContain("population accounting is unknown");
  });
});
