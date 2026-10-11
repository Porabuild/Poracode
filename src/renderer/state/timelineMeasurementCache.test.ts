import { beforeEach, describe, expect, it } from "vitest";
import {
  clearTimelineMeasurementCache,
  forgetTimelineMeasurements,
  MAX_TIMELINE_SNAPSHOT_ROWS,
  readTimelineMeasurements,
  writeTimelineMeasurements,
} from "./timelineMeasurementCache";

const measurement = {
  key: "item-1",
  index: 0,
  size: 100,
};

describe("timelineMeasurementCache", () => {
  beforeEach(() => clearTimelineMeasurementCache());

  it("rejects measurements captured for a different layout signature", () => {
    writeTimelineMeasurements("thread-1", "500:14px", [measurement]);

    expect(readTimelineMeasurements("thread-1", "600:14px")).toEqual([]);
    expect(readTimelineMeasurements("thread-1", "500:14px")).toEqual([measurement]);
  });

  it("evicts the least recently used thread after sixteen entries", () => {
    for (let index = 0; index < 16; index += 1) {
      writeTimelineMeasurements(`thread-${index}`, "500:14px", [measurement]);
    }
    readTimelineMeasurements("thread-0", "500:14px");
    writeTimelineMeasurements("thread-16", "500:14px", [measurement]);

    expect(readTimelineMeasurements("thread-0", "500:14px")).toEqual([measurement]);
    expect(readTimelineMeasurements("thread-1", "500:14px")).toEqual([]);
    expect(readTimelineMeasurements("thread-16", "500:14px")).toEqual([measurement]);
  });

  it("retires old IDs when a fresh snapshot has no restorable measurements", () => {
    writeTimelineMeasurements("t", "500:14px", [measurement]);
    writeTimelineMeasurements("t", "500:14px", []);
    expect(readTimelineMeasurements("t", "500:14px")).toEqual([]);
  });

  it("rejects an oversized replacement instead of keeping the old snapshot", () => {
    writeTimelineMeasurements("t", "500:14px", [measurement]);
    const oversized = Array.from({ length: MAX_TIMELINE_SNAPSHOT_ROWS + 1 }, (_, index) => ({
      key: `row-${index}`,
      index,
      size: 100,
    }));
    writeTimelineMeasurements("t", "500:14px", oversized);
    expect(readTimelineMeasurements("t", "500:14px")).toEqual([]);
    writeTimelineMeasurements("t", "500:14px", [{ ...measurement, key: "new" }]);
    expect(readTimelineMeasurements("t", "500:14px")).toEqual([{ ...measurement, key: "new" }]);
  });

  it("bounds aggregate rows and honors read recency when each thread snapshot fits", () => {
    const rows = Array.from({ length: MAX_TIMELINE_SNAPSHOT_ROWS }, (_, index) => ({
      key: `row-${index}`,
      index,
      size: 100,
    }));
    for (let index = 0; index < 4; index++)
      writeTimelineMeasurements(`t${index}`, "500:14px", rows);
    readTimelineMeasurements("t0", "500:14px");
    writeTimelineMeasurements("t4", "500:14px", rows);
    expect(readTimelineMeasurements("t1", "500:14px")).toEqual([]);
    expect(readTimelineMeasurements("t0", "500:14px")).toHaveLength(MAX_TIMELINE_SNAPSHOT_ROWS);
    expect(readTimelineMeasurements("t4", "500:14px")).toHaveLength(MAX_TIMELINE_SNAPSHOT_ROWS);
  });

  it("bounds aggregate key storage before reaching the aggregate row limit", () => {
    const rows = Array.from({ length: MAX_TIMELINE_SNAPSHOT_ROWS }, (_, index) => ({
      key: `${index}:${"x".repeat(256)}`,
      index,
      size: 100,
    }));
    writeTimelineMeasurements("first", "500:14px", rows);
    writeTimelineMeasurements("second", "500:14px", rows);
    expect(readTimelineMeasurements("first", "500:14px")).toEqual([]);
    expect(readTimelineMeasurements("second", "500:14px")).toHaveLength(MAX_TIMELINE_SNAPSHOT_ROWS);
    writeTimelineMeasurements("huge", "500:14px", [{ ...measurement, key: "x".repeat(524_300) }]);
    expect(readTimelineMeasurements("huge", "500:14px")).toEqual([]);
    expect(readTimelineMeasurements("second", "500:14px")).toHaveLength(MAX_TIMELINE_SNAPSHOT_ROWS);
  });

  it("owns immutable snapshots and releases accounting on replacement and reset", () => {
    const input = [{ ...measurement }];
    writeTimelineMeasurements("t", "500:14px", input);
    input[0]!.key = "changed";
    input.push({ ...measurement });
    const saved = readTimelineMeasurements("t", "500:14px");
    expect(saved).toEqual([measurement]);
    expect(Object.isFrozen(saved)).toBe(true);
    expect(Object.isFrozen(saved[0])).toBe(true);
    clearTimelineMeasurementCache();
    expect(readTimelineMeasurements("t", "500:14px")).toEqual([]);
    const rows = Array.from({ length: MAX_TIMELINE_SNAPSHOT_ROWS }, (_, index) => ({
      key: `row-${index}`,
      index,
      size: 100,
    }));
    for (let index = 0; index < 4; index++)
      writeTimelineMeasurements(`t${index}`, "500:14px", rows);
    writeTimelineMeasurements("t0", "500:14px", []);
    writeTimelineMeasurements("t4", "500:14px", rows);
    expect(readTimelineMeasurements("t1", "500:14px")).toHaveLength(MAX_TIMELINE_SNAPSHOT_ROWS);
    expect(readTimelineMeasurements("t4", "500:14px")).toHaveLength(MAX_TIMELINE_SNAPSHOT_ROWS);
  });

  it("releases forgotten row accounting once and keeps surviving snapshots", () => {
    const rows = Array.from({ length: MAX_TIMELINE_SNAPSHOT_ROWS }, (_, index) => ({
      key: `row-${index}`,
      index,
      size: 100,
    }));
    for (let index = 0; index < 4; index++)
      writeTimelineMeasurements(`t${index}`, "500:14px", rows);
    forgetTimelineMeasurements("t1");
    forgetTimelineMeasurements("t1");
    forgetTimelineMeasurements("missing");
    writeTimelineMeasurements("t4", "500:14px", rows);
    writeTimelineMeasurements("t5", "500:14px", rows);

    expect(readTimelineMeasurements("t1", "500:14px")).toEqual([]);
    expect(readTimelineMeasurements("t0", "500:14px")).toEqual([]);
    for (const id of ["t2", "t3", "t4", "t5"])
      expect(readTimelineMeasurements(id, "500:14px")).toHaveLength(MAX_TIMELINE_SNAPSHOT_ROWS);
  });

  it("releases forgotten key storage before admitting another large snapshot", () => {
    const large = [{ ...measurement, key: "x".repeat(300_000) }];
    writeTimelineMeasurements("removed", "500:14px", large);
    writeTimelineMeasurements("survivor", "500:14px", [measurement]);
    forgetTimelineMeasurements("removed");
    writeTimelineMeasurements("next", "500:14px", large);

    expect(readTimelineMeasurements("removed", "500:14px")).toEqual([]);
    expect(readTimelineMeasurements("survivor", "500:14px")).toEqual([measurement]);
    expect(readTimelineMeasurements("next", "500:14px")).toEqual(large);
  });
});
