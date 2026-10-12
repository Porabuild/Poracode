import { beforeEach, describe, expect, it, vi } from "vitest";
import * as stateCache from "@/renderer/state/timelineMeasurementCache";
import { CHAT_FONT_SIZE_VAR } from "../chatFontVars";
import {
  clearTimelineMeasurementCache,
  forgetTimelineMeasurements,
  getTimelineMeasurementSignature,
  readTimelineMeasurements,
  writeTimelineMeasurements,
} from "./timelineMeasurementCache";

describe("timeline measurement layout signature and compatibility exports", () => {
  beforeEach(() => clearTimelineMeasurementCache());

  it("keeps width and font signatures with the existing maximum content width", () => {
    const element = document.createElement("div");
    element.style.setProperty(CHAT_FONT_SIZE_VAR, "14px");
    let width = 500;
    Object.defineProperty(element, "clientWidth", { get: () => width });
    document.body.appendChild(element);
    try {
      expect(getTimelineMeasurementSignature(element)).toBe("500:14px");
      width = 1200;
      expect(getTimelineMeasurementSignature(element)).toBe("920:14px");
      element.style.setProperty(CHAT_FONT_SIZE_VAR, "18px");
      expect(getTimelineMeasurementSignature(element)).toBe("920:18px");
    } finally {
      element.remove();
    }
  });

  it("skips computed geometry for a missing or unusable viewport", () => {
    const computedStyle = vi.spyOn(window, "getComputedStyle");
    try {
      expect(getTimelineMeasurementSignature(null)).toBeNull();
      expect(getTimelineMeasurementSignature(document.createElement("div"))).toBeNull();
      expect(computedStyle).not.toHaveBeenCalled();
    } finally {
      computedStyle.mockRestore();
    }
  });

  it("shares the same state-owned cache with existing component imports", () => {
    const measurement = { key: "row", index: 0, size: 184 };
    writeTimelineMeasurements("t", "500:14px", [measurement]);
    expect(stateCache.readTimelineMeasurements("t", "500:14px")).toEqual([measurement]);
    stateCache.forgetTimelineMeasurements("t");
    expect(readTimelineMeasurements("t", "500:14px")).toEqual([]);
    expect(forgetTimelineMeasurements).toBe(stateCache.forgetTimelineMeasurements);
    expect(clearTimelineMeasurementCache).toBe(stateCache.clearTimelineMeasurementCache);
  });
});
