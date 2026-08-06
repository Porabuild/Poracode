// Modern macOS icons keep the rounded-square body inside an optical safe area
// (~824/1024 of the canvas) instead of touching every edge. Apply the same
// trim -> resize -> pad math wherever we produce a macOS runtime icon so the
// two icon pipelines (the branding SVG masters and the nightly PNG source)
// cannot drift.
export const MAC_ICON_SIZE = 1024;
export const MAC_ICON_BODY_SIZE = 824;

/**
 * Pad a full-bleed sharp image into the macOS optical safe area. `trim()` first
 * strips either an original full-bleed canvas or padding from a previous run.
 * Returns the chained sharp instance; callers finish with `.png().toBuffer()`
 * or `.png().toFile(...)`.
 *
 * @param {import("sharp").Sharp} image
 * @param {number} [size]
 */
export function padToMacSafeArea(image, size = MAC_ICON_SIZE) {
  const bodySize = Math.round((size * MAC_ICON_BODY_SIZE) / MAC_ICON_SIZE);
  const inset = (size - bodySize) / 2;
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
  return image
    .trim()
    .resize(bodySize, bodySize, { fit: "contain", background: transparent })
    .extend({
      top: Math.floor(inset),
      bottom: Math.ceil(inset),
      left: Math.floor(inset),
      right: Math.ceil(inset),
      background: transparent,
    });
}
