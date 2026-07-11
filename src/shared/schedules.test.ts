import { describe, expect, it } from "vitest";
import { nextScheduleRunAt } from "./schedules";

describe("nextScheduleRunAt", () => {
  it("finds the next hourly boundary at the selected minute", () => {
    const now = new Date(2026, 6, 10, 8, 15, 0, 0);
    expect(nextScheduleRunAt({ kind: "hourly", minute: 15 }, now.getTime())).toBe(
      new Date(2026, 6, 10, 9, 15, 0, 0).toISOString(),
    );
    expect(nextScheduleRunAt({ kind: "hourly", minute: 30 }, now.getTime())).toBe(
      new Date(2026, 6, 10, 8, 30, 0, 0).toISOString(),
    );
  });

  it("finds the next selected local weekday and skips the current instant", () => {
    const monday = new Date(2026, 6, 6, 8, 0, 0, 0);
    const next = nextScheduleRunAt(
      { kind: "weekly", days: [1, 3], time: "08:00" },
      monday.getTime(),
    );
    expect(next).toBe(new Date(2026, 6, 8, 8, 0, 0, 0).toISOString());
  });

  it("returns a future one-time run and drops a missed one", () => {
    const now = Date.parse("2026-07-10T12:00:00.000Z");
    expect(nextScheduleRunAt({ kind: "once", runAt: "2026-07-10T13:00:00.000Z" }, now)).toBe(
      "2026-07-10T13:00:00.000Z",
    );
    expect(nextScheduleRunAt({ kind: "once", runAt: "2026-07-10T11:00:00.000Z" }, now)).toBeNull();
  });
});
