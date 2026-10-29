import { readFile } from "node:fs/promises";
import { isAnimatedPng } from "@/shared/imageDimensions";

// Each thumbnail decodes a full image in the main process; a thread opening
// with many screenshots must not occupy the whole libuv pool.
const THUMB_CONCURRENCY = 2;
// Matches the larger image budgets elsewhere; past it the original is served.
const THUMB_INPUT_PIXEL_LIMIT = 64 * 1024 * 1024;

let running = 0;
const waiting: Array<() => void> = [];

async function withThumbSlot<T>(work: () => Promise<T>): Promise<T> {
  // A finished task hands its slot straight to the next waiter, so a caller
  // arriving in between cannot take it as well.
  if (running < THUMB_CONCURRENCY) running += 1;
  else await new Promise<void>((start) => waiting.push(start));
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running -= 1;
  }
}

/**
 * Cover-sized PNG thumbnail of a local image: the shorter side lands on `px`,
 * so an `object-fit: cover` tile of that size never upsamples. Returns null for
 * vectors, animations, oversized inputs, and anything sharp cannot decode, so
 * the caller serves the original file instead.
 */
export function createLocalImageThumb(filePath: string, px: number): Promise<Buffer | null> {
  return withThumbSlot(async () => {
    try {
      // Loaded on first use so libvips stays out of main-process startup.
      const { default: sharp } = await import("sharp");
      // Decode from memory: a path-opened input can stay locked on Windows
      // while libvips caches it, blocking attachment deletion.
      const data = await readFile(filePath);
      const image = sharp(data, { limitInputPixels: THUMB_INPUT_PIXEL_LIMIT });
      const metadata = await image.metadata();
      if (
        metadata.format === "svg" ||
        (metadata.pages ?? 1) > 1 ||
        (metadata.format === "png" && isAnimatedPng(data))
      ) {
        return null;
      }
      return await image
        .autoOrient()
        .resize({ width: px, height: px, fit: "outside", withoutEnlargement: true })
        .png()
        .toBuffer();
    } catch {
      return null;
    }
  });
}
