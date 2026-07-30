import { CronExpressionParser } from "cron-parser";
import type { ScheduleRecurrence } from "./contracts";
import {
  isValidFiveFieldCronExpression,
  isValidScheduleTimeZone,
  normalizeCronExpression,
} from "./contracts/schedule";

const INTERVAL_UNIT_MS = {
  minutes: 60_000,
  hours: 60 * 60_000,
  days: 24 * 60 * 60_000,
} as const;
const MAX_CRON_SEARCH_YEARS = 10;
const MAX_CRON_CANDIDATES = 2_000;
function nextCronRunAt(expression: string, timeZone: string, afterMs: number): string {
  const normalized = normalizeCronExpression(expression);
  if (!isValidFiveFieldCronExpression(normalized)) {
    throw new Error("Cron expressions must contain five numeric fields.");
  }
  if (!isValidScheduleTimeZone(timeZone)) {
    throw new Error("Invalid IANA time zone.");
  }
  const endDate = new Date(afterMs);
  endDate.setUTCFullYear(endDate.getUTCFullYear() + MAX_CRON_SEARCH_YEARS);
  const interval = CronExpressionParser.parse(normalized, {
    currentDate: afterMs,
    endDate,
    hashSeed: normalized,
    tz: timeZone,
  });
  const zonedFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });
  // cron-parser advances a nonexistent spring-forward wall time into the next
  // real hour. Verify each candidate against every cron field so shifted or
  // otherwise invalid calendar occurrences are skipped.
  for (let attempt = 0; attempt < MAX_CRON_CANDIDATES; attempt += 1) {
    let candidate: Date;
    try {
      candidate = interval.next().toDate();
    } catch {
      break;
    }
    if (interval.includesDate(candidate) && !isRepeatedWallTime(candidate, zonedFormatter)) {
      return candidate.toISOString();
    }
  }
  throw new Error("No real cron occurrence exists within the supported search window.");
}

function isRepeatedWallTime(date: Date, formatter: Intl.DateTimeFormat): boolean {
  const current = zonedDateParts(date, formatter);
  const priorOffset = timeZoneOffsetMinutes(new Date(date.getTime() - 36 * 60 * 60_000), formatter);
  const offsetDifference = priorOffset - timeZoneOffsetMinutes(date, formatter);
  if (offsetDifference <= 0) return false;

  const earlier = zonedDateParts(new Date(date.getTime() - offsetDifference * 60_000), formatter);
  return (
    earlier.year === current.year &&
    earlier.month === current.month &&
    earlier.day === current.day &&
    earlier.hour === current.hour &&
    earlier.minute === current.minute
  );
}

function zonedDateParts(date: Date, formatter: Intl.DateTimeFormat): Record<string, number> {
  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
}

function timeZoneOffsetMinutes(date: Date, formatter: Intl.DateTimeFormat): number {
  const parts = zonedDateParts(date, formatter);
  return (
    (Date.UTC(
      parts.year!,
      parts.month! - 1,
      parts.day!,
      parts.hour!,
      parts.minute!,
      parts.second!,
    ) -
      date.getTime()) /
    60_000
  );
}

export function advanceScheduleRunAt(
  recurrence: ScheduleRecurrence,
  scheduledAtMs: number,
  afterMs: number,
): string | null {
  if (recurrence.kind !== "interval") {
    return nextScheduleRunAt(recurrence, afterMs);
  }

  const intervalMs = recurrence.every * INTERVAL_UNIT_MS[recurrence.unit];
  const elapsedIntervals = Math.floor((afterMs - scheduledAtMs) / intervalMs) + 1;
  return new Date(scheduledAtMs + Math.max(1, elapsedIntervals) * intervalMs).toISOString();
}

export function nextScheduleRunAt(recurrence: ScheduleRecurrence, afterMs: number): string | null {
  if (recurrence.kind === "once") {
    const runAt = Date.parse(recurrence.runAt);
    return runAt > afterMs ? new Date(runAt).toISOString() : null;
  }

  if (recurrence.kind === "interval") {
    return new Date(afterMs + recurrence.every * INTERVAL_UNIT_MS[recurrence.unit]).toISOString();
  }

  if (recurrence.kind === "cron") {
    return nextCronRunAt(recurrence.expression, recurrence.timeZone, afterMs);
  }

  if (recurrence.kind === "hourly") {
    const after = new Date(afterMs);
    const candidate = new Date(
      after.getFullYear(),
      after.getMonth(),
      after.getDate(),
      after.getHours(),
      recurrence.minute,
      0,
      0,
    );
    if (candidate.getTime() <= afterMs) {
      candidate.setHours(candidate.getHours() + 1);
    }
    return candidate.toISOString();
  }

  if (recurrence.timeZone) {
    const [hour, minute] = recurrence.time.split(":");
    return nextCronRunAt(
      `${minute} ${hour} * * ${recurrence.days.join(",")}`,
      recurrence.timeZone,
      afterMs,
    );
  }

  const [hourText, minuteText] = recurrence.time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const days = new Set(recurrence.days);
  const after = new Date(afterMs);

  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(
      after.getFullYear(),
      after.getMonth(),
      after.getDate() + offset,
      hour,
      minute,
      0,
      0,
    );
    if (days.has(candidate.getDay()) && candidate.getTime() > afterMs) {
      return candidate.toISOString();
    }
  }

  return null;
}
