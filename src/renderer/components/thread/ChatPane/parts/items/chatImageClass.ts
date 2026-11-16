/** Height cap for an inline chat image. Kept as a constant because the reserved
 * slot below has to compute the same box the loaded image will occupy. */
export const chatInlineImageMaxHeight = "min(18rem,40vh)";

// Keep the arbitrary Tailwind utility as a static literal. The renderer build's
// scanner does not evaluate template interpolation, so constructing this from
// `chatInlineImageMaxHeight` drops the max-height rule from the desktop CSS.
// LegendList still reserves the capped height, which then lets the uncapped
// image paint through every following virtual row.
export const chatInlineImageClass =
  "block max-h-[min(18rem,40vh)] w-auto max-w-full object-contain";

/**
 * Inline style that reserves an inline image's exact final box *before* it loads.
 *
 * `width`/`height` attributes are not enough on their own: with `width:auto` and
 * `height:auto` an unloaded image has no intrinsic size for the UA's
 * `aspect-ratio` to resolve against, so the element measures 0x0 and the
 * transcript reflows the moment the bytes land. That is invisible for an inline
 * `data:` image (it paints on the first frame) but very visible for one fetched
 * over the network — which is every image on a remote client now that they are
 * referenced rather than inlined.
 *
 * So give width a DEFINITE value — the smaller of the image's own width and the
 * width implied by the height cap — and let `aspect-ratio` derive the height.
 * `max-w-full` from the class still clamps it to a narrower container, and
 * because the width is definite the ratio then resolves the height correctly.
 *
 * Deliberately no `100%` term: the image card is a shrink-to-fit box
 * (`inline-flex` / `w-fit`), so a percentage width has no definite containing
 * block to resolve against and the whole `min()` collapses the element to 0x0
 * while it loads — measured in Chrome, and the exact reflow this is meant to
 * prevent.
 */
export function reserveInlineImageSlot(
  width: number | undefined,
  height: number | undefined,
): { readonly width: string; readonly aspectRatio: string; readonly height: "auto" } | undefined {
  if (!width || !height || width <= 0 || height <= 0) return undefined;
  return {
    width: `min(${width}px, calc(${chatInlineImageMaxHeight} * ${width} / ${height}))`,
    aspectRatio: `${width} / ${height}`,
    height: "auto",
  };
}

const MAX_CACHED_IMAGE_DIMENSIONS = 256;
const ASPECT_RATIO_TOLERANCE = 0.02;
const inlineImageDimensionsCache = new Map<
  string,
  { readonly width: number; readonly height: number }
>();

function isValidDimension(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function aspectRatiosMatch(firstRatio: number, secondRatio: number): boolean {
  return (
    Math.abs(firstRatio - secondRatio) / Math.max(firstRatio, secondRatio) <= ASPECT_RATIO_TOLERANCE
  );
}

export function resolveInlineImageDimensions(
  sourceWidth: number | undefined,
  sourceHeight: number | undefined,
  naturalWidth?: number | undefined,
  naturalHeight?: number | undefined,
): { readonly width: number; readonly height: number } | undefined {
  const hasSource = isValidDimension(sourceWidth) && isValidDimension(sourceHeight);
  const hasNatural = isValidDimension(naturalWidth) && isValidDimension(naturalHeight);
  if (!hasNatural) {
    return hasSource ? { width: sourceWidth, height: sourceHeight } : undefined;
  }
  if (!hasSource) {
    return { width: naturalWidth, height: naturalHeight };
  }
  const naturalRatio = naturalWidth / naturalHeight;
  if (aspectRatiosMatch(sourceWidth / sourceHeight, naturalRatio)) {
    return { width: sourceWidth, height: sourceHeight };
  }
  if (aspectRatiosMatch(sourceHeight / sourceWidth, naturalRatio)) {
    return { width: sourceHeight, height: sourceWidth };
  }
  return { width: naturalWidth, height: naturalHeight };
}

export function inlineImageDimensionCacheKey(source: {
  readonly src: string;
  readonly dimensionKey?: string;
  readonly remoteRef?: {
    readonly threadId: string;
    readonly itemId: string;
    readonly path: readonly (string | number)[];
  };
}): string | undefined {
  if (source.remoteRef) {
    const { threadId, itemId, path } = source.remoteRef;
    return `ref:${threadId}/${itemId}/${JSON.stringify(path)}`;
  }
  const key = source.dimensionKey ?? source.src;
  if (key.length === 0 || key.startsWith("data:")) return undefined;
  return `src:${key}`;
}

export function getCachedInlineImageDimensions(
  key: string,
): { readonly width: number; readonly height: number } | undefined {
  return inlineImageDimensionsCache.get(key);
}

export function rememberInlineImageDimensions(key: string, width: number, height: number): void {
  if (!isValidDimension(width) || !isValidDimension(height)) return;
  const existing = inlineImageDimensionsCache.get(key);
  if (existing?.width === width && existing.height === height) return;
  inlineImageDimensionsCache.delete(key);
  inlineImageDimensionsCache.set(key, { width, height });
  if (inlineImageDimensionsCache.size > MAX_CACHED_IMAGE_DIMENSIONS) {
    const oldest = inlineImageDimensionsCache.keys().next();
    if (!oldest.done) inlineImageDimensionsCache.delete(oldest.value);
  }
}

export function clearInlineImageDimensionsCache(): void {
  inlineImageDimensionsCache.clear();
}
