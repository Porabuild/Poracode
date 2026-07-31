/**
 * Circle diameter for both rails. Passed explicitly to `ProviderUsageCircle`
 * rather than relying on its default `size`, so the measured and the rendered
 * diameter are one value.
 */
export const RAIL_CIRCLE_SIZE = 28;
/**
 * Gaps between circles, applied inline (`style={{ gap }}`) instead of a Tailwind
 * class so no class edit can silently drift from the fit math.
 */
export const RAIL_ROW_GAP = 10;
export const RAIL_COLUMN_GAP = 6;
/**
 * Collapsed icon rail cap. The column is a single narrow strip competing with
 * the footer nav for vertical space, so it stops at four circles regardless of
 * how many providers are enabled.
 */
export const RAIL_COLUMN_MAX = 4;

/**
 * How many circles fit a row `width` px wide. Returns 0 for an unmeasured row,
 * which {@link fitUsageRail} reads as "no limit yet".
 *
 * Split from {@link fitUsageRail} so the rail can store this derived count
 * instead of the raw width: a resize drag then re-renders only when a circle
 * gains or loses its place, and the measuring effect stays independent of how
 * many providers there are.
 */
export function railSlots(width: number): number {
  if (width <= 0) return 0;
  return Math.floor((width + RAIL_ROW_GAP) / (RAIL_CIRCLE_SIZE + RAIL_ROW_GAP));
}

/**
 * How many circles to draw given `slots` of capacity. Everything, when it fits
 * — or when the row hasn't been measured yet, so the first paint is the full
 * rail rather than an empty strip. Otherwise one slot goes to the "+N" chip, so
 * every provider is either drawn or reachable through the chip.
 */
export function fitUsageRail(slots: number, total: number): number {
  if (slots <= 0 || slots >= total) return total;
  return slots - 1;
}
