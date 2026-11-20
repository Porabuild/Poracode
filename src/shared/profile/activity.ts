import type { ProfileHeatmapIntensity } from "../contracts";

export function computeStreaks(
  activeDayIndices: Set<number>,
  todayIndex: number,
): { current: number; longest: number } {
  if (activeDayIndices.size === 0) return { current: 0, longest: 0 };
  const sorted = [...activeDayIndices].sort((a, b) => a - b);
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i] === sorted[i - 1]! + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  let anchor = activeDayIndices.has(todayIndex)
    ? todayIndex
    : activeDayIndices.has(todayIndex - 1)
      ? todayIndex - 1
      : null;
  let current = 0;
  while (anchor !== null && activeDayIndices.has(anchor)) {
    current++;
    anchor--;
  }
  return { current, longest };
}

export function intensityFor(count: number, max: number): ProfileHeatmapIntensity {
  if (count <= 0 || max <= 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}
