import type { NativeImage } from "electron";
import { captureScreenshotPng, evalJs, queryFirstDocumentRect } from "../../cdp/tools";
import { clampInteger, requireTab } from "./helpers";
import type { ToolContext } from "./types";

const MAX_SCREENSHOT_BYTES = 6 * 1024 * 1024;
const MAX_SCREENSHOT_DIMENSION = 2200;
const SCREENSHOT_TIMEOUT_MS = 800;

type ScreenshotFormat = "png" | "jpeg";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function requestedMaxScreenshotBytes(payload: Record<string, unknown>): number {
  return clampInteger(payload.maxBytes, MAX_SCREENSHOT_BYTES, 1024, 20 * 1024 * 1024);
}

function requestedScreenshotFormat(payload: Record<string, unknown>): ScreenshotFormat {
  return payload.format === "jpeg" ? "jpeg" : "png";
}

function requestedScreenshotQuality(payload: Record<string, unknown>): number {
  return clampInteger(payload.quality, 80, 1, 100);
}

function requestedMaxScreenshotDimension(payload: Record<string, unknown>): number {
  return clampInteger(payload.maxDimension, MAX_SCREENSHOT_DIMENSION, 320, 5000);
}

function requestedScreenshotTimeoutMs(payload: Record<string, unknown>): number {
  return clampInteger(payload.timeoutMs, SCREENSHOT_TIMEOUT_MS, 200, 30_000);
}

class ScreenshotTimeoutError extends Error {
  constructor(
    message: string,
    readonly operation: string,
    readonly timeoutMs: number,
  ) {
    super(message);
    this.name = "ScreenshotTimeoutError";
  }
}

/** `webContents.capturePage()` throws (e.g. "UnknownVizError") when the tab
 *  isn't composited — which is the case while the browser runs headless
 *  off-screen. Return null in that case so the caller falls through to the CDP
 *  capture path, which forces a frame regardless of on-screen visibility. */
async function tryCapturePage(
  promise: Promise<NativeImage>,
  timeoutMs: number,
  operation: string,
): Promise<NativeImage | null> {
  try {
    return await withScreenshotTimeout(promise, timeoutMs, operation);
  } catch (err) {
    // A genuine timeout (the page is stuck) is a real result — surface it. Only
    // a capture *failure* (e.g. off-screen "UnknownVizError") falls through to
    // the CDP path.
    if (err instanceof ScreenshotTimeoutError) throw err;
    return null;
  }
}

async function withScreenshotTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new ScreenshotTimeoutError(
                `${operation} timed out after ${timeoutMs}ms`,
                operation,
                timeoutMs,
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function screenshotTimeoutResult(error: ScreenshotTimeoutError): Record<string, unknown> {
  return {
    timedOut: true,
    reason: "timeout",
    operation: error.operation,
    timeoutMs: error.timeoutMs,
    message: error.message,
    hint: "Retry with a larger timeoutMs, selector clip, smaller maxDimension, or failOnTimeout:true when a hard failure is preferred.",
  };
}

function oversizedScreenshotError(
  bytes: number,
  maxBytes: number,
  format: ScreenshotFormat,
  size?: { width: number; height: number },
): Record<string, unknown> {
  return {
    error: `screenshot is ${formatBytes(bytes)}, above maxBytes ${formatBytes(
      maxBytes,
    )}; retry with selector/fullPage:false or a higher maxBytes.`,
    bytes,
    maxBytes,
    format,
    ...(size ? { width: size.width, height: size.height } : {}),
  };
}

function encodeNativeImage(image: NativeImage, format: ScreenshotFormat, quality: number): Buffer {
  return format === "jpeg" ? image.toJPEG(quality) : image.toPNG();
}

function screenshotResultFromNativeImage(
  image: NativeImage,
  options: {
    format: ScreenshotFormat;
    quality: number;
    maxBytes: number;
    maxDimension: number;
    allowJpegFallback: boolean;
  },
): Record<string, unknown> {
  let current = image;
  let format = options.format;
  let quality = options.quality;
  let bytes = encodeNativeImage(current, format, quality);
  let size = current.getSize();
  let downscaled = false;
  let usedFallback = false;

  while (
    (bytes.length > options.maxBytes ||
      size.width > options.maxDimension ||
      size.height > options.maxDimension) &&
    size.width > 1 &&
    size.height > 1
  ) {
    const byteScale =
      bytes.length > options.maxBytes ? Math.sqrt(options.maxBytes / bytes.length) * 0.92 : 1;
    const dimensionScale = Math.min(1, options.maxDimension / Math.max(size.width, size.height));
    const scale = Math.max(0.25, Math.min(0.9, byteScale, dimensionScale));
    const width = Math.max(1, Math.floor(size.width * scale));
    const height = Math.max(1, Math.floor(size.height * scale));
    if (width === size.width && height === size.height) break;
    current = current.resize({ width, height });
    bytes = encodeNativeImage(current, format, quality);
    size = current.getSize();
    downscaled = true;
  }

  if (bytes.length > options.maxBytes && format === "png" && options.allowJpegFallback) {
    format = "jpeg";
    quality = Math.min(quality, 80);
    bytes = encodeNativeImage(current, format, quality);
    usedFallback = true;
  }

  if (format === "jpeg") {
    while (bytes.length > options.maxBytes && quality > 35) {
      quality = Math.max(35, quality - 10);
      bytes = encodeNativeImage(current, format, quality);
    }
  }

  while (bytes.length > options.maxBytes && size.width > 1 && size.height > 1) {
    const scale = Math.max(0.25, Math.min(0.85, Math.sqrt(options.maxBytes / bytes.length) * 0.9));
    const width = Math.max(1, Math.floor(size.width * scale));
    const height = Math.max(1, Math.floor(size.height * scale));
    if (width === size.width && height === size.height) break;
    current = current.resize({ width, height });
    bytes = encodeNativeImage(current, format, quality);
    size = current.getSize();
    downscaled = true;
  }

  if (bytes.length > options.maxBytes) {
    return oversizedScreenshotError(bytes.length, options.maxBytes, format, size);
  }
  return {
    mimeType: format === "jpeg" ? "image/jpeg" : "image/png",
    base64: bytes.toString("base64"),
    bytes: bytes.length,
    format,
    timedOut: false,
    reason: "complete",
    width: size.width,
    height: size.height,
    ...(format === "jpeg" ? { quality } : {}),
    ...(downscaled ? { downscaled: true } : {}),
    ...(usedFallback ? { fallback: true } : {}),
  };
}

function screenshotResultFromBuffer(
  bytes: Buffer,
  maxBytes: number,
  format: ScreenshotFormat,
  quality?: number,
): Record<string, unknown> {
  if (bytes.length > maxBytes) return oversizedScreenshotError(bytes.length, maxBytes, format);
  return {
    mimeType: format === "jpeg" ? "image/jpeg" : "image/png",
    base64: bytes.toString("base64"),
    bytes: bytes.length,
    format,
    timedOut: false,
    reason: "complete",
    ...(format === "jpeg" && quality != null ? { quality } : {}),
  };
}

/** Handles the `screenshot` tool. Extracted from the dispatch switch because
 *  of its size and self-contained capture/downscale/fallback logic. */
export async function runScreenshotTool(
  ctx: ToolContext,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const { tab } = await requireTab(ctx, payload);
  await tab.cdp.attach();
  const selector = typeof payload.selector === "string" ? payload.selector : undefined;
  const fullPage = payload.fullPage === true;
  const maxBytes = requestedMaxScreenshotBytes(payload);
  const format = requestedScreenshotFormat(payload);
  const quality = requestedScreenshotQuality(payload);
  const maxDimension = requestedMaxScreenshotDimension(payload);
  const timeoutMs = requestedScreenshotTimeoutMs(payload);
  const failOnTimeout = payload.failOnTimeout === true;
  const screenshotOptions = {
    format,
    quality,
    maxBytes,
    maxDimension,
    allowJpegFallback: payload.format !== "png",
  };

  // Set when capturePage() can't read the surface (tab running headless
  // off-screen). Switches the CDP capture to `fromSurface: false` so it renders
  // from the renderer frame rather than waiting on a non-existent GPU surface.
  let headlessFallback = false;

  try {
    // Prefer `webContents.capturePage` for in-viewport captures — it reads
    // the renderer's already-painted bitmap without resizing the page, so
    // the user sees no jump. Fall back to CDP `captureBeyondViewport` only
    // for `fullPage` or off-viewport selector captures (those genuinely
    // need the page to be re-laid out beyond its current viewport).
    if (selector && !fullPage) {
      const viewport = await evalJs<{
        rect: { x: number; y: number; width: number; height: number } | null;
        inView: boolean;
        vw: number;
        vh: number;
      }>(
        tab.cdp,
        `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        if (!el) return { rect: null, inView: false, vw, vh };
        const r = el.getBoundingClientRect();
        const inView =
          r.width > 0 && r.height > 0 &&
          r.left >= 0 && r.top >= 0 &&
          r.right <= vw && r.bottom <= vh;
        return {
          rect: { x: r.left, y: r.top, width: r.width, height: r.height },
          inView,
          vw,
          vh,
        };
      })()`,
      );
      if (!viewport.rect) throw new Error(`selector not found: ${selector}`);
      if (viewport.inView) {
        const img = await tryCapturePage(
          tab.webContents.capturePage({
            x: Math.max(0, Math.floor(viewport.rect.x)),
            y: Math.max(0, Math.floor(viewport.rect.y)),
            width: Math.max(1, Math.ceil(viewport.rect.width)),
            height: Math.max(1, Math.ceil(viewport.rect.height)),
          }),
          timeoutMs,
          "viewport selector screenshot",
        );
        if (img) return screenshotResultFromNativeImage(img, screenshotOptions);
        // null → tab is off-screen/headless; fall through to the CDP path.
        headlessFallback = true;
      }
    } else if (!selector && !fullPage) {
      const img = await tryCapturePage(
        tab.webContents.capturePage(),
        timeoutMs,
        "viewport screenshot",
      );
      if (img) return screenshotResultFromNativeImage(img, screenshotOptions);
      // null → tab is off-screen/headless; fall through to the CDP path.
      headlessFallback = true;
    }

    // Off-viewport selector or fullPage — must use CDP, which will visibly
    // re-lay out the page to capture content outside the current viewport.
    let clip: { x: number; y: number; width: number; height: number } | undefined;
    if (selector) {
      const rect = await queryFirstDocumentRect(tab.cdp, selector);
      if (!rect) throw new Error(`selector not found: ${selector}`);
      clip = {
        x: Math.max(0, Math.floor(rect.x)),
        y: Math.max(0, Math.floor(rect.y)),
        width: Math.max(1, Math.ceil(rect.width)),
        height: Math.max(1, Math.ceil(rect.height)),
      };
    }
    // Headless viewport capture has no clip; render the whole document instead.
    const effectiveFullPage = fullPage || (headlessFallback && !selector);
    const cdpFromSurface = headlessFallback ? { fromSurface: false as const } : {};
    // Rendering a full document from the renderer is slower than a surface read,
    // so give headless captures more headroom than the (tight) default.
    const cdpTimeout = headlessFallback ? Math.max(timeoutMs, 5000) : timeoutMs;
    const bytes = await withScreenshotTimeout(
      captureScreenshotPng(tab.cdp, {
        fullPage: effectiveFullPage,
        format,
        quality,
        ...cdpFromSurface,
        ...(clip ? { clip, captureBeyondViewport: true } : {}),
      }),
      cdpTimeout,
      "cdp screenshot",
    );
    if (bytes.length <= maxBytes || payload.format === "png") {
      return screenshotResultFromBuffer(
        bytes,
        maxBytes,
        format,
        format === "jpeg" ? quality : undefined,
      );
    }
    for (const next of [
      { format: "jpeg" as const, quality: Math.min(quality, 80), scale: 1 },
      { format: "jpeg" as const, quality: 70, scale: 0.8 },
      { format: "jpeg" as const, quality: 60, scale: 0.65 },
      { format: "jpeg" as const, quality: 50, scale: 0.5 },
      { format: "jpeg" as const, quality: 40, scale: 0.35 },
    ]) {
      const retry = await withScreenshotTimeout(
        captureScreenshotPng(tab.cdp, {
          fullPage: effectiveFullPage,
          format: next.format,
          quality: next.quality,
          scale: next.scale,
          ...cdpFromSurface,
          ...(clip ? { clip, captureBeyondViewport: true } : {}),
        }),
        cdpTimeout,
        "cdp screenshot retry",
      );
      if (retry.length <= maxBytes) {
        return {
          ...screenshotResultFromBuffer(retry, maxBytes, next.format, next.quality),
          fallback: true,
          downscaled: next.scale < 1,
        };
      }
    }
    return screenshotResultFromBuffer(
      bytes,
      maxBytes,
      format,
      format === "jpeg" ? quality : undefined,
    );
  } catch (err) {
    if (err instanceof ScreenshotTimeoutError && !failOnTimeout) {
      return screenshotTimeoutResult(err);
    }
    throw err;
  }
}
