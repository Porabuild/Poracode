let context: CanvasRenderingContext2D | null = null;

function getContext(): CanvasRenderingContext2D {
  if (!context) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    context = canvas.getContext("2d", { willReadFrequently: true })!;
  }
  return context;
}

/** Rasterizes a CSS Color 4 string (oklch, oklab, color-mix, etc.) to sRGB RGBA bytes. */
export function readCssRgba(css: string): [number, number, number, number] {
  const ctx = getContext();
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = ctx.getImageData(0, 0, 1, 1).data;
  return [red!, green!, blue!, alpha!];
}

/** Composites `foregroundCss` over `backgroundCss` using the browser's 2D canvas alpha blending. */
export function readCompositedCssRgba(
  foregroundCss: string,
  backgroundCss: string,
): [number, number, number, number] {
  const ctx = getContext();
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = backgroundCss;
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = foregroundCss;
  ctx.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = ctx.getImageData(0, 0, 1, 1).data;
  return [red!, green!, blue!, alpha!];
}
