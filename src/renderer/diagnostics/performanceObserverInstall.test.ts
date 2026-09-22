import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventTimingEntryLike, LongTaskEntryLike } from "./performanceEntryAdapters";
import {
  EVENT_TIMING_DURATION_QUANTUM_MS,
  EVENT_TIMING_DURATION_THRESHOLD_MS,
  installPerformanceObservers,
  resolveEventTimingDurationThresholdMs,
  type EventTimingDurationThreshold,
  type PerformanceObserverSink,
} from "./performanceObserverInstall";
import {
  startRendererPerfDiagnostics,
  type RendererPerfDiagnosticsController,
} from "./rendererPerfDiagnostics";

class RecordingSink implements PerformanceObserverSink {
  readonly eventBatches: EventTimingEntryLike[][] = [];
  readonly longTaskBatches: LongTaskEntryLike[][] = [];
  readonly eventTimingMarks: Array<{
    status: "supported" | "unsupported";
    thresholds: EventTimingDurationThreshold | null;
  }> = [];
  readonly longTaskMarks: Array<"supported" | "unsupported"> = [];

  recordEventTimingEntries(entries: readonly EventTimingEntryLike[]): void {
    this.eventBatches.push([...entries]);
  }

  recordLongTaskEntries(entries: readonly LongTaskEntryLike[]): void {
    this.longTaskBatches.push([...entries]);
  }

  markEventTimingObserver(
    status: "supported" | "unsupported",
    thresholds: EventTimingDurationThreshold | null,
  ): void {
    this.eventTimingMarks.push({ status, thresholds });
  }

  markLongTaskObserver(status: "supported" | "unsupported"): void {
    this.longTaskMarks.push(status);
  }
}

function stubPerformanceObserver(
  options: {
    readonly supportedEntryTypes?: readonly string[];
    readonly onObserve?: (init: PerformanceObserverInit) => void;
  } = {},
) {
  class StubbedPerformanceObserver {
    static supportedEntryTypes = options.supportedEntryTypes;
    static readonly instances: StubbedPerformanceObserver[] = [];
    readonly observed: PerformanceObserverInit[] = [];
    disconnectCount = 0;

    constructor(private readonly callback: (list: { getEntries(): unknown[] }) => void) {
      StubbedPerformanceObserver.instances.push(this);
    }

    observe(init: PerformanceObserverInit): void {
      options.onObserve?.(init);
      this.observed.push(init);
    }

    disconnect(): void {
      this.disconnectCount += 1;
    }

    deliver(entries: unknown[]): void {
      this.callback({ getEntries: () => entries });
    }
  }
  vi.stubGlobal("PerformanceObserver", StubbedPerformanceObserver);
  return StubbedPerformanceObserver;
}

describe("resolveEventTimingDurationThresholdMs", () => {
  it("floors at 16 ms and normalizes up to the 8 ms platform quantization", () => {
    expect(resolveEventTimingDurationThresholdMs(undefined)).toEqual({
      requestedMs: EVENT_TIMING_DURATION_THRESHOLD_MS,
      effectiveMs: EVENT_TIMING_DURATION_THRESHOLD_MS,
    });
    expect(resolveEventTimingDurationThresholdMs(4)).toEqual({ requestedMs: 4, effectiveMs: 16 });
    expect(resolveEventTimingDurationThresholdMs(17)).toEqual({ requestedMs: 17, effectiveMs: 24 });
    expect(resolveEventTimingDurationThresholdMs(20)).toEqual({ requestedMs: 20, effectiveMs: 24 });
    expect(resolveEventTimingDurationThresholdMs(40)).toEqual({
      requestedMs: 40,
      effectiveMs: 40,
    });
    expect(EVENT_TIMING_DURATION_QUANTUM_MS).toBe(8);
  });

  it("falls back to the floor for non-finite and non-positive values", () => {
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 0]) {
      expect(resolveEventTimingDurationThresholdMs(invalid)).toEqual({
        requestedMs: EVENT_TIMING_DURATION_THRESHOLD_MS,
        effectiveMs: EVENT_TIMING_DURATION_THRESHOLD_MS,
      });
    }
  });
});

describe("installPerformanceObservers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("installs both observers when supportedEntryTypes lists them and disconnects once", () => {
    const Fake = stubPerformanceObserver({ supportedEntryTypes: ["event", "longtask"] });
    const sink = new RecordingSink();
    const dispose = installPerformanceObservers(sink, resolveEventTimingDurationThresholdMs(40));
    expect(Fake.instances).toHaveLength(2);
    const eventObserver = Fake.instances.find((observer) => observer.observed[0]?.type === "event");
    const longTaskObserver = Fake.instances.find(
      (observer) => observer.observed[0]?.type === "longtask",
    );
    expect(eventObserver?.observed).toEqual([
      { type: "event", buffered: false, durationThreshold: 40 },
    ]);
    expect(longTaskObserver?.observed).toEqual([{ type: "longtask", buffered: false }]);
    expect(sink.eventTimingMarks).toEqual([
      { status: "supported", thresholds: { requestedMs: 40, effectiveMs: 40 } },
    ]);
    expect(sink.longTaskMarks).toEqual(["supported"]);

    eventObserver?.deliver([{ name: "click", startTime: 1, processingStart: 2, processingEnd: 3 }]);
    longTaskObserver?.deliver([{ startTime: 10, duration: 120 }]);
    expect(sink.eventBatches).toEqual([
      [{ name: "click", startTime: 1, processingStart: 2, processingEnd: 3 }],
    ]);
    expect(sink.longTaskBatches).toEqual([[{ startTime: 10, duration: 120 }]]);

    dispose();
    dispose();
    expect(eventObserver?.disconnectCount).toBe(1);
    expect(longTaskObserver?.disconnectCount).toBe(1);
  });

  it("marks unsupported without observing when supportedEntryTypes omits the type", () => {
    const Fake = stubPerformanceObserver({ supportedEntryTypes: ["resource", "navigation"] });
    const sink = new RecordingSink();
    const dispose = installPerformanceObservers(
      sink,
      resolveEventTimingDurationThresholdMs(undefined),
    );
    expect(Fake.instances).toHaveLength(0);
    expect(sink.eventTimingMarks).toEqual([{ status: "unsupported", thresholds: null }]);
    expect(sink.longTaskMarks).toEqual(["unsupported"]);
    expect(() => dispose()).not.toThrow();
  });

  it("falls back to the guarded observe() call when supportedEntryTypes is absent", () => {
    const Fake = stubPerformanceObserver({
      onObserve: (init) => {
        if (init.type === "event") throw new Error("unsupported entry type");
      },
    });
    const sink = new RecordingSink();
    const dispose = installPerformanceObservers(
      sink,
      resolveEventTimingDurationThresholdMs(undefined),
    );
    expect(Fake.instances).toHaveLength(2);
    expect(sink.eventTimingMarks).toEqual([{ status: "unsupported", thresholds: null }]);
    expect(sink.longTaskMarks).toEqual(["supported"]);
    dispose();
  });

  it("marks both unsupported when the PerformanceObserver API is missing", () => {
    vi.stubGlobal("PerformanceObserver", undefined);
    const sink = new RecordingSink();
    const dispose = installPerformanceObservers(
      sink,
      resolveEventTimingDurationThresholdMs(undefined),
    );
    expect(sink.eventTimingMarks).toEqual([{ status: "unsupported", thresholds: null }]);
    expect(sink.longTaskMarks).toEqual(["unsupported"]);
    dispose();
  });
});

describe("observer lifecycle through startRendererPerfDiagnostics", () => {
  const controllers: RendererPerfDiagnosticsController[] = [];

  afterEach(() => {
    for (const controller of controllers.splice(0)) controller.dispose();
    vi.unstubAllGlobals();
  });

  it("records entries with identity, disconnects on dispose, and ignores late callbacks", () => {
    const Fake = stubPerformanceObserver({ supportedEntryTypes: ["event", "longtask"] });
    const controller = startRendererPerfDiagnostics({
      requested: true,
      target: window,
      now: () => 0,
      eventTimingDurationThresholdMs: 20,
    });
    if (!controller) throw new Error("diagnostics did not start");
    controllers.push(controller);

    const eventObserver = Fake.instances.find((observer) => observer.observed[0]?.type === "event");
    expect(eventObserver?.observed).toEqual([
      { type: "event", buffered: false, durationThreshold: 24 },
    ]);
    eventObserver?.deliver([
      {
        name: "click",
        startTime: 1_000,
        processingStart: 1_040,
        processingEnd: 1_075,
        duration: 96,
        interactionId: 7,
      },
    ]);
    const started = controller.diagnostics.snapshot();
    expect(started.observers.eventTiming).toEqual({
      status: "supported",
      requestedDurationThresholdMs: 20,
      durationThresholdMs: 24,
      sampleCount: 1,
      skippedEntryCount: 0,
    });
    expect(started.recentEventTimings).toEqual([
      {
        name: "click",
        interactionId: 7,
        startMs: 1_000,
        inputDelayMs: 40,
        processingMs: 35,
        interactionDurationMs: 96,
      },
    ]);

    controller.dispose();
    expect(eventObserver?.disconnectCount).toBe(1);
    expect(window.__poracodePerfDiagnostics).toBeUndefined();

    // A late callback after dispose must not enter the snapshot.
    eventObserver?.deliver([
      {
        name: "click",
        startTime: 9_000,
        processingStart: 9_001,
        processingEnd: 9_002,
        duration: 200,
        interactionId: 8,
      },
    ]);
    expect(controller.diagnostics.snapshot().observers.eventTiming.sampleCount).toBe(1);
  });

  it("installs a fresh observer set on restart instead of reusing disconnected ones", () => {
    const Fake = stubPerformanceObserver({ supportedEntryTypes: ["event", "longtask"] });
    const first = startRendererPerfDiagnostics({ requested: true, target: window, now: () => 0 });
    if (!first) throw new Error("diagnostics did not start");
    controllers.push(first);

    const duringActive = startRendererPerfDiagnostics({
      requested: true,
      target: window,
      now: () => 0,
    });
    expect(duringActive).toBeUndefined();
    expect(Fake.instances).toHaveLength(2);

    first.dispose();
    const restarted = startRendererPerfDiagnostics({
      requested: true,
      target: window,
      now: () => 0,
    });
    if (!restarted) throw new Error("diagnostics did not restart");
    controllers.push(restarted);
    expect(Fake.instances).toHaveLength(4);

    const restartedEventObserver = Fake.instances[2];
    restartedEventObserver?.deliver([
      {
        name: "keydown",
        startTime: 100,
        processingStart: 104,
        processingEnd: 104,
        duration: 0,
        interactionId: 0,
      },
    ]);
    const snapshot = restarted.diagnostics.snapshot();
    expect(snapshot.observers.eventTiming.sampleCount).toBe(1);
    expect(snapshot.recentEventTimings[0]?.name).toBe("keydown");
  });
});
