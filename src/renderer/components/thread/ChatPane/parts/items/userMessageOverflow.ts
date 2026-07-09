export const USER_MESSAGE_COLLAPSED_LINE_COUNT = 4;
export const USER_MESSAGE_FALLBACK_LINE_HEIGHT_RATIO = 1.375;
export const USER_MESSAGE_OVERFLOW_EPSILON_PX = 2;

/**
 * Whether the first overflow measurement should notify chat scroll controls.
 *
 * First-measure + still-overflowing keeps the provisional 4-line clamp height
 * (only the fade mask is added), so stick-to-bottom does not need to run.
 * Notify when overflow flips, or when the first measure lifts the clamp off a
 * short message.
 */
export function shouldNotifyUserMessageHeightChange(input: {
  wasFirstMeasure: boolean;
  overflowChanged: boolean;
  nextHasVisualOverflow: boolean;
}): boolean {
  return input.overflowChanged || (input.wasFirstMeasure && !input.nextHasVisualOverflow);
}

export function hasUserMessageVisualOverflow(input: {
  fullHeightPx: number;
  collapsedHeightPx: number;
  epsilonPx?: number;
}): boolean {
  const epsilon = input.epsilonPx ?? USER_MESSAGE_OVERFLOW_EPSILON_PX;
  return input.fullHeightPx - input.collapsedHeightPx > epsilon;
}

export function parseCssPx(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseCssLineHeight(value: string, fontSize: number): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fontSize * USER_MESSAGE_FALLBACK_LINE_HEIGHT_RATIO;
  if (value.trim().endsWith("px")) return parsed;
  if (parsed <= 4) return parsed * fontSize;
  return parsed;
}

export function collapsedHeightFromComputedStyle(input: {
  fontSize: string;
  lineHeight: string;
  lineCount?: number;
}): number {
  const fontSize = parseCssPx(input.fontSize) ?? 16;
  const lineHeight = parseCssLineHeight(input.lineHeight, fontSize);
  return lineHeight * (input.lineCount ?? USER_MESSAGE_COLLAPSED_LINE_COUNT);
}

/**
 * Cache collapsed-height lookups across user-message rows that share the same
 * chat typography. Thread switches measure many rows; getComputedStyle + parse
 * on each was a CDP hotspot.
 *
 * `getShared` keeps the resolved px after the first successful read so later
 * rows skip getComputedStyle entirely until `clear()` (e.g. chat font change).
 */
export function createCollapsedHeightCache() {
  let cached: { fontSize: string; lineHeight: string; px: number } | null = null;
  let sharedPx: number | null = null;
  return {
    get(style: { fontSize: string; lineHeight: string }): number {
      if (cached && cached.fontSize === style.fontSize && cached.lineHeight === style.lineHeight) {
        return cached.px;
      }
      const px = collapsedHeightFromComputedStyle(style);
      cached = { fontSize: style.fontSize, lineHeight: style.lineHeight, px };
      sharedPx = px;
      return px;
    },
    getShared(readStyle: () => { fontSize: string; lineHeight: string }): number {
      if (sharedPx !== null) return sharedPx;
      return this.get(readStyle());
    },
    clear() {
      cached = null;
      sharedPx = null;
    },
  };
}

export const userMessageCollapsedHeightCache = createCollapsedHeightCache();

export function clearUserMessageCollapsedHeightCache(): void {
  userMessageCollapsedHeightCache.clear();
}
