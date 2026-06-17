import type {
  ProfileHeatmap,
  ProfileHeatmapCell,
  ProfileHeatmapIntensity,
} from "@/shared/contracts";

/** 52 weeks - a full GitHub-style contribution grid. */
export const HEATMAP_WINDOW_DAYS = 364;
const DAY_MS = 86_400_000;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Index of the local calendar day containing `epochMs` (days since epoch). */
export function localDayIndex(epochMs: number, offsetMin: number): number {
  return Math.floor((epochMs + offsetMin * 60_000) / DAY_MS);
}

/** `YYYY-MM-DD` for a local day index (inverse of {@link localDayIndex}). */
export function dayKeyFromIndex(idx: number): string {
  const d = new Date(idx * DAY_MS);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function localHour(epochMs: number, offsetMin: number): number {
  return new Date(epochMs + offsetMin * 60_000).getUTCHours();
}

function intensityFor(count: number, max: number): ProfileHeatmapIntensity {
  if (count <= 0 || max <= 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

/**
 * Build a fixed 52-week heatmap ending today, with per-day intensity bucketed
 * (0-4) against the window max so the renderer stays presentation-only and a
 * future Cloud-merged blob renders identically.
 */
export function buildHeatmap(
  countsByDay: Map<string, number>,
  todayIndex: number,
  metric: ProfileHeatmap["metric"],
): { heatmap: ProfileHeatmap; activeDays: number } {
  const startIndex = todayIndex - (HEATMAP_WINDOW_DAYS - 1);
  let max = 0;
  let activeDays = 0;
  const raw: Array<{ day: string; count: number }> = [];
  for (let idx = startIndex; idx <= todayIndex; idx++) {
    const day = dayKeyFromIndex(idx);
    const count = countsByDay.get(day) ?? 0;
    if (count > max) max = count;
    if (count > 0) activeDays++;
    raw.push({ day, count });
  }
  const cells: ProfileHeatmapCell[] = raw.map((c) => ({
    day: c.day,
    count: c.count,
    intensity: intensityFor(c.count, max),
  }));
  return { heatmap: { metric, windowDays: HEATMAP_WINDOW_DAYS, cells, max }, activeDays };
}
