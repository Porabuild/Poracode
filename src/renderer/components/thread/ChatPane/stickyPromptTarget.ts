export interface RenderedRowBounds {
  /** Timeline index of the row (`data-index` on the virtual row). */
  index: number;
  top: number;
  bottom: number;
}

/**
 * Lowest timeline index among rendered rows that overlap the viewport. The
 * virtualizer keeps rows mounted outside the viewport too, so rows entirely
 * above or below it are skipped. Null when no row overlaps.
 */
export function findFirstVisibleRowIndex(
  rows: Iterable<RenderedRowBounds>,
  viewportTop: number,
  viewportBottom: number,
): number | null {
  let first: number | null = null;
  for (const row of rows) {
    if (row.bottom <= viewportTop || row.top >= viewportBottom) continue;
    if (first === null || row.index < first) first = row.index;
  }
  return first;
}

/**
 * Index of the prompt that the content at the top of the viewport answers:
 * the nearest prompt at or above the first visible row. Null when that prompt
 * is itself the first visible row (it is on screen) or no prompt precedes it.
 */
export function findStickyPromptIndex(
  firstVisibleIndex: number,
  isPromptAt: (index: number) => boolean,
): number | null {
  for (let index = firstVisibleIndex; index >= 0; index -= 1) {
    if (!isPromptAt(index)) continue;
    return index === firstVisibleIndex ? null : index;
  }
  return null;
}
