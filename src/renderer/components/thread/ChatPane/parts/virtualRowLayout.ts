export interface VirtualRowLayoutState {
  positionAtIndex(index: number): number;
  sizeAtIndex(index: number): number;
}

const POSITION_EPSILON_PX = 0.5;

/**
 * Synchronize mounted rows below `row` to LegendList's authoritative layout.
 *
 * LegendList stores item sizes synchronously, but its React position wrappers
 * can commit on the next frame. A growing mid-list row would overlap those
 * wrappers for that frame. We may update their DOM `top` early, but must derive
 * every value from the virtualizer's index positions and sizes—never by adding
 * the observed height delta to whatever happens to be in the DOM.
 *
 * `MessageList` is a single-column list with no item gap. The current row's DOM
 * versus logical position supplies the shared render offset used while
 * LegendList is applying visible-content compensation.
 *
 * Returns the number of mounted row containers whose position changed.
 */
export function syncFollowingVirtualRowPositions(
  row: HTMLElement,
  layout: VirtualRowLayoutState,
): number {
  const currentIndex = readRowIndex(row);
  const container = row.parentElement;
  const parent = container?.parentElement;
  if (currentIndex === null || !container || !parent) return 0;

  const containerTop = Number.parseFloat(container.style.top);
  const logicalTop = layout.positionAtIndex(currentIndex);
  if (!Number.isFinite(containerTop) || !Number.isFinite(logicalTop)) return 0;

  const followingRows = Array.from(parent.children).flatMap((sibling) => {
    if (!(sibling instanceof HTMLElement) || sibling === container) return [];
    const siblingRow = sibling.querySelector<HTMLElement>("[data-chat-virtual-row='true']");
    const index = siblingRow ? readRowIndex(siblingRow) : null;
    return index !== null && index > currentIndex ? [{ container: sibling, index }] : [];
  });
  if (followingRows.length === 0) return 0;

  const expectedLogicalTops = new Map<number, number>();
  const maxFollowingIndex = Math.max(...followingRows.map(({ index }) => index));
  let nextLogicalTop = logicalTop;
  for (let index = currentIndex; index < maxFollowingIndex; index += 1) {
    const size = layout.sizeAtIndex(index);
    if (!Number.isFinite(size) || size < 0) return 0;
    nextLogicalTop += size;
    expectedLogicalTops.set(index + 1, nextLogicalTop);
  }

  const renderOffset = containerTop - logicalTop;
  let changed = 0;
  for (const following of followingRows) {
    const expectedLogicalTop = expectedLogicalTops.get(following.index);
    if (expectedLogicalTop === undefined) continue;
    const expectedTop = expectedLogicalTop + renderOffset;
    const currentTop = Number.parseFloat(following.container.style.top);
    if (Number.isFinite(currentTop) && Math.abs(currentTop - expectedTop) < POSITION_EPSILON_PX) {
      continue;
    }
    following.container.style.top = `${expectedTop}px`;
    changed += 1;
  }
  return changed;
}

function readRowIndex(row: HTMLElement): number | null {
  const index = Number(row.dataset.index);
  return Number.isInteger(index) && index >= 0 ? index : null;
}
