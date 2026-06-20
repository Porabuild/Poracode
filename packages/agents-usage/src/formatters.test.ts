import { describe, expect, it } from "vitest";
import {
  formatResetCountdown,
  normalizePercent,
  projectWindowUsage,
  toEpochMs,
  usageTone,
  usageWindowDisplayLabel,
  windowDurationMs,
} from "./formatters";
import type { UsageWindow } from "./types";

describe("usageWindowDisplayLabel", () => {
  it("uses the canonical label for known window ids", () => {
    const monthly: UsageWindow = { id: "monthly", label: "Monthly", usedPercent: 0 };
    expect(usageWindowDisplayLabel(monthly)).toBe("Monthly");
    expect(usageWindowDisplayLabel({ id: "session-5h", label: "x", usedPercent: 0 })).toBe(
      "Session (5h)",
    );
  });

  it("honors a collector's custom monthly label (e.g. z.ai 'MCP')", () => {
    const mcp: UsageWindow = { id: "monthly", label: "MCP", usedPercent: 1.6 };
    expect(usageWindowDisplayLabel(mcp)).toBe("MCP");
  });
});

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

  it("parses all-digit STRING epochs with the seconds/ms heuristic (Date.parse would NaN)", () => {
    expect(toEpochMs("1700000000000")).toBe(1_700_000_000_000);
    expect(toEpochMs("1700000000")).toBe(1_700_000_000_000);
    expect(toEpochMs("  1700000000000  ")).toBe(1_700_000_000_000);
  });
});

const HOUR = 3_600_000;
const DAY = 86_400_000;

describe("windowDurationMs", () => {
  it("derives fixed cadences from the window id", () => {
    expect(windowDurationMs("session-5h", 0)).toBe(5 * HOUR);
    expect(windowDurationMs("weekly", 0)).toBe(7 * DAY);
    expect(windowDurationMs("weekly-opus", 0)).toBe(7 * DAY);
    expect(windowDurationMs("codex:gpt-5:session-5h", 0)).toBe(5 * HOUR);
    expect(windowDurationMs("codex:gpt-5:weekly", 0)).toBe(7 * DAY);
    expect(windowDurationMs("factory:core:weekly", 0)).toBe(7 * DAY);
    expect(windowDurationMs("gemini:gemini-2.5-pro", 0)).toBe(DAY);
  });

  it("measures monthly windows back from the actual reset date, not a fixed 30d", () => {
    // Feb is short, so a Mar 15 reset spans ~28d, never 30d. Allow a DST hour of
    // slack since the lookback is calendar-aligned in local time.
    const ms = windowDurationMs("monthly", Date.parse("2026-03-15T00:00:00Z"));
    expect(ms).toBeDefined();
    expect(ms).toBeGreaterThanOrEqual(27.5 * DAY);
    expect(ms).toBeLessThan(29 * DAY);

    const factoryPremiumMs = windowDurationMs(
      "factory:premium",
      Date.parse("2026-03-15T00:00:00Z"),
    );
    expect(factoryPremiumMs).toBeDefined();
    expect(factoryPremiumMs).toBeGreaterThanOrEqual(27.5 * DAY);
    expect(factoryPremiumMs).toBeLessThan(29 * DAY);
  });

  it("returns undefined for windows with no inferable cadence", () => {
    expect(windowDurationMs("antigravity:pro", 0)).toBeUndefined();
    expect(windowDurationMs("extra-usage", 0)).toBeUndefined();
  });
});

describe("projectWindowUsage", () => {
  const now = 1_700_000_000_000;

  it("projects a slow weekly burn as lasting to reset (codexbar parity)", () => {
    // 3% used with 3d20h left of a 7d window => ~45% elapsed, ~-42% pace.
    const resetsAt = now + 3 * DAY + 20 * HOUR;
    const p = projectWindowUsage({ id: "weekly", usedPercent: 3, resetsAt }, now);
    expect(p).toBeDefined();
    expect(p?.elapsedFraction).toBeCloseTo(0.452, 2);
    expect(p?.projectedPercent).toBeCloseTo(6.63, 1);
    expect(p?.paceDelta).toBeCloseTo(-42.2, 1);
    expect(p?.lastsToReset).toBe(true);
    expect(p?.runsOutAt).toBeUndefined();
  });

  it("flags an over-pace session and reports when it runs out before reset", () => {
    // Halfway through a 5h session at 80% used => projected 160%, out early.
    const resetsAt = now + 2.5 * HOUR;
    const p = projectWindowUsage({ id: "session-5h", usedPercent: 80, resetsAt }, now);
    expect(p).toBeDefined();
    expect(p?.elapsedFraction).toBeCloseTo(0.5, 5);
    expect(p?.projectedPercent).toBeCloseTo(160, 5);
    expect(p?.paceDelta).toBeCloseTo(30, 5);
    expect(p?.lastsToReset).toBe(false);
    // burn rate hits 100% 37.5 min from now, well before the 2.5h reset.
    expect(p?.runsOutAt).toBe(now + 2_250_000);
  });

  it("declines to project before enough of the window has elapsed", () => {
    // Only 10 min into a 5h session: too little signal.
    const resetsAt = now + (5 * HOUR - 10 * 60_000);
    expect(projectWindowUsage({ id: "session-5h", usedPercent: 4, resetsAt }, now)).toBeUndefined();
  });

  it("declines below 1% used (too little signal, would read as ≈0%)", () => {
    const resetsAt = now + 3 * DAY;
    expect(projectWindowUsage({ id: "weekly", usedPercent: 0.4, resetsAt }, now)).toBeUndefined();
  });

  it("skips windows without a reset, unknown cadence, or dollar units", () => {
    expect(projectWindowUsage({ id: "weekly", usedPercent: 50 }, now)).toBeUndefined();
    expect(
      projectWindowUsage({ id: "antigravity:pro", usedPercent: 50, resetsAt: now + DAY }, now),
    ).toBeUndefined();
    expect(
      projectWindowUsage(
        { id: "monthly", usedPercent: 50, resetsAt: now + 5 * DAY, unit: "usd" },
        now,
      ),
    ).toBeUndefined();
  });
});
