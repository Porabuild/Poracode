/**
 * Keeps the viewport visually still while older transcript pages are prepended.
 *
 * The virtualizer's native `anchorTo: "end"` prepend handling re-derives the
 * scroll offset from item estimates in the same commit, but estimate→measure
 * corrections for freshly mounted rows can land frames later (images, markdown,
 * measurement caches). Mirroring the OpenCode v2 timeline, we capture the rows
 * intersecting the viewport (key + offset from the viewport top) before the
 * fetch, then after the prepend nudge `scrollTop` by the *measured* residual
 * delta each animation frame until the position has been stable for
 * `PREPEND_ANCHOR_STABLE_FRAMES` frames — an absolute correction that converges
 * regardless of how many relative adjustments fired in between.
 */
export interface PrependAnchor {
  /** `data-item-id` of the anchored virtual row (timeline entry id). */
  key: string;
  /** Pixel offset of the row's top from the scroller's viewport top. */
  offset: number;
}

/** Consecutive sub-epsilon frames required before the settle loop stops. */
export const PREPEND_ANCHOR_STABLE_FRAMES = 30;
/** Hard frame cap so the loop can never run unbounded. */
export const PREPEND_ANCHOR_MAX_FRAMES = 180;
export const PREPEND_ANCHOR_EPSILON_PX = 0.5;

const ROW_SELECTOR = "[data-chat-virtual-row]";

/**
 * Snapshot every virtual row currently intersecting the viewport, topmost
 * first. Capturing the full visible set (instead of a single row) keeps an
 * anchor available when the topmost entry's id does not survive the prepend —
 * tool-call groups at the page boundary can merge with prepended rows and
 * change their entry id.
 */
export function capturePrependAnchors(scrollEl: HTMLElement): PrependAnchor[] {
  const view = scrollEl.getBoundingClientRect();
  const anchors: Array<PrependAnchor & { top: number }> = [];
  for (const row of scrollEl.querySelectorAll<HTMLElement>(ROW_SELECTOR)) {
    const key = row.dataset.itemId;
    if (!key) continue;
    const rect = row.getBoundingClientRect();
    if (rect.bottom <= view.top || rect.top >= view.bottom) continue;
    anchors.push({ key, offset: rect.top - view.top, top: rect.top });
  }
  anchors.sort((a, b) => a.top - b.top);
  return anchors.map(({ key, offset }) => ({ key, offset }));
}

/**
 * How far the best surviving anchor row has drifted from its captured viewport
 * offset. Positive means the row moved down (scroll must move down with it).
 * Returns null when none of the captured anchors are rendered anymore.
 */
export function measurePrependAnchorDelta(
  scrollEl: HTMLElement,
  anchors: readonly PrependAnchor[],
): number | null {
  if (anchors.length === 0) return null;
  const viewTop = scrollEl.getBoundingClientRect().top;
  for (const anchor of anchors) {
    const row = scrollEl.querySelector<HTMLElement>(
      `${ROW_SELECTOR}[data-item-id="${CSS.escape(anchor.key)}"]`,
    );
    if (!row) continue;
    return row.getBoundingClientRect().top - viewTop - anchor.offset;
  }
  return null;
}
