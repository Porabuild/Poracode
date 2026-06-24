/**
 * Pure presentation helpers. Safe to import from a browser renderer — they have
 * no host dependency and take `now` as an argument rather than reading a clock.
 */

import type { UsageWindow } from "./types";

export type UsageTone = "normal" | "warning" | "danger" | "unknown";

/** Map a utilization percentage to a status tone for ring/bar coloring. */
export function usageTone(usedPercent: number | undefined): UsageTone {
  if (usedPercent === undefined || !Number.isFinite(usedPercent)) return "unknown";
  if (usedPercent >= 90) return "danger";
  if (usedPercent >= 70) return "warning";
  return "normal";
}

/**
 * Human countdown to a reset timestamp, e.g. "3d 5h", "2h 14m", "8m", "now".
 * Returns undefined when there is no reset time to show.
 */
export function formatResetCountdown(
  resetsAtMs: number | undefined,
  nowMs: number,
): string | undefined {
  if (resetsAtMs === undefined || !Number.isFinite(resetsAtMs)) return undefined;
  const deltaMs = resetsAtMs - nowMs;
  if (deltaMs <= 0) return "now";
  const totalMinutes = Math.floor(deltaMs / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Canonical labels for the known, cross-provider window ids. The window-id
 * vocabulary is owned by this package (see `types.ts`), so its display labels
 * belong here too rather than in any one renderer. Dynamic, provider-namespaced
 * ids (`gemini:`/`codex:`/`antigravity:`) carry a final label from their own
 * collector and fall through to `window.label`.
 */
const KNOWN_WINDOW_LABELS: Record<string, string> = {
  "session-5h": "Session (5h)",
  weekly: "Weekly",
  "weekly-opus": "Weekly · Opus",
  "weekly-sonnet": "Weekly · Sonnet",
  monthly: "Monthly",
  "extra-usage": "Extra usage",
  "cursor-auto": "Auto + Composer",
  "cursor-api": "API",
};

/** The label to show for a usage window, provider-agnostic. */
export function usageWindowDisplayLabel(window: UsageWindow): string {
  // Dollar-denominated overage, request-metered, and custom monthly windows keep
  // the collector's own label instead of the generic known-id one.
  if (window.unit === "usd" && window.limit !== undefined) return window.label;
  if (window.id === "monthly" && window.unit === "requests") return window.label;
  if (window.id === "monthly" && window.label !== "Monthly") return window.label;
  return KNOWN_WINDOW_LABELS[window.id] ?? window.label;
}

/**
 * Providers report utilization either as a 0-1 fraction (Claude) or a 0-100
 * percentage (Codex `used_percent`). Normalize to 0-100.
 *
 * Ambiguity: a raw value of exactly `1` is treated as 100% (the common
 * "fully consumed" case for fraction-based APIs), not 1%. Collectors that know
 * their API is percentage-based should pass values already in 0-100 — any
 * value > 1 is passed through unchanged.
 */
export function normalizePercent(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined;
  const pct = value <= 1 ? value * 100 : value;
  return Math.min(100, Math.max(0, Math.round(pct * 10) / 10));
}

/**
 * Parse an HTTP `Retry-After` header into the epoch-ms instant a caller may
 * retry. RFC 9110 allows two forms: `delta-seconds` (a non-negative integer
 * count of seconds from now) or an `HTTP-date` (an absolute instant). Returns
 * undefined for an absent, empty, or unparseable value so the caller can fall
 * back to its own default cooldown.
 */
export function parseRetryAfter(
  value: string | null | undefined,
  nowMs: number,
): number | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  // delta-seconds: a bare non-negative integer.
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) ? nowMs + seconds * 1000 : undefined;
  }
  // HTTP-date: an absolute instant.
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : undefined;
}

/** Parse an ISO-8601 timestamp (or epoch seconds/ms, numeric or string) to epoch ms. */
export function toEpochMs(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  // Heuristic: sub-1e12 epoch values are seconds, larger ones are milliseconds.
  const fromEpoch = (n: number): number | undefined =>
    !Number.isFinite(n) || n < 0 ? undefined : n < 1e12 ? Math.round(n * 1000) : Math.round(n);
  if (typeof value === "number") return fromEpoch(value);
  // An all-digit string is an epoch value, not an ISO date — `Date.parse` returns
  // NaN for it, so apply the same seconds/ms heuristic as numbers (some providers,
  // e.g. Factory's `windowEnd`, send the epoch as a string).
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return fromEpoch(Number(trimmed));
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Below this fraction of the window elapsed, a rate projection is dominated by
 * noise (a single early burst extrapolates to absurd end-of-period numbers), so
 * we decline to project rather than show an alarming figure. ~5% is 15 min into
 * a 5h session, ~8h into a week.
 */
const MIN_ELAPSED_FRACTION = 0.05;

/**
 * Below this usage level there's too little signal to project a meaningful rate,
 * and "≈0% by reset" is just noise on an effectively empty bar, so we decline.
 */
const MIN_USED_PERCENT = 1;

/**
 * Length of the quota window ending at `resetsAt`, derived from the window id.
 * Returns undefined for windows whose cadence we can't infer (e.g. Antigravity
 * pools, dollar-denominated overage), so callers skip pacing for them.
 *
 * Most ids carry a fixed cadence (5h session, 7d weekly). `monthly` and the
 * Cursor plan windows are calendar-month aligned, so their length is measured
 * back from the actual reset date (28-31 days) rather than assumed to be 30d.
 */
export function windowDurationMs(windowId: string, resetsAt: number): number | undefined {
  switch (windowId) {
    case "session-5h":
      return 5 * HOUR_MS;
    case "weekly":
    case "weekly-opus":
    case "weekly-sonnet":
      return 7 * DAY_MS;
    case "monthly":
    case "cursor-auto":
    case "cursor-api":
      return calendarMonthBeforeMs(resetsAt);
  }
  if (windowId.startsWith("gemini:")) return DAY_MS;
  // Factory's legacy per-cycle "premium" pool is calendar-month aligned, not a
  // rolling-cadence window.
  if (windowId === "factory:premium") return calendarMonthBeforeMs(resetsAt);
  // Namespaced rate-limit ids (codex:<limit>:<cadence>, factory:<pool>:<cadence>)
  // carry their cadence as the trailing `:`-segment. Antigravity pools name a
  // model family there (never a cadence word), so they fall through to undefined.
  switch (windowId.slice(windowId.lastIndexOf(":") + 1)) {
    case "session-5h":
      return 5 * HOUR_MS;
    case "weekly":
      return 7 * DAY_MS;
    case "monthly":
      return calendarMonthBeforeMs(resetsAt);
  }
  return undefined;
}

/** Milliseconds in the calendar month immediately preceding `resetsAt`. */
function calendarMonthBeforeMs(resetsAt: number): number {
  const start = new Date(resetsAt);
  start.setMonth(start.getMonth() - 1);
  return resetsAt - start.getTime();
}

/**
 * A forward projection of where a usage window lands by its reset, assuming the
 * current average burn rate holds. Powers the "will I run out early or coast to
 * reset?" indicator. All fields are derived purely from
 * (usedPercent, resetsAt, now) — see {@link projectWindowUsage}.
 */
export interface UsageProjection {
  /** Fraction of the window elapsed at `now`, in (0, 1). */
  elapsedFraction: number;
  /**
   * Usage at reset if the current average rate holds, in percent. Uncapped: a
   * value > 100 means the quota is projected to run out before reset.
   */
  projectedPercent: number;
  /**
   * usedPercent minus the on-pace-to-exactly-exhaust line (elapsedFraction*100),
   * in percentage points. Negative => under pace (headroom), positive => over
   * pace (burning fast). Matches codexbar's "Pace … (±N%)" figure.
   */
  paceDelta: number;
  /** True when the quota is projected to survive to reset (projectedPercent <= 100). */
  lastsToReset: boolean;
  /** Epoch ms the quota is projected to hit 100%, set only when that is before reset. */
  runsOutAt?: number;
}

/**
 * Project a window's end-of-period usage from its current burn rate. Returns
 * undefined when there's no reset time, the window's cadence is unknown, the
 * window is dollar-denominated, or too little of the window has elapsed for a
 * projection to be meaningful — callers should simply omit the pace indicator
 * in those cases.
 */
export function projectWindowUsage(
  window: Pick<UsageWindow, "id" | "usedPercent" | "resetsAt" | "unit">,
  now: number,
): UsageProjection | undefined {
  const { id, resetsAt, unit } = window;
  if (resetsAt === undefined || !Number.isFinite(resetsAt)) return undefined;
  // Dollar overage (e.g. Claude extra-usage) is a spend balance, not a time-rate
  // window, so a "by reset" projection doesn't apply.
  if (unit === "usd") return undefined;

  const duration = windowDurationMs(id, resetsAt);
  if (duration === undefined || duration <= 0) return undefined;

  const windowStart = resetsAt - duration;
  const elapsedMs = now - windowStart;
  const elapsedFraction = elapsedMs / duration;
  if (
    !Number.isFinite(elapsedFraction) ||
    elapsedFraction < MIN_ELAPSED_FRACTION ||
    elapsedFraction >= 1
  ) {
    return undefined;
  }

  const used = Math.max(0, Math.min(100, window.usedPercent));
  if (used < MIN_USED_PERCENT) return undefined;

  const projectedPercent = used / elapsedFraction;
  const paceDelta = used - elapsedFraction * 100;
  const lastsToReset = projectedPercent <= 100;

  const projection: UsageProjection = {
    elapsedFraction,
    projectedPercent,
    paceDelta,
    lastsToReset,
  };
  if (!lastsToReset) {
    // At burn rate (used / elapsedMs), 100% is reached msToFull after the window
    // start; surface that instant so the UI can say how early it runs out.
    const msToFull = (100 / used) * elapsedMs;
    projection.runsOutAt = windowStart + msToFull;
  }
  return projection;
}
