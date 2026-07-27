/**
 * Bounds for every auto-refresh cadence field — the global default and each
 * provider's override. The floor respects provider rate limits; 0 is accepted
 * only by the global field, where it means "manual only".
 */
export const MIN_REFRESH_MINUTES = 2;
export const MAX_REFRESH_MINUTES = 120;

/** Clamp a cadence to the shared bounds; `min` lets the global field allow 0. */
export function clampRefreshMinutes(minutes: number, min: number = MIN_REFRESH_MINUTES): number {
  return Math.min(MAX_REFRESH_MINUTES, Math.max(min, Math.floor(minutes)));
}
