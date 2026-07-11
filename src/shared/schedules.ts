import type { ScheduleRecurrence } from "./contracts";

export function nextScheduleRunAt(recurrence: ScheduleRecurrence, afterMs: number): string | null {
  if (recurrence.kind === "once") {
    const runAt = Date.parse(recurrence.runAt);
    return runAt > afterMs ? new Date(runAt).toISOString() : null;
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
