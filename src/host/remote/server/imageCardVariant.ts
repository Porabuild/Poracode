import { createHash } from "node:crypto";
import type { ResolvedRefImage } from "./imageRefProjection";

/**
 * Downscaled "card" variants for transcript display.
 *
 * Transcript cards render at most a few hundred CSS pixels tall, but the
 * image routes otherwise serve full-resolution bytes (multi-MB screenshots)
 * that the client must transfer and decode before anything paints. When a
 * composition installs a generator, `?variant=card` on the image routes
 * serves a downscaled re-encode instead; without one (headless hosts, by
 * the same deliberate choice as image previews) the full bytes are served
 * and the parameter is effectively ignored, as it is by older hosts.
 *
 * Variants are content-addressed by the hash of the full bytes, so the
 * in-memory cache needs no invalidation: different source bytes are a
 * different entry. Generation is single-flight per source hash.
 */

export type ImageCardVariantGenerator = (input: {
  readonly data: Buffer;
  readonly mime: string;
}) => Promise<ResolvedRefImage | null> | ResolvedRefImage | null;

const MAX_ENTRIES = 64;
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_ACTIVE_JOBS = 4;
const MAX_RETAINED_BYTES = 32 * 1024 * 1024;
/** Below this the transfer saving cannot repay a re-encode. */
const MIN_SOURCE_BYTES = 96 * 1024;
/** Formats where a re-encode would change semantics (vector, animation). */
const PASSTHROUGH_MIMES = new Set(["image/svg+xml", "image/gif"]);

let generator: ImageCardVariantGenerator | null = null;
const cache = new Map<string, ResolvedRefImage>();
const inFlight = new Map<string, Promise<ResolvedRefImage>>();
let cachedBytes = 0;
let generation = Symbol();
let activeJobs = 0;
let retainedBytes = 0;

/** Installed by compositions that ship an image resizer; others install nothing. */
export function setImageCardVariantGenerator(fn: ImageCardVariantGenerator | null): void {
  generator = fn;
  clearImageCardVariants();
}

/**
 * The card variant of `full`, or `full` itself when no generator is
 * installed, the format must pass through, generation fails, or the
 * variant is not actually smaller.
 */
export async function resolveCardVariant(full: ResolvedRefImage): Promise<ResolvedRefImage> {
  const active = generator;
  if (!active) return full;
  if (PASSTHROUGH_MIMES.has(full.mime) || full.data.byteLength <= MIN_SOURCE_BYTES) return full;
  const key = createHash("sha256").update(full.data).digest("hex");
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const pending = inFlight.get(key);
  if (pending) return pending;
  if (activeJobs >= MAX_ACTIVE_JOBS || full.data.byteLength > MAX_RETAINED_BYTES - retainedBytes) {
    return full;
  }
  const jobGeneration = generation;
  activeJobs += 1;
  retainedBytes += full.data.byteLength;
  const work = Promise.resolve().then(async () => {
    try {
      const variant = await active({ data: full.data, mime: full.mime });
      if (
        generation !== jobGeneration ||
        !variant ||
        variant.data.byteLength === 0 ||
        variant.data.byteLength >= full.data.byteLength
      ) {
        return full;
      }
      cache.set(key, variant);
      cachedBytes += variant.data.byteLength;
      while (cache.size > MAX_ENTRIES || cachedBytes > MAX_BYTES) {
        const oldest = cache.entries().next();
        if (oldest.done) break;
        const [oldestKey, entry] = oldest.value;
        cache.delete(oldestKey);
        cachedBytes -= entry.data.byteLength;
      }
      return cache.get(key) ?? variant;
    } catch {
      // A variant is an optimization; full bytes are always correct.
      return full;
    } finally {
      if (inFlight.get(key) === work) inFlight.delete(key);
      activeJobs -= 1;
      retainedBytes -= full.data.byteLength;
    }
  });
  inFlight.set(key, work);
  return work;
}

/** Exposed for tests. */
export function clearImageCardVariants(): void {
  generation = Symbol();
  cache.clear();
  inFlight.clear();
  cachedBytes = 0;
}
