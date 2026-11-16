import { describe, expect, it } from "vitest";
import {
  adaptEventTimingEntry,
  adaptLongAnimationFrameEntry,
  adaptLongTaskEntry,
  MAX_FRAME_SCRIPTS,
  sourceFileName,
} from "./performanceEntryAdapters";

describe("adaptEventTimingEntry", () => {
  it("adapts a standards-shaped entry and keeps its event identity", () => {
    expect(
      adaptEventTimingEntry({
        name: "click",
        startTime: 10,
        processingStart: 12,
        processingEnd: 20,
        duration: 24,
        interactionId: 7,
      }),
    ).toEqual({
      name: "click",
      interactionId: 7,
      startMs: 10,
      inputDelayMs: 2,
      processingMs: 8,
      interactionDurationMs: 24,
    });
  });

  it("rejects missing, non-finite and out-of-order endpoints", () => {
    expect(adaptEventTimingEntry({ startTime: 10, processingStart: 12 })).toBeNull();
    expect(adaptEventTimingEntry({})).toBeNull();
    expect(
      adaptEventTimingEntry({ startTime: Number.NaN, processingStart: 12, processingEnd: 20 }),
    ).toBeNull();
    expect(
      adaptEventTimingEntry({
        startTime: 10,
        processingStart: Number.POSITIVE_INFINITY,
        processingEnd: 20,
      }),
    ).toBeNull();
    expect(
      adaptEventTimingEntry({ startTime: 10, processingStart: 9, processingEnd: 20 }),
    ).toBeNull();
    expect(
      adaptEventTimingEntry({ startTime: 10, processingStart: 12, processingEnd: 11 }),
    ).toBeNull();
  });

  it("keeps unavailable duration and identity null instead of coercing them", () => {
    expect(
      adaptEventTimingEntry({ startTime: 10, processingStart: 12, processingEnd: 20 }),
    ).toEqual({
      name: null,
      interactionId: null,
      startMs: 10,
      inputDelayMs: 2,
      processingMs: 8,
      interactionDurationMs: null,
    });
    expect(
      adaptEventTimingEntry({
        name: 42,
        startTime: 10,
        processingStart: 12,
        processingEnd: 20,
        duration: Number.NaN,
        interactionId: Number.NaN,
      }),
    ).toMatchObject({ name: null, interactionId: null, interactionDurationMs: null });
    expect(
      adaptEventTimingEntry({
        startTime: 10,
        processingStart: 12,
        processingEnd: 20,
        duration: -8,
      }),
    ).toMatchObject({ interactionDurationMs: null });
  });

  it("keeps a zero duration and a zero interactionId as measured values", () => {
    expect(
      adaptEventTimingEntry({
        startTime: 2_000,
        processingStart: 2_004,
        processingEnd: 2_004,
        duration: 0,
        interactionId: 0,
      }),
    ).toEqual({
      name: null,
      interactionId: 0,
      startMs: 2_000,
      inputDelayMs: 4,
      processingMs: 0,
      interactionDurationMs: 0,
    });
  });
});

describe("adaptLongTaskEntry", () => {
  it("adapts a standards-shaped longtask entry", () => {
    expect(adaptLongTaskEntry({ startTime: 5_000, duration: 137 })).toEqual({
      startMs: 5_000,
      durationMs: 137,
    });
  });

  it("rejects non-finite and negative durations", () => {
    expect(adaptLongTaskEntry({ startTime: 5_000, duration: "bad" })).toBeNull();
    expect(adaptLongTaskEntry({ startTime: 5_000, duration: -1 })).toBeNull();
    expect(adaptLongTaskEntry({ startTime: Number.NaN, duration: 137 })).toBeNull();
    expect(adaptLongTaskEntry({ duration: 137 })).toBeNull();
  });
});

describe("adaptLongAnimationFrameEntry", () => {
  const script = (duration: number, overrides: Record<string, unknown> = {}) => ({
    invoker: "DOMWindow.onmessage",
    invokerType: "event-listener",
    sourceURL: "file:///Users/someone/Poracode.app/out/renderer/assets/index-3f2a.js?v=1#x",
    sourceFunctionName: "applyRuntimeEvents",
    sourceCharPosition: 4242,
    duration,
    forcedStyleAndLayoutDuration: 12,
    ...overrides,
  });

  it("keeps the longest attributed scripts and strips paths from URLs", () => {
    const record = adaptLongAnimationFrameEntry({
      startTime: 100,
      duration: 226,
      blockingDuration: 176,
      renderStart: 300,
      scripts: [
        script(5),
        script(150),
        { duration: "bad" },
        null,
        script(40, {
          invoker: "C:\\Users\\someone\\AppData\\Local\\Poracode\\resources\\vendor-91.js",
          invokerType: "classic-script",
        }),
        ...Array.from({ length: 6 }, (_, index) => script(1 + index)),
      ],
    });
    expect(record).toMatchObject({
      startMs: 100,
      durationMs: 226,
      blockingDurationMs: 176,
      renderMs: 26,
    });
    expect(record?.scripts).toHaveLength(MAX_FRAME_SCRIPTS);
    expect(record?.scripts.map((entry) => entry.durationMs)).toEqual([150, 40, 6, 5, 5]);
    expect(record?.scripts[0]).toEqual({
      invoker: "DOMWindow.onmessage",
      invokerType: "event-listener",
      sourceFile: "index-3f2a.js",
      sourceFunctionName: "applyRuntimeEvents",
      sourceCharPosition: 4242,
      durationMs: 150,
      forcedStyleAndLayoutMs: 12,
    });
    expect(record?.scripts[1]?.invoker).toBe("vendor-91.js");
    expect(JSON.stringify(record)).not.toContain("someone");
  });

  it("rejects malformed timing and tolerates missing attribution", () => {
    expect(adaptLongAnimationFrameEntry({ startTime: 1 })).toBeNull();
    expect(adaptLongAnimationFrameEntry({ startTime: 1, duration: -1 })).toBeNull();
    expect(adaptLongAnimationFrameEntry({ startTime: 1, duration: 60, renderStart: 0 })).toEqual({
      startMs: 1,
      durationMs: 60,
      blockingDurationMs: null,
      renderMs: null,
      scripts: [],
    });
  });

  it("reduces any URL or path to its file name", () => {
    expect(sourceFileName("https://host/a/b/chunk.js?x=1")).toBe("chunk.js");
    expect(sourceFileName("C:\\Users\\u\\app\\main.js")).toBe("main.js");
    expect(sourceFileName("")).toBeNull();
    expect(sourceFileName(42)).toBeNull();
  });
});
