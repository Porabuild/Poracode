import type { UsageWindow } from "./types";

/**
 * OpenCode (OpenCode Zen / `opencode-go`) has no usage API — spend is read from
 * the CLI's local SQLite store. This pure aggregator turns assistant-message
 * cost rows into rolling 5h / weekly / monthly dollar windows against the fixed
 * plan budgets openusage uses. The host reads the rows; this does the math so it
 * is unit-testable without a database.
 */

export interface OpenCodeCostRow {
  /** Epoch milliseconds the message was created. */
  createdMs: number;
  /** Message cost in USD (dollars, not cents). */
  cost: number;
}

/** Fixed plan budgets (USD) openusage assumes for opencode-go spend windows. */
export const OPENCODE_LIMITS = { session: 12, weekly: 30, monthly: 60 } as const;

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

function utcWeekStartMs(nowMs: number): number {
  const d = new Date(nowMs);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7; // 0 = Sun → 6
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday);
}

function utcMonthBoundsMs(nowMs: number): { start: number; end: number } {
  const d = new Date(nowMs);
  return {
    start: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1),
    end: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function sumSince(rows: readonly OpenCodeCostRow[], startMs: number, nowMs: number): number {
  let total = 0;
  for (const row of rows) {
    if (Number.isFinite(row.cost) && row.createdMs >= startMs && row.createdMs <= nowMs) {
      total += row.cost;
    }
  }
  return total;
}

function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const total = year * 12 + month + delta;
  return [Math.floor(total / 12), ((total % 12) + 12) % 12];
}

function anchorMonth(year: number, month: number, anchor: Date): number {
  const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(
    year,
    month,
    Math.min(anchor.getUTCDate(), maxDay),
    anchor.getUTCHours(),
    anchor.getUTCMinutes(),
    anchor.getUTCSeconds(),
    anchor.getUTCMilliseconds(),
  );
}

function anchoredMonthBoundsMs(
  rows: readonly OpenCodeCostRow[],
  nowMs: number,
): { start: number; end: number } {
  let earliestMs: number | undefined;
  for (const row of rows) {
    if (!Number.isFinite(row.createdMs)) continue;
    if (earliestMs === undefined || row.createdMs < earliestMs) earliestMs = row.createdMs;
  }
  if (earliestMs === undefined) return utcMonthBoundsMs(nowMs);

  const now = new Date(nowMs);
  const anchor = new Date(earliestMs);
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  let start = anchorMonth(year, month, anchor);
  if (start > nowMs) {
    [year, month] = shiftMonth(year, month, -1);
    start = anchorMonth(year, month, anchor);
  }
  const [nextYear, nextMonth] = shiftMonth(year, month, 1);
  return { start, end: anchorMonth(nextYear, nextMonth, anchor) };
}

function window(
  id: UsageWindow["id"],
  label: string,
  used: number,
  limit: number,
  resetsAt: number | undefined,
): UsageWindow {
  const usedPercent = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;
  return {
    id,
    label,
    usedPercent,
    unit: "usd",
    currency: "USD",
    used: round2(used),
    limit,
    ...(resetsAt !== undefined ? { resetsAt } : {}),
  };
}

/** Build the 5h / weekly / monthly dollar windows from cost rows. */
export function aggregateOpenCodeUsage(
  rows: readonly OpenCodeCostRow[],
  nowMs: number,
): UsageWindow[] {
  const weekStart = utcWeekStartMs(nowMs);
  const month = anchoredMonthBoundsMs(rows, nowMs);
  return [
    // Rolling 5h window — no fixed reset boundary, so no resetsAt.
    window(
      "session-5h",
      "5h limit",
      sumSince(rows, nowMs - FIVE_HOURS_MS, nowMs),
      OPENCODE_LIMITS.session,
      undefined,
    ),
    window(
      "weekly",
      "Weekly limit",
      sumSince(rows, weekStart, nowMs),
      OPENCODE_LIMITS.weekly,
      weekStart + 7 * 24 * 60 * 60 * 1000,
    ),
    window(
      "monthly",
      "Monthly limit",
      sumSince(rows, month.start, nowMs),
      OPENCODE_LIMITS.monthly,
      month.end,
    ),
  ];
}
