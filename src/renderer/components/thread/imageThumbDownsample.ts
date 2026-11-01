/**
 * High-quality thumbnails for tiny preview tiles.
 *
 * Sticking a 2K/4K screenshot into a 96×64 <img> lets the compositor
 * bilinear-scale high-frequency UI chrome (text, hairlines, status dots).
 * That is what looks pixelated / shimmering in the Images dock. Decode once,
 * crop to the object-cover rect, then step the bitmap down with
 * `resizeQuality: "high"` so the element paints at ~1 device pixel per
 * source pixel.
 */

export interface ImageThumbOptions {
  /**
   * `cover` center-crops the source to the tile aspect (default); `contain`
   * keeps the full source rect and letterboxes it inside the budget instead.
   */
  fit?: "cover" | "contain";
  /** Multiplies the device-pixel budget for sharper previews. Defaults to 1. */
  resolutionScale?: number;
}

const DOWNSAMPLE_CONCURRENCY = 2;

let running = 0;
const pending: Array<() => void> = [];

function enqueueDownsample<T>(work: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = () => {
      running += 1;
      void work()
        .then(resolve, reject)
        .finally(() => {
          running -= 1;
          pending.shift()?.();
        });
    };
    if (running < DOWNSAMPLE_CONCURRENCY) start();
    else pending.push(start);
  });
}

/** object-fit: cover source rect in image pixels. */
export function coverCropRect(
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  if (srcW <= 0 || srcH <= 0 || destW <= 0 || destH <= 0) {
    return { sx: 0, sy: 0, sw: Math.max(1, srcW), sh: Math.max(1, srcH) };
  }
  const srcAspect = srcW / srcH;
  const destAspect = destW / destH;
  if (srcAspect > destAspect) {
    const sw = Math.max(1, Math.round(srcH * destAspect));
    const sx = Math.max(0, Math.round((srcW - sw) / 2));
    return { sx, sy: 0, sw: Math.min(sw, srcW - sx), sh: srcH };
  }
  const sh = Math.max(1, Math.round(srcW / destAspect));
  const sy = Math.max(0, Math.round((srcH - sh) / 2));
  return { sx: 0, sy, sw: srcW, sh: Math.min(sh, srcH - sy) };
}

export function thumbPixelSize(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
): { width: number; height: number } {
  const scale = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return {
    width: Math.max(1, Math.round(cssWidth * scale)),
    height: Math.max(1, Math.round(cssHeight * scale)),
  };
}

/**
 * Largest full-source thumbnail that fits the device-pixel budget for
 * `fit: "contain"`. Never enlarges: returns null when the source already fits.
 */
export function containPixelSize(
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
): { width: number; height: number } | null {
  if (srcW <= 0 || srcH <= 0 || destW <= 0 || destH <= 0) return null;
  const ratio = Math.min(destW / srcW, destH / srcH, 1);
  if (ratio >= 1) return null;
  return {
    width: Math.max(1, Math.round(srcW * ratio)),
    height: Math.max(1, Math.round(srcH * ratio)),
  };
}

export function shouldDownsample(
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
): boolean {
  if (srcW <= 0 || srcH <= 0 || destW <= 0 || destH <= 0) return false;
  const crop = coverCropRect(srcW, srcH, destW, destH);
  return crop.sw > destW || crop.sh > destH;
}

/** Vectors already scale cleanly; animated GIFs would freeze if re-encoded. */
export function isRasterDownsampleCandidate(src: string): boolean {
  const value = src.trim();
  if (!value) return false;
  if (value.startsWith("data:image/svg") || value.startsWith("data:image/gif")) return false;
  return !/\.(?:svg|gif)(?:[?#]|$)/i.test(value);
}

export function nextDownsampleSize(
  width: number,
  height: number,
  destW: number,
  destH: number,
): { width: number; height: number } | null {
  if (width <= destW && height <= destH) return null;
  const nextW = Math.max(destW, Math.round(width / 2));
  const nextH = Math.max(destH, Math.round(height / 2));
  if (nextW === width && nextH === height) return { width: destW, height: destH };
  return { width: nextW, height: nextH };
}

function readDisplaySize(img: HTMLImageElement): { width: number; height: number } {
  const rect = img.getBoundingClientRect();
  return {
    width: rect.width || img.offsetWidth,
    height: rect.height || img.offsetHeight,
  };
}

async function resizeBitmap(
  source: ImageBitmap,
  width: number,
  height: number,
): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: "high",
    });
  } catch {
    return resizeBitmapViaCanvas(source, width, height);
  }
}

async function resizeBitmapViaCanvas(
  source: ImageBitmap,
  width: number,
  height: number,
): Promise<ImageBitmap> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  return createImageBitmap(canvas);
}

async function stepwiseResize(
  source: ImageBitmap,
  destW: number,
  destH: number,
): Promise<ImageBitmap> {
  let current = source;
  const created: ImageBitmap[] = [];
  try {
    for (;;) {
      const next = nextDownsampleSize(current.width, current.height, destW, destH);
      if (!next) {
        for (const bitmap of created) {
          if (bitmap !== current) bitmap.close();
        }
        return current;
      }
      current = await resizeBitmap(current, next.width, next.height);
      created.push(current);
    }
  } catch (error) {
    for (const bitmap of created) bitmap.close();
    throw error;
  }
}

async function bitmapToBlob(bitmap: ImageBitmap): Promise<Blob | null> {
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    return canvas.convertToBlob({ type: "image/png" });
  }
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
}

function validResolutionScale(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * Build a blob: URL for a high-quality thumbnail of an already decoded <img>.
 * `fit: "cover"` (default) center-crops the source to the tile; `"contain"`
 * keeps the whole source inside the budget without cropping or upscaling.
 * Returns null when downsampling is unnecessary or unavailable so the caller
 * can keep painting the original source.
 */
export async function downsampleLoadedImage(
  img: HTMLImageElement,
  options: ImageThumbOptions = {},
): Promise<string | null> {
  if (typeof createImageBitmap !== "function") return null;
  const src = img.currentSrc || img.src;
  if (!isRasterDownsampleCandidate(src)) return null;
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  const display = readDisplaySize(img);
  if (display.width < 1 || display.height < 1) return null;
  const scale = validResolutionScale(options.resolutionScale);
  const dest = thumbPixelSize(
    display.width,
    display.height,
    (window.devicePixelRatio || 1) * scale,
  );
  const contain = options.fit === "contain";
  const crop = contain
    ? { sx: 0, sy: 0, sw: srcW, sh: srcH }
    : coverCropRect(srcW, srcH, dest.width, dest.height);
  const output = contain
    ? containPixelSize(srcW, srcH, dest.width, dest.height)
    : { width: dest.width, height: dest.height };
  if (!output || (!contain && !shouldDownsample(srcW, srcH, dest.width, dest.height))) {
    return null;
  }

  return enqueueDownsample(async () => {
    try {
      const cropped = await createImageBitmap(img, crop.sx, crop.sy, crop.sw, crop.sh);
      try {
        const resized = await stepwiseResize(cropped, output.width, output.height);
        try {
          const blob = await bitmapToBlob(resized);
          if (!blob) return null;
          return URL.createObjectURL(blob);
        } finally {
          if (resized !== cropped) resized.close();
        }
      } finally {
        cropped.close();
      }
    } catch {
      // Tainted canvas, decode failure, or a missing 2d context — keep the
      // original <img> source rather than leaving a blank tile.
      return null;
    }
  });
}
