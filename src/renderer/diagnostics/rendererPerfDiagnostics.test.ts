import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PerfRingBuffer } from "./perfRingBuffer";
import {
  RENDERER_FRAME_BUDGET_MS,
  RENDERER_PERF_DIAG_FORMAT_VERSION,
  RendererPerfDiagnostics,
  beginRendererPerfSpan,
  isRendererPerfDiagnosticsRequested,
  noteRendererPerfEvent,
  startRendererPerfDiagnostics,
} from "./rendererPerfDiagnostics";

describe("PerfRingBuffer", () => {
  it("drops the oldest record beyond capacity and counts the loss", () => {
    const ring = new PerfRingBuffer<number>(3);
    for (const value of [1, 2, 3, 4, 5]) ring.push(value);
    expect(ring.toArray()).toEqual([3, 4, 5]);
    expect(ring.droppedCount).toBe(2);
    expect(ring.size).toBe(3);
  });

  it("clear resets contents but preserves the loss accounting", () => {
    const ring = new PerfRingBuffer<string>(2);
    ring.push("a");
    ring.push("b");
    ring.push("c");
    ring.clear();
    expect(ring.toArray()).toEqual([]);
    expect(ring.droppedCount).toBe(1);
  });

  it("rejects a non-positive capacity", () => {
    expect(() => new PerfRingBuffer(0)).toThrow("capacity");
  });
});

describe("isRendererPerfDiagnosticsRequested", () => {
  it("requires the query flag or the stored flag", () => {
    expect(isRendererPerfDiagnosticsRequested({ query: "", storage: null })).toBe(false);
    expect(
      isRendererPerfDiagnosticsRequested({ query: "?poracodePerfDiag=1", storage: null }),
    ).toBe(true);
    expect(
      isRendererPerfDiagnosticsRequested({ query: "?other=1", storage: { getItem: () => "1" } }),
    ).toBe(true);
    expect(
      isRendererPerfDiagnosticsRequested({ query: "?other=1", storage: { getItem: () => "0" } }),
    ).toBe(false);
  });
});

describe("RendererPerfDiagnostics", () => {
  it("classifies frame opportunities against the 120 Hz budget per phase", () => {
    const diagnostics = new RendererPerfDiagnostics({ now: () => 0 });
    diagnostics.setPhase("A-idle");
    diagnostics.handleFrame(0); // baseline frame
    diagnostics.handleFrame(8); // on time
    diagnostics.handleFrame(25); // slow
    diagnostics.setPhase("C-bulk");
    diagnostics.handleFrame(33); // on time within the new phase
    const snapshot = diagnostics.snapshot();
    expect(snapshot.frameBudgetMs).toBeCloseTo(RENDERER_FRAME_BUDGET_MS, 5);
    expect(snapshot.phases["A-idle"]).toMatchObject({
      frames: 2,
      onTimeFrames: 1,
      maxFrameDeltaMs: 17,
    });
    expect(snapshot.phases["C-bulk"]).toMatchObject({ frames: 1, onTimeFrames: 1 });
    expect(snapshot.recentSlowFrames).toEqual([{ atMs: 25, deltaMs: 17 }]);
  });

  it("bounds phase memory by dropping the oldest phase beyond the cap", () => {
    const diagnostics = new RendererPerfDiagnostics({ now: () => 0 });
    for (let index = 0; index < 10; index += 1) diagnostics.setPhase(`phase-${index}`);
    const snapshot = diagnostics.snapshot();
    expect(Object.keys(snapshot.phases)).toHaveLength(8);
    expect(snapshot.phases["phase-0"]).toBeUndefined();
    expect(snapshot.phases["phase-9"]).toBeDefined();
  });

  it("records spans with details into a bounded ring and per-phase aggregates", () => {
    let nowMs = 0;
    const diagnostics = new RendererPerfDiagnostics({ now: () => nowMs });
    const span = diagnostics.beginSpan("runtime-drain");
    nowMs = 12;
    span.end({ threads: 3, events: 40 });
    diagnostics.recordSpan("runtime-drain", 100, 5);
    const snapshot = diagnostics.snapshot();
    expect(snapshot.recentSpans).toEqual([
      { name: "runtime-drain", startMs: 0, durationMs: 12, detail: { threads: 3, events: 40 } },
      { name: "runtime-drain", startMs: 100, durationMs: 5 },
    ]);
    expect(snapshot.phases.session?.spans["runtime-drain"]).toEqual({
      count: 2,
      totalMs: 17,
      maxMs: 12,
    });
  });

  it("derives input delay, handler time and event duration from event timing", () => {
    const diagnostics = new RendererPerfDiagnostics({ now: () => 0 });
    diagnostics.recordEventTiming(1_000, 1_040, 1_052, 90);
    diagnostics.recordLongTask(2_000, 90);
    const snapshot = diagnostics.snapshot();
    expect(snapshot.recentEventTimings).toEqual([
      {
        name: null,
        interactionId: null,
        startMs: 1_000,
        inputDelayMs: 40,
        processingMs: 12,
        interactionDurationMs: 90,
      },
    ]);
    expect(snapshot.phases.session?.eventTimings).toEqual({
      count: 1,
      maxInputDelayMs: 40,
      maxProcessingMs: 12,
      maxInteractionDurationMs: 90,
    });
    expect(snapshot.phases.session?.longTasks).toEqual({ count: 1, maxDurationMs: 90 });
    expect(snapshot.recentLongTasks).toEqual([{ startMs: 2_000, durationMs: 90 }]);
  });

  it("records observer-shaped event entries with identity and counts malformed batches", () => {
    const diagnostics = new RendererPerfDiagnostics({ now: () => 0 });
    diagnostics.recordEventTimingEntries([
      {
        name: "click",
        startTime: 1_000,
        processingStart: 1_040,
        processingEnd: 1_075,
        duration: 96,
        interactionId: 7,
      },
      {
        name: "keydown",
        startTime: 2_000,
        processingStart: 2_004,
        processingEnd: 2_004,
        duration: 0,
        interactionId: 0,
      },
      { startTime: 3_000, processingStart: 3_010 },
    ]);
    const snapshot = diagnostics.snapshot();
    expect(snapshot.recentEventTimings).toEqual([
      {
        name: "click",
        interactionId: 7,
        startMs: 1_000,
        inputDelayMs: 40,
        processingMs: 35,
        interactionDurationMs: 96,
      },
      {
        name: "keydown",
        interactionId: 0,
        startMs: 2_000,
        inputDelayMs: 4,
        processingMs: 0,
        interactionDurationMs: 0,
      },
    ]);
    expect(snapshot.observers.eventTiming).toMatchObject({
      sampleCount: 2,
      skippedEntryCount: 1,
    });
    expect(snapshot.phases.session?.eventTimings).toEqual({
      count: 2,
      maxInputDelayMs: 40,
      maxProcessingMs: 35,
      maxInteractionDurationMs: 96,
    });
  });

  it("records long-task batches and counts malformed entries", () => {
    const diagnostics = new RendererPerfDiagnostics({ now: () => 0 });
    diagnostics.recordLongTaskEntries([
      { startTime: 5_000, duration: 137 },
      { startTime: 6_000, duration: "bad" },
      { startTime: 7_000, duration: -4 },
    ]);
    const snapshot = diagnostics.snapshot();
    expect(snapshot.recentLongTasks).toEqual([{ startMs: 5_000, durationMs: 137 }]);
    expect(snapshot.observers.longTask).toMatchObject({ sampleCount: 1, skippedEntryCount: 2 });
  });

  it("validates direct record calls with the same adapter as observer entries", () => {
    const diagnostics = new RendererPerfDiagnostics({ now: () => 0 });
    diagnostics.recordEventTiming(Number.NaN, 1, 2);
    diagnostics.recordEventTiming(1_000, 1_040, 1_030);
    diagnostics.recordLongTask(1, Number.NaN);
    const snapshot = diagnostics.snapshot();
    expect(snapshot.recentEventTimings).toEqual([]);
    expect(snapshot.recentLongTasks).toEqual([]);
    expect(snapshot.observers.eventTiming.skippedEntryCount).toBe(2);
    expect(snapshot.observers.longTask.skippedEntryCount).toBe(1);
  });

  it("reports observer availability separately from sample counts", () => {
    const diagnostics = new RendererPerfDiagnostics({ now: () => 0 });
    expect(diagnostics.snapshot().observers).toEqual({
      eventTiming: {
        status: "not-installed",
        requestedDurationThresholdMs: null,
        durationThresholdMs: null,
        sampleCount: 0,
        skippedEntryCount: 0,
      },
      longTask: { status: "not-installed", sampleCount: 0, skippedEntryCount: 0 },
    });
  });

  it("normalizes the configured Event Timing threshold to a finite 8 ms multiple", () => {
    expect(new RendererPerfDiagnostics({ now: () => 0 }).eventTimingDurationThresholds).toEqual({
      requestedMs: 16,
      effectiveMs: 16,
    });
    expect(
      new RendererPerfDiagnostics({ now: () => 0, eventTimingDurationThresholdMs: 20 })
        .eventTimingDurationThresholds,
    ).toEqual({ requestedMs: 20, effectiveMs: 24 });
    expect(
      new RendererPerfDiagnostics({ now: () => 0, eventTimingDurationThresholdMs: Number.NaN })
        .eventTimingDurationThresholds,
    ).toEqual({ requestedMs: 16, effectiveMs: 16 });
  });

  it("runs the frame monitor on the injected scheduler until stopped", () => {
    const scheduled: Array<((now: number) => void) | undefined> = [];
    const diagnostics = new RendererPerfDiagnostics({
      now: () => 0,
      scheduleFrame: (callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
      cancelFrame: (handle) => {
        scheduled.splice(handle - 1, 1, undefined);
      },
    });
    diagnostics.startFrameMonitor();
    expect(scheduled).toHaveLength(1);
    scheduled[0]?.(16);
    expect(scheduled).toHaveLength(2);
    diagnostics.stopFrameMonitor();
    expect(scheduled[1]).toBeUndefined();
  });

  it("retains nothing for observations recorded after dispose", () => {
    let nowMs = 0;
    const diagnostics = new RendererPerfDiagnostics({ now: () => nowMs });
    const span = diagnostics.beginSpan("x");
    diagnostics.dispose();
    nowMs = 10;
    span.end();
    diagnostics.recordSpan("x", 0, 1);
    diagnostics.recordEventTiming(1_000, 1_040, 1_052, 90);
    diagnostics.recordLongTask(2_000, 90);
    const snapshot = diagnostics.snapshot();
    expect(snapshot.recentSpans).toEqual([]);
    expect(snapshot.recentEventTimings).toEqual([]);
    expect(snapshot.recentLongTasks).toEqual([]);
  });
});

describe("module-level hooks", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("startRendererPerfDiagnostics is inert without the opt-in flag", () => {
    expect(startRendererPerfDiagnostics()).toBeUndefined();
    expect(window.__poracodePerfDiagnostics).toBeUndefined();
    // Module hooks stay no-ops while inert.
    const span = beginRendererPerfSpan("runtime-drain");
    expect(() => span.end({ threads: 0 })).not.toThrow();
    expect(() => noteRendererPerfEvent("large-reply-complete", { id: "x" })).not.toThrow();
  });

  it("exports a plain-data snapshot handle under the probe contract when requested", () => {
    const controller = startRendererPerfDiagnostics({
      requested: true,
      now: () => 0,
      target: window,
    });
    expect(controller).toBeDefined();
    const handle = window.__poracodePerfDiagnostics;
    expect(handle).toBeDefined();
    handle?.setPhase("C-bulk");
    const snapshot = handle?.snapshot();
    expect(snapshot?.formatVersion).toBe(RENDERER_PERF_DIAG_FORMAT_VERSION);
    expect(snapshot?.phase).toBe("C-bulk");
    expect(typeof snapshot?.timeOriginEpochMs).toBe("number");
    controller?.dispose();
    expect(window.__poracodePerfDiagnostics).toBeUndefined();
    // The active instance is released, so a fresh start is possible.
    const second = startRendererPerfDiagnostics({ requested: true, now: () => 0, target: window });
    expect(second).toBeDefined();
    second?.dispose();
  });

  it("does not let a stale controller dispose unpublish a newer controller's handle", () => {
    const first = startRendererPerfDiagnostics({ requested: true, now: () => 0, target: window });
    expect(first).toBeDefined();
    expect(window.__poracodePerfDiagnostics).toBeDefined();
    first?.dispose();
    expect(window.__poracodePerfDiagnostics).toBeUndefined();

    const second = startRendererPerfDiagnostics({ requested: true, now: () => 0, target: window });
    expect(second).toBeDefined();
    const secondHandle = window.__poracodePerfDiagnostics;
    expect(secondHandle).toBeDefined();

    // Re-disposing the dead controller must not delete the live controller's handle.
    first?.dispose();
    expect(window.__poracodePerfDiagnostics).toBe(secondHandle);
    expect(window.__poracodePerfDiagnostics?.snapshot().formatVersion).toBe(
      RENDERER_PERF_DIAG_FORMAT_VERSION,
    );
    second?.dispose();
    expect(window.__poracodePerfDiagnostics).toBeUndefined();
  });

  it("enables via the localStorage flag", () => {
    window.localStorage.setItem("poracode-perf-diag", "1");
    const controller = startRendererPerfDiagnostics({ now: () => 0, target: window });
    expect(controller).toBeDefined();
    controller?.dispose();
  });
});
