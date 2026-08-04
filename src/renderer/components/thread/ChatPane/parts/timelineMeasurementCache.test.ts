import { beforeEach, describe, expect, it } from "vitest";
import {
  clearTimelineMeasurementCache,
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
});
