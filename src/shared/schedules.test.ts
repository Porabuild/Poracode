import { describe, expect, it } from "vitest";
import { scheduleRecurrenceSchema, type ScheduleRecurrence } from "./contracts";
import { advanceScheduleRunAt, nextScheduleRunAt } from "./schedules";

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

  it("advances interval schedules by their elapsed duration", () => {
    const now = Date.parse("2026-07-10T12:00:00.000Z");
    expect(nextScheduleRunAt({ kind: "interval", every: 15, unit: "minutes" }, now)).toBe(
      "2026-07-10T12:15:00.000Z",
    );
    expect(nextScheduleRunAt({ kind: "interval", every: 2, unit: "days" }, now)).toBe(
      "2026-07-12T12:00:00.000Z",
    );
  });

  it("advances interval schedules from their stored cadence without drift", () => {
    const recurrence: ScheduleRecurrence = { kind: "interval", every: 30, unit: "minutes" };
    expect(
      advanceScheduleRunAt(
        recurrence,
        Date.parse("2026-07-10T12:30:00.000Z"),
        Date.parse("2026-07-10T12:47:00.000Z"),
      ),
    ).toBe("2026-07-10T13:00:00.000Z");
    expect(
      advanceScheduleRunAt(
        recurrence,
        Date.parse("2026-07-10T12:30:00.000Z"),
        Date.parse("2026-07-10T13:05:00.000Z"),
      ),
    ).toBe("2026-07-10T13:30:00.000Z");
  });

  it("keeps a zoned weekly wall time stable across daylight saving time", () => {
    const recurrence: ScheduleRecurrence = {
      kind: "weekly",
      days: [1],
      time: "09:00",
      timeZone: "America/New_York",
    };
    expect(nextScheduleRunAt(recurrence, Date.parse("2026-01-04T00:00:00.000Z"))).toBe(
      "2026-01-05T14:00:00.000Z",
    );
    expect(nextScheduleRunAt(recurrence, Date.parse("2026-07-05T00:00:00.000Z"))).toBe(
      "2026-07-06T13:00:00.000Z",
    );
  });

  it("finds the next five-field cron occurrence in its configured time zone", () => {
    const recurrence: ScheduleRecurrence = {
      kind: "cron",
      expression: "0 9 * * 1-5",
      timeZone: "Europe/London",
    };
    expect(nextScheduleRunAt(recurrence, Date.parse("2026-07-10T07:59:00.000Z"))).toBe(
      "2026-07-10T08:00:00.000Z",
    );
    expect(nextScheduleRunAt(recurrence, Date.parse("2026-07-10T08:00:00.000Z"))).toBe(
      "2026-07-13T08:00:00.000Z",
    );
  });

  it("skips nonexistent DST wall times and uses the first repeated occurrence", () => {
    const spring: ScheduleRecurrence = {
      kind: "weekly",
      days: [0],
      time: "02:30",
      timeZone: "America/New_York",
    };
    expect(nextScheduleRunAt(spring, Date.parse("2026-03-07T12:00:00.000Z"))).toBe(
      "2026-03-15T06:30:00.000Z",
    );

    const fall: ScheduleRecurrence = {
      kind: "weekly",
      days: [0],
      time: "01:30",
      timeZone: "America/New_York",
    };
    expect(nextScheduleRunAt(fall, Date.parse("2026-10-31T12:00:00.000Z"))).toBe(
      "2026-11-01T05:30:00.000Z",
    );
    expect(nextScheduleRunAt(fall, Date.parse("2026-11-01T06:00:00.000Z"))).toBe(
      "2026-11-08T06:30:00.000Z",
    );
  });

  it("skips every shifted minute in a nonexistent DST hour", () => {
    expect(
      nextScheduleRunAt(
        { kind: "cron", expression: "* 2 * * *", timeZone: "America/New_York" },
        Date.parse("2026-03-07T12:00:00.000Z"),
      ),
    ).toBe("2026-03-09T06:00:00.000Z");
  });

  it("rejects non-numeric cron extensions before schedule evaluation", () => {
    expect(() =>
      nextScheduleRunAt(
        { kind: "cron", expression: "30 2 * 3 0#2", timeZone: "America/New_York" },
        Date.parse("2026-01-01T00:00:00.000Z"),
      ),
    ).toThrow(/five numeric fields/u);
    expect(
      scheduleRecurrenceSchema.safeParse({
        kind: "cron",
        expression: "0 9 * 2 1#5",
        timeZone: "UTC",
      }).success,
    ).toBe(false);
  });

  it("finds sparse numeric cron occurrences across a leap-year gap", () => {
    expect(
      nextScheduleRunAt(
        { kind: "cron", expression: "0 9 29 2 *", timeZone: "UTC" },
        Date.parse("2096-03-01T00:00:00.000Z"),
      ),
    ).toBe("2104-02-29T09:00:00.000Z");
  });

  it("rejects invalid cron expressions, intervals, and IANA time zones", () => {
    expect(
      scheduleRecurrenceSchema.safeParse({
        kind: "cron",
        expression: "0 9 * *",
        timeZone: "UTC",
      }).success,
    ).toBe(false);
    expect(
      scheduleRecurrenceSchema.safeParse({
        kind: "cron",
        expression: "61 * * * *",
        timeZone: "UTC",
      }).success,
    ).toBe(false);
    expect(
      scheduleRecurrenceSchema.safeParse({
        kind: "cron",
        expression: "0 9 * * 1-5",
        timeZone: "Mars/Olympus",
      }).success,
    ).toBe(false);
    expect(
      scheduleRecurrenceSchema.safeParse({
        kind: "weekly",
        days: [1],
        time: "09:00",
        timeZone: "Mars/Olympus",
      }).success,
    ).toBe(false);
    expect(
      scheduleRecurrenceSchema.safeParse({ kind: "interval", every: 0, unit: "minutes" }).success,
    ).toBe(false);
    expect(
      scheduleRecurrenceSchema.safeParse({ kind: "interval", every: 1000, unit: "days" }).success,
    ).toBe(false);
  });
});
