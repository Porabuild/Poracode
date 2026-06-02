/**
 * Pure presentation helpers. Safe to import from a browser renderer — they have
 * no host dependency and take `now` as an argument rather than reading a clock.
 */

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

/** Parse an ISO-8601 timestamp (or epoch seconds/ms) to epoch milliseconds. */
export function toEpochMs(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return undefined;
    // Heuristic: 10-digit values are epoch seconds, 13-digit are milliseconds.
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}
