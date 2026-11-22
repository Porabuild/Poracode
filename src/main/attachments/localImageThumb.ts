import { readFile, stat } from "node:fs/promises";
import { isAnimatedPng } from "@/shared/imageDimensions";

// Each thumbnail decodes a full image in the main process; a thread opening
// with many screenshots must not occupy the whole libuv pool.
const THUMB_CONCURRENCY = 2;
// Matches the larger image budgets elsewhere; past it the original is served.
const THUMB_INPUT_PIXEL_LIMIT = 64 * 1024 * 1024;
const THUMB_CACHE_MAX_BYTES = 16 * 1024 * 1024;
const THUMB_CACHE_MAX_ENTRIES = 128;

interface CachedThumb {
  readonly mtimeMs: number;
  readonly size: number;
  readonly buffer: Buffer;
}

const thumbCache = new Map<string, CachedThumb>();
let thumbCacheBytes = 0;

function thumbCacheKey(filePath: string, px: number): string {
  return `${filePath}\0${px}`;
}

function getCachedThumb(
  filePath: string,
  px: number,
  mtimeMs: number,
  size: number,
): Buffer | null {
  const key = thumbCacheKey(filePath, px);
  const hit = thumbCache.get(key);
  if (!hit) return null;
  if (hit.mtimeMs !== mtimeMs || hit.size !== size) {
    thumbCacheBytes -= hit.buffer.byteLength;
    thumbCache.delete(key);
    return null;
  }
  thumbCache.delete(key);
  thumbCache.set(key, hit);
  return hit.buffer;
}

function setCachedThumb(
  filePath: string,
  px: number,
  mtimeMs: number,
  size: number,
  buffer: Buffer,
) {
  if (buffer.byteLength > THUMB_CACHE_MAX_BYTES) return;
  const key = thumbCacheKey(filePath, px);
  const existing = thumbCache.get(key);
  if (existing) {
    thumbCacheBytes -= existing.buffer.byteLength;
    thumbCache.delete(key);
  }
  while (
    thumbCache.size > 0 &&
    (thumbCache.size >= THUMB_CACHE_MAX_ENTRIES ||
      thumbCacheBytes + buffer.byteLength > THUMB_CACHE_MAX_BYTES)
  ) {
    const oldest = thumbCache.entries().next().value;
    if (!oldest) break;
    thumbCacheBytes -= oldest[1].buffer.byteLength;
    thumbCache.delete(oldest[0]);
  }
  thumbCache.set(key, { mtimeMs, size, buffer });
  thumbCacheBytes += buffer.byteLength;
}

let running = 0;
const waiting: Array<() => void> = [];

async function withThumbSlot<T>(
  signal: AbortSignal | undefined,
  work: () => Promise<T>,
): Promise<T> {
  if (signal?.aborted) throw new Error("aborted");
  if (running < THUMB_CONCURRENCY) {
    running += 1;
  } else {
    await new Promise<void>((resolve, reject) => {
      const start = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      const onAbort = () => {
        const idx = waiting.indexOf(start);
        if (idx >= 0) waiting.splice(idx, 1);
        reject(new Error("aborted"));
      };
      waiting.push(start);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running -= 1;
  }
}

/**
 * Cover-sized WebP thumbnail of a local image: the shorter side lands on `px`,
 * so an `object-fit: cover` tile of that size never upsamples. Caches by
 * `(filePath, px, mtimeMs, size)` and supports `AbortSignal` cancellation for
 * queued tasks. Returns null for vectors, animations, oversized inputs, and
 * anything sharp cannot decode, so the caller serves the original file instead.
 */
export async function createLocalImageThumb(
  filePath: string,
  px: number,
  signal?: AbortSignal,
): Promise<Buffer | null> {
  if (signal?.aborted) return null;
  let info;
  try {
    info = await stat(filePath);
  } catch {
    return null;
  }
  const cached = getCachedThumb(filePath, px, info.mtimeMs, info.size);
  if (cached) return cached;

  try {
    return await withThumbSlot(signal, async () => {
      if (signal?.aborted) return null;
      const recheck = getCachedThumb(filePath, px, info.mtimeMs, info.size);
      if (recheck) return recheck;
      // Loaded on first use so libvips stays out of main-process startup.
      const { default: sharp } = await import("sharp");
      // Decode from memory: a path-opened input can stay locked on Windows
      // while libvips caches it, blocking attachment deletion.
      const data = await readFile(filePath);
      if (signal?.aborted) return null;
      const image = sharp(data, { limitInputPixels: THUMB_INPUT_PIXEL_LIMIT });
      const metadata = await image.metadata();
      if (
        metadata.format === "svg" ||
        (metadata.pages ?? 1) > 1 ||
        (metadata.format === "png" && isAnimatedPng(data))
      ) {
        return null;
      }
      const out = await image
        .autoOrient()
        .resize({ width: px, height: px, fit: "outside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      setCachedThumb(filePath, px, info.mtimeMs, info.size, out);
      return out;
    });
  } catch {
    return null;
  }
}
