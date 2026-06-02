import { describe, expect, it } from "vitest";
import { aggregateOpenCodeUsage } from "./openCode";

// Fri 2026-05-15 12:00 UTC. The UTC week starts Mon 2026-05-11.
const NOW = Date.UTC(2026, 4, 15, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

describe("aggregateOpenCodeUsage", () => {
  it("buckets costs into rolling 5h, weekly, and monthly dollar windows", () => {
    const rows = [
      { createdMs: NOW - 1 * HOUR, cost: 2 }, // session + week + month
      { createdMs: NOW - 10 * HOUR, cost: 3 }, // week + month
      { createdMs: Date.UTC(2026, 4, 12), cost: 1 }, // week + month
      { createdMs: Date.UTC(2026, 4, 2), cost: 5 }, // month only
      { createdMs: Date.UTC(2026, 2, 20), cost: 100 }, // outside all
    ];
    const [session, weekly, monthly] = aggregateOpenCodeUsage(rows, NOW);

    expect(session!.id).toBe("session-5h");
    expect(session!.used).toBe(2);
    expect(session!.limit).toBe(12);
    expect(session!.usedPercent).toBeCloseTo((2 / 12) * 100);
    expect(session!.resetsAt).toBeUndefined();

    expect(weekly!.used).toBe(6);
    expect(weekly!.usedPercent).toBeCloseTo((6 / 30) * 100);
    expect(weekly!.resetsAt).toBe(Date.UTC(2026, 4, 18));

    expect(monthly!.used).toBe(11);
    expect(monthly!.usedPercent).toBeCloseTo((11 / 60) * 100);
    expect(monthly!.resetsAt).toBe(Date.UTC(2026, 4, 20));

    for (const w of [session!, weekly!, monthly!]) {
      expect(w.unit).toBe("usd");
      expect(w.currency).toBe("USD");
    }
  });

  it("returns zeroed windows for no rows", () => {
    const windows = aggregateOpenCodeUsage([], NOW);
    expect(windows).toHaveLength(3);
    expect(windows.every((w) => w.used === 0 && w.usedPercent === 0)).toBe(true);
  });

  it("anchors monthly usage to the earliest local Go usage timestamp", () => {
    const windows = aggregateOpenCodeUsage(
      [
        { createdMs: Date.UTC(2026, 1, 25, 7, 53, 16), cost: 1 },
        { createdMs: Date.UTC(2026, 2, 1), cost: 100 },
        { createdMs: Date.UTC(2026, 2, 25, 7, 53, 16), cost: 2 },
        { createdMs: Date.UTC(2026, 2, 26), cost: 3 },
      ],
      Date.UTC(2026, 2, 28),
    );

    const monthly = windows.find((w) => w.id === "monthly");
    expect(monthly?.used).toBe(5);
    expect(monthly?.resetsAt).toBe(Date.UTC(2026, 3, 25, 7, 53, 16));
  });
});
