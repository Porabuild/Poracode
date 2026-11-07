import { afterEach, describe, expect, it } from "vitest";
import {
  HandlerTimingObservations,
  recordHandlerTiming,
  sampleHandlerTimings,
  setHandlerTimingCaptureEnabled,
} from "./handlerTimingObservations";

describe("HandlerTimingObservations", () => {
  it("aggregates count/total/max per name, slowest first, and drains on sample", () => {
    const observations = new HandlerTimingObservations();
    observations.record("route:runtime-image", 5);
    observations.record("route:runtime-image", 12.5);
    observations.record("supervisor:getGitStatus", 300);
    expect(observations.sample()).toEqual([
      { name: "supervisor:getGitStatus", count: 1, totalMs: 300, maxMs: 300 },
      { name: "route:runtime-image", count: 2, totalMs: 17.5, maxMs: 12.5 },
    ]);
    expect(observations.sample()).toEqual([]);
  });

  it("buckets names outside the closed charset as other and ignores bad durations", () => {
    const observations = new HandlerTimingObservations();
    observations.record("route:/api/files/image?path=/secret", 10);
    observations.record("route:ok", -1);
    observations.record("route:ok", Number.NaN);
    observations.record("route:ok", 2);
    expect(observations.sample()).toEqual([
      { name: "other", count: 1, totalMs: 10, maxMs: 10 },
      { name: "route:ok", count: 1, totalMs: 2, maxMs: 2 },
    ]);
  });

  it("caps distinct names, folding overflow into other", () => {
    const observations = new HandlerTimingObservations();
    for (let index = 0; index < 200; index += 1) {
      observations.record(`route:r${index}`, 1);
    }
    const sample = observations.sample();
    expect(sample).toHaveLength(129);
    expect(sample.find((entry) => entry.name === "other")?.count).toBe(72);
  });
});

describe("shared handler timing capture gate", () => {
  afterEach(() => setHandlerTimingCaptureEnabled(false));

  it("records nothing while disabled and drains only while enabled", () => {
    recordHandlerTiming("route:runtime-image", 10);
    expect(sampleHandlerTimings()).toBeNull();
    setHandlerTimingCaptureEnabled(true);
    recordHandlerTiming("route:runtime-image", 10);
    expect(sampleHandlerTimings()).toEqual([
      { name: "route:runtime-image", count: 1, totalMs: 10, maxMs: 10 },
    ]);
    expect(sampleHandlerTimings()).toBeNull();
    setHandlerTimingCaptureEnabled(false);
    recordHandlerTiming("route:runtime-image", 10);
    setHandlerTimingCaptureEnabled(true);
    expect(sampleHandlerTimings()).toBeNull();
  });
});
