import { describe, expect, it } from "vitest";
import { formatResetCountdown, normalizePercent, toEpochMs, usageTone } from "./formatters";

describe("usageTone", () => {
  it("applies normal/warning/danger thresholds", () => {
    expect(usageTone(10)).toBe("normal");
    expect(usageTone(69.9)).toBe("normal");
    expect(usageTone(70)).toBe("warning");
    expect(usageTone(89)).toBe("warning");
    expect(usageTone(90)).toBe("danger");
    expect(usageTone(undefined)).toBe("unknown");
  });
});

describe("normalizePercent", () => {
  it("treats <=1 as a fraction and >1 as a percentage", () => {
    expect(normalizePercent(0.57)).toBe(57);
    expect(normalizePercent(1)).toBe(100);
    expect(normalizePercent(57)).toBe(57);
    expect(normalizePercent(150)).toBe(100);
    expect(normalizePercent(-1)).toBeUndefined();
    expect(normalizePercent(undefined)).toBeUndefined();
  });
});

describe("formatResetCountdown", () => {
  const now = 1_700_000_000_000;
  it("formats days, hours and minutes", () => {
    expect(formatResetCountdown(now + 2 * 86_400_000 + 3 * 3_600_000, now)).toBe("2d 3h");
    expect(formatResetCountdown(now + 2 * 3_600_000 + 14 * 60_000, now)).toBe("2h 14m");
    expect(formatResetCountdown(now + 8 * 60_000, now)).toBe("8m");
    expect(formatResetCountdown(now - 1000, now)).toBe("now");
    expect(formatResetCountdown(undefined, now)).toBeUndefined();
  });
});

describe("toEpochMs", () => {
  it("parses ISO strings, epoch seconds and epoch milliseconds", () => {
    expect(toEpochMs("2026-05-29T12:00:00Z")).toBe(Date.parse("2026-05-29T12:00:00Z"));
    expect(toEpochMs(1_700_000_000)).toBe(1_700_000_000_000);
    expect(toEpochMs(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(toEpochMs(null)).toBeUndefined();
    expect(toEpochMs(undefined)).toBeUndefined();
  });
});
