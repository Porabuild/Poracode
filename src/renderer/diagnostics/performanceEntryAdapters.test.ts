import { describe, expect, it } from "vitest";
import { adaptEventTimingEntry, adaptLongTaskEntry } from "./performanceEntryAdapters";

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
