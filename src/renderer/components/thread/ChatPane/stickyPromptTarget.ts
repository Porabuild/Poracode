export interface RenderedRowBounds {
  /** Timeline index of the row (`data-index` on the virtual row). */
  index: number;
  top: number;
  bottom: number;
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

export interface VisibleRowRange {
  first: number;
  last: number;
}

/**
 * Lowest and highest timeline index among rendered rows that overlap the
 * viewport. Null when no row overlaps.
 */
export function findVisibleRowRange(
  rows: Iterable<RenderedRowBounds>,
  viewportTop: number,
  viewportBottom: number,
): VisibleRowRange | null {
  let range: VisibleRowRange | null = null;
  for (const row of rows) {
    if (row.bottom <= viewportTop || row.top >= viewportBottom) continue;
    range = range
      ? { first: Math.min(range.first, row.index), last: Math.max(range.last, row.index) }
      : { first: row.index, last: row.index };
  }
  return range;
}
