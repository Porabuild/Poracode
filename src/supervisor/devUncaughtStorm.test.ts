import { describe, expect, it } from "vitest";
import { createUncaughtStormDetector } from "./devUncaughtStorm";

describe("createUncaughtStormDetector", () => {
  const options = { limit: 3, windowMs: 10_000 };

  it("does not trip below the limit", () => {
    const detector = createUncaughtStormDetector(options);
    expect(detector.record(0)).toBe(false);
    expect(detector.record(1)).toBe(false);
  });

  it("trips when the limit occurs inside the window", () => {
    const detector = createUncaughtStormDetector(options);
    detector.record(0);
    detector.record(1);
    expect(detector.record(2)).toBe(true);
  });

  it("does not trip when occurrences are spread beyond the window", () => {
    const detector = createUncaughtStormDetector(options);
    detector.record(0);
    detector.record(20_000);
    expect(detector.record(40_000)).toBe(false);
  });

  it("slides: old occurrences fall out and a fresh burst trips it", () => {
    const detector = createUncaughtStormDetector(options);
    detector.record(0);
    detector.record(20_000);
    detector.record(40_000);
    expect(detector.record(40_100)).toBe(false);
    expect(detector.record(40_200)).toBe(true);
  });

  it("keeps reporting while the storm continues", () => {
    const detector = createUncaughtStormDetector(options);
    detector.record(0);
    detector.record(1);
    expect(detector.record(2)).toBe(true);
    expect(detector.record(3)).toBe(true);
  });
});
