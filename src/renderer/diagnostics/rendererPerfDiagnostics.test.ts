import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PerfRingBuffer } from "./perfRingBuffer";
import {
  RENDERER_FRAME_BUDGET_MS,
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

  it("derives input delay from event timing and aggregates long tasks", () => {
    const diagnostics = new RendererPerfDiagnostics({ now: () => 0 });
    diagnostics.recordEventTiming(1_000, 1_040, 12);
    diagnostics.recordLongTask(2_000, 90);
    const snapshot = diagnostics.snapshot();
    expect(snapshot.recentEventTimings).toEqual([
      { startMs: 1_000, inputDelayMs: 40, processingMs: 12 },
    ]);
    expect(snapshot.phases.session?.eventTimings).toEqual({ count: 1, maxInputDelayMs: 40 });
    expect(snapshot.phases.session?.longTasks).toEqual({ count: 1, maxDurationMs: 90 });
    expect(snapshot.recentLongTasks).toEqual([{ startMs: 2_000, durationMs: 90 }]);
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

  it("retains nothing for spans recorded after dispose", () => {
    let nowMs = 0;
    const diagnostics = new RendererPerfDiagnostics({ now: () => nowMs });
    const span = diagnostics.beginSpan("x");
    diagnostics.dispose();
    nowMs = 10;
    span.end();
    diagnostics.recordSpan("x", 0, 1);
    expect(diagnostics.snapshot().recentSpans).toEqual([]);
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
    expect(snapshot?.formatVersion).toBe(1);
    expect(snapshot?.phase).toBe("C-bulk");
    expect(typeof snapshot?.timeOriginEpochMs).toBe("number");
    controller?.dispose();
    expect(window.__poracodePerfDiagnostics).toBeUndefined();
    // The active instance is released, so a fresh start is possible.
    const second = startRendererPerfDiagnostics({ requested: true, now: () => 0, target: window });
    expect(second).toBeDefined();
    second?.dispose();
  });

  it("enables via the localStorage flag", () => {
    window.localStorage.setItem("poracode-perf-diag", "1");
    const controller = startRendererPerfDiagnostics({ now: () => 0, target: window });
    expect(controller).toBeDefined();
    controller?.dispose();
  });
});
