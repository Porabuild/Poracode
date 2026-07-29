/** Height cap for an inline chat image. Kept as a constant because the reserved
 * slot below has to compute the same box the loaded image will occupy. */
export const chatInlineImageMaxHeight = "min(18rem,40vh)";

export const chatInlineImageClass = `block max-h-[${chatInlineImageMaxHeight}] w-auto max-w-full object-contain`;

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
