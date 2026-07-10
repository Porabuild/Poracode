import type { Rectangle } from "electron";

/**
 * Minimum pixels of a window that must overlap a display work area on each
 * axis for the window to count as reachable (draggable) by the user.
 */
export const MIN_VISIBLE_WINDOW_OVERLAP_PX = 50;

/** True when `rect` overlaps `workArea` by at least `minOverlap` px on both axes. */
export function rectOverlapsWorkArea(
  rect: Rectangle,
  workArea: Rectangle,
  minOverlap: number = MIN_VISIBLE_WINDOW_OVERLAP_PX,
): boolean {
  const overlapX = Math.max(
    0,
    Math.min(rect.x + rect.width, workArea.x + workArea.width) - Math.max(rect.x, workArea.x),
  );
  const overlapY = Math.max(
    0,
    Math.min(rect.y + rect.height, workArea.y + workArea.height) - Math.max(rect.y, workArea.y),
  );
  return overlapX >= minOverlap && overlapY >= minOverlap;
}
