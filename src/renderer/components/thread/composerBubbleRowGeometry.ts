/** Breathing room between a centered scroll button and the nearest bubble. */
export const BUBBLE_ROW_GAP_PX = 6;

/**
 * Whether the centered control must leave the bubble row and take its own row
 * above it. The control is centered on the row, so it collides once the
 * leftmost bubble reaches the control's right edge plus one row gap. Bubbles
 * that wrapped onto several lines start near the left edge and displace it too.
 */
export function shouldDisplaceCenteredControl(input: {
  rowLeft: number;
  rowWidth: number;
  /** Left edge of the leftmost bubble, or null when the row has no bubbles. */
  bubblesLeft: number | null;
  controlWidth: number;
  gap?: number;
}): boolean {
  if (input.bubblesLeft === null || input.rowWidth <= 0) return false;
  const gap = input.gap ?? BUBBLE_ROW_GAP_PX;
  const controlRight = input.rowLeft + input.rowWidth / 2 + input.controlWidth / 2;
  return input.bubblesLeft < controlRight + gap;
}
