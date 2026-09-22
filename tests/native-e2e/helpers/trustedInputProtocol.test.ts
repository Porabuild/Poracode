import { describe, expect, it } from "vitest";
import type { RendererPerfSnapshot } from "../../../src/renderer/diagnostics/rendererPerfDiagnostics.ts";
import type { EventTimingWindowEvidence, PhaseWindowEvidence } from "./rendererPhaseEvidence.ts";
import {
  buildIdleProbeText,
  evaluateBlockedControl,
  planTrustedInputBatches,
  resolveTrustedInputOptions,
  sliceRecorderEvents,
  type RecorderState,
  type RecorderTrustedEvent,
} from "./trustedInputProtocol.ts";

/**
 * Policy unit tests for the corrected trusted-input/longtask protocol.
 *
 * These pin the R0.1 calibration decisions: a supported observer with zero
 * idle samples is only accepted as an explicit *censored* percentile (never a
 * numeric budget pass), and the blocked positive control must be a real
 * scheduled DOM task with a queued trusted input whose timestamps show it was
 * created before the block ended and processed after it.
 */

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

function longTaskWindow(
  overrides: Partial<PhaseWindowEvidence["longTasks"]> = {},
): PhaseWindowEvidence["longTasks"] {
  return {
    status: "measured",
    observerStatus: "supported",
    samples: 3,
    over200Ms: 3,
    duration: { count: 3, p50Ms: 250, p95Ms: 260, p99Ms: 260, maxMs: 260 },
    droppedDuringWindow: 0,
    ...overrides,
  };
}

function phaseWindow(overrides: Partial<PhaseWindowEvidence> = {}): PhaseWindowEvidence {
  return {
    phase: "trusted-blocked",
    capturedAtMonotonicMs: 5_000,
    aggregate: null,
    eventTimings: eventTimingWindow({
      status: "measured",
      samples: 3,
      inputDelay: { count: 3, p50Ms: 1, p95Ms: 240, p99Ms: 240, maxMs: 240 },
    }),
    longTasks: longTaskWindow(),
    slowFrames: {
      samples: 1,
      delta: { count: 1, p50Ms: 40, p95Ms: 40, p99Ms: 40, maxMs: 40 },
      droppedDuringWindow: 0,
    },
    droppedSpansDuringWindow: 0,
    ...overrides,
  };
}

function trustedEvent(overrides: Partial<RecorderTrustedEvent> = {}): RecorderTrustedEvent {
  return { type: "click", isTrusted: true, timeStamp: 100, recordedAtMs: 103, ...overrides };
}

function recorderState(events: readonly RecorderTrustedEvent[]): RecorderState {
  return {
    installedAtMs: 0,
    visibilityState: "visible",
    hasFocus: true,
    rafFrames: 60,
    rafFirstMs: 0,
    rafLastMs: 1_000,
    rafMaxGapMs: 17,
    trustedEvents: events,
    trustedEventsTruncated: false,
    block: {
      armed: false,
      blockMs: 0,
      startMs: null,
      endMs: null,
      fired: false,
      handlerType: null,
    },
  };
}

function blockedSnapshot(): RendererPerfSnapshot {
  return {
    capturedAtMonotonicMs: 5_000,
    recentEventTimings: [
      {
        name: "click",
        interactionId: 7,
        startMs: 4_100,
        inputDelayMs: 230,
        processingMs: 2,
        interactionDurationMs: 232,
      },
    ],
  } as unknown as RendererPerfSnapshot;
}

describe("evaluateBlockedControl", () => {
  const block = {
    armed: true,
    blockMs: 250,
    startMs: 4_000,
    endMs: 4_250,
    fired: true,
    handlerType: "pointerdown",
  };

  it("passes with a real DOM block, a >=200ms long task and a queued delayed event", () => {
    const policy = evaluateBlockedControl({
      window: phaseWindow(),
      after: blockedSnapshot(),
      block,
      phaseEvents: [trustedEvent({ type: "pointerdown", timeStamp: 4_050, recordedAtMs: 4_260 })],
      idleMaxInputDelayMs: 4,
      idleP95InputDelayMs: 4,
      idlePopulationComplete: false,
      idleMeasured: true,
      minQueuedInputDelayMs: 150,
      idleWindowStartMs: 1_000,
    });
    expect(policy.reasons).toEqual([]);
    expect(policy.ok).toBe(true);
    expect(policy.queued.delayMs).toBe(230);
    expect(policy.contrast.elevationOverIdleP95Ms).toBe(226);
    // A lossy idle baseline is recorded as such; it does not by itself veto the
    // causal positive control, and it never makes a numeric budget eligible.
    expect(policy.contrast.idlePopulationComplete).toBe(false);
  });

  it("uses the idle p95 baseline so a contaminated idle tail cannot mask the control", () => {
    const policy = evaluateBlockedControl({
      window: phaseWindow(),
      after: blockedSnapshot(),
      block,
      phaseEvents: [trustedEvent({ type: "pointerdown", timeStamp: 4_050, recordedAtMs: 4_260 })],
      idleMaxInputDelayMs: 324,
      idleP95InputDelayMs: 2,
      idleMeasured: true,
      minQueuedInputDelayMs: 150,
      idleWindowStartMs: 1_000,
    });
    expect(policy.ok).toBe(true);
    expect(policy.contrast.queuedDelayMs).toBe(230);
    expect(policy.contrast.elevationOverIdleP95Ms).toBe(228);
    expect(policy.contrast.elevationOverIdleMaxMs).toBe(-94);
    // The lossy-baseline provenance is recorded, not silently omitted: the
    // causal pass rests on the absolute block/long-task/queued-event criteria.
    expect(policy.contrast.idlePopulationComplete).toBeNull();
  });

  it("fails when the queued delay does not exceed the idle p95 by 100ms", () => {
    const policy = evaluateBlockedControl({
      window: phaseWindow(),
      after: {
        capturedAtMonotonicMs: 5_000,
        recentEventTimings: [
          {
            name: "click",
            interactionId: 7,
            startMs: 4_100,
            inputDelayMs: 80,
            processingMs: 2,
            interactionDurationMs: 82,
          },
        ],
      } as unknown as RendererPerfSnapshot,
      block,
      phaseEvents: [trustedEvent({ type: "pointerdown", timeStamp: 4_050, recordedAtMs: 4_260 })],
      idleMaxInputDelayMs: 4,
      idleP95InputDelayMs: 4,
      idleMeasured: true,
      minQueuedInputDelayMs: 150,
      idleWindowStartMs: 1_000,
    });
    expect(policy.ok).toBe(false);
    expect(policy.reasons.join(" ")).toContain("elevation over the idle p95");
  });

  it("fails without the queued input delay and without a >=200ms long task", () => {
    const policy = evaluateBlockedControl({
      window: phaseWindow({
        eventTimings: eventTimingWindow({
          samples: 1,
          inputDelay: { count: 1, p50Ms: 1, p95Ms: 1, p99Ms: 1, maxMs: 1 },
        }),
        longTasks: longTaskWindow({
          over200Ms: 0,
          samples: 1,
          duration: { count: 1, p50Ms: 120, p95Ms: 120, p99Ms: 120, maxMs: 120 },
        }),
      }),
      after: {
        capturedAtMonotonicMs: 5_000,
        recentEventTimings: [],
      } as unknown as RendererPerfSnapshot,
      block,
      phaseEvents: [],
      idleMaxInputDelayMs: null,
      idleMeasured: false,
      minQueuedInputDelayMs: 150,
      idleWindowStartMs: 1_000,
    });
    expect(policy.ok).toBe(false);
    expect(policy.reasons.join(" ")).toContain("no queued trusted input showed");
    expect(policy.reasons.join(" ")).toContain("0 entries >= 200ms");
  });

  it("matches a queued click whose event was created before a lagging block handler started", () => {
    const policy = evaluateBlockedControl({
      window: phaseWindow(),
      after: {
        capturedAtMonotonicMs: 5_000,
        recentEventTimings: [
          {
            name: "mousedown",
            interactionId: 7,
            // Created 128 ms before the handler started (overloaded main
            // thread), processed only when the 250 ms block released.
            startMs: 3_872,
            inputDelayMs: 378,
            processingMs: 2,
            interactionDurationMs: 380,
          },
        ],
      } as unknown as RendererPerfSnapshot,
      block,
      phaseEvents: [trustedEvent({ type: "pointerdown", timeStamp: 3_900, recordedAtMs: 4_260 })],
      idleMaxInputDelayMs: 4,
      idleP95InputDelayMs: 4,
      idleMeasured: true,
      minQueuedInputDelayMs: 150,
      idleWindowStartMs: 1_000,
    });
    expect(policy.ok).toBe(true);
    expect(policy.queued.delayMs).toBe(378);
    expect(policy.queued.createdBeforeBlockEnd).toBe(true);
    expect(policy.queued.processedAfterBlockEnd).toBe(true);
  });

  it("fails when the block did not run as a scheduled DOM task", () => {
    const policy = evaluateBlockedControl({
      window: phaseWindow(),
      after: blockedSnapshot(),
      block: { ...block, fired: false, handlerType: null, endMs: null },
      phaseEvents: [],
      idleMaxInputDelayMs: null,
      idleMeasured: false,
      minQueuedInputDelayMs: 150,
      idleWindowStartMs: 1_000,
    });
    expect(policy.ok).toBe(false);
    expect(policy.reasons.join(" ")).toContain("never fired");
    expect(policy.reasons.join(" ")).toContain("handler null");
  });
});

describe("resolveTrustedInputOptions / sliceRecorderEvents", () => {
  it("merges declared overrides over the plan defaults", () => {
    const options = resolveTrustedInputOptions({ idleClicks: 5, blockMs: 300 });
    expect(options.idleClicks).toBe(5);
    expect(options.blockMs).toBe(300);
    expect(options.idleTypedChars).toBe(40);
    expect(options.blockedCycles).toBe(3);
    expect(options.idleClicksPerSegment).toBe(8);
    expect(options.idleTypedCharsPerSegment).toBe(10);
  });

  it("slices recorder events by pre-phase count and falls back to the whole ring", () => {
    const events = [trustedEvent({ timeStamp: 1 }), trustedEvent({ timeStamp: 2 })];
    expect(sliceRecorderEvents(recorderState([events[0]!]), recorderState(events))).toEqual([
      events[1],
    ]);
    expect(sliceRecorderEvents(null, recorderState(events))).toEqual(events);
    const truncated = { ...recorderState(events), trustedEventsTruncated: true };
    expect(sliceRecorderEvents(recorderState([events[0]!]), truncated)).toEqual(events);
  });
});

describe("planTrustedInputBatches / buildIdleProbeText", () => {
  it("splits the default script into bounded click and typed batches plus a closing click", () => {
    const batches = planTrustedInputBatches(resolveTrustedInputOptions());
    expect(batches.map((batch) => `${batch.kind}:${String(batch.count)}`)).toEqual([
      "click-batch:8",
      "click-batch:8",
      "click-batch:4",
      "type-batch:10",
      "type-batch:10",
      "type-batch:10",
      "type-batch:10",
      "click-batch:1",
    ]);
    expect(batches.map((batch) => batch.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("honors custom batch sizes and skips the closing click when no clicks are declared", () => {
    const custom = planTrustedInputBatches(
      resolveTrustedInputOptions({
        idleClicks: 5,
        idleClicksPerSegment: 2,
        idleTypedChars: 3,
        idleTypedCharsPerSegment: 2,
      }),
    );
    expect(custom.map((batch) => `${batch.kind}:${String(batch.count)}`)).toEqual([
      "click-batch:2",
      "click-batch:2",
      "click-batch:1",
      "type-batch:2",
      "type-batch:1",
      "click-batch:1",
    ]);
    const typedOnly = planTrustedInputBatches(
      resolveTrustedInputOptions({ idleClicks: 0, idleTypedChars: 5, idleTypedCharsPerSegment: 2 }),
    );
    expect(typedOnly.map((batch) => batch.kind)).toEqual([
      "type-batch",
      "type-batch",
      "type-batch",
    ]);
    expect(buildIdleProbeText(5)).toBe("v2q p");
    expect(buildIdleProbeText(10)).toBe("v2q probe ");
  });
});
