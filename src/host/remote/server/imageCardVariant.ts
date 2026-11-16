import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
 * Variants are content-addressed by the hash of the full bytes (or the
 * canonical content-addressed blob hash), so caches need no invalidation:
 * different source bytes are a different entry. Generation is single-flight
 * per key. When a derived on-disk store directory (`image-card-variants-v1`)
 * is installed, encoded variants also persist across restarts with zero
 * startup bitmap preload — startup indexes filenames and sizes only, and
 * cold opens read pre-encoded WebP bytes directly from disk without decoding
 * the multi-MB source image again.
 */

export type ImageCardVariantGenerator = (input: {
  readonly data: Buffer;
  readonly mime: string;
}) => Promise<ResolvedRefImage | null> | ResolvedRefImage | null;

export const IMAGE_CARD_VARIANT_STORE_VERSION = 1;
const STORE_HEADER_MAGIC = Buffer.from("PCV1", "ascii");
const MAX_MIME_LENGTH = 64;
const MIME_PATTERN = /^image\/[a-z0-9.+-]+$/i;

const MAX_ENTRIES = 64;
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_ACTIVE_JOBS = 4;
const MAX_RETAINED_BYTES = 32 * 1024 * 1024;
const MAX_STORED_VARIANT_FILES = 512;
const MAX_STORED_VARIANT_BYTES = 128 * 1024 * 1024;
const MAX_BACKGROUND_JOBS = 16;
const MAX_BACKGROUND_RETAINED_BYTES = 16 * 1024 * 1024;
/** Below this the transfer saving cannot repay a re-encode. */
const MIN_SOURCE_BYTES = 96 * 1024;
/** Formats where a re-encode would change semantics (vector, animation). */
const PASSTHROUGH_MIMES = new Set(["image/svg+xml", "image/gif"]);

interface VariantStore {
  readonly dir: string;
  readonly files: Map<string, number>;
  bytes: number;
  ready: Promise<void>;
  writes: Promise<void>;
}

interface BackgroundVariantJob {
  readonly key: string;
  readonly retainedBytes: number;
  readonly generation: symbol;
  readonly decode: () => ResolvedRefImage | null;
}

let generator: ImageCardVariantGenerator | null = null;
let store: VariantStore | null = null;
let storeInstallation = Symbol();
const cache = new Map<string, ResolvedRefImage>();
const inFlight = new Map<string, Promise<ResolvedRefImage>>();
let cachedBytes = 0;
let generation = Symbol();
let activeJobs = 0;
let retainedBytes = 0;
const backgroundQueued = new Set<string>();
const backgroundPending: BackgroundVariantJob[] = [];
let backgroundActive = false;
let backgroundRetainedBytes = 0;
let backgroundDrainScheduled = false;

/** Installed by compositions that ship an image resizer; others install nothing. */
export function setImageCardVariantGenerator(fn: ImageCardVariantGenerator | null): void {
  generator = fn;
  clearImageCardVariants();
}

function variantStoreFileName(key: string): string {
  return `${createHash("sha256").update(key, "utf8").digest("hex")}.bin`;
}

function encodeVariantEnvelope(variant: ResolvedRefImage): Buffer | null {
  const mimeBytes = Buffer.from(variant.mime, "utf8");
  if (
    mimeBytes.byteLength === 0 ||
    mimeBytes.byteLength > MAX_MIME_LENGTH ||
    !MIME_PATTERN.test(variant.mime) ||
    variant.data.byteLength === 0
  ) {
    return null;
  }
  const out = Buffer.allocUnsafe(5 + mimeBytes.byteLength + variant.data.byteLength);
  STORE_HEADER_MAGIC.copy(out, 0);
  out[4] = mimeBytes.byteLength;
  mimeBytes.copy(out, 5);
  variant.data.copy(out, 5 + mimeBytes.byteLength);
  return out;
}

function decodeVariantEnvelope(raw: Buffer): ResolvedRefImage | null {
  if (raw.byteLength < 7) return null;
  if (
    raw[0] !== STORE_HEADER_MAGIC[0] ||
    raw[1] !== STORE_HEADER_MAGIC[1] ||
    raw[2] !== STORE_HEADER_MAGIC[2] ||
    raw[3] !== STORE_HEADER_MAGIC[3]
  ) {
    return null;
  }
  const mimeLen = raw[4]!;
  if (mimeLen === 0 || mimeLen > MAX_MIME_LENGTH || raw.byteLength <= 5 + mimeLen) return null;
  const mime = raw.subarray(5, 5 + mimeLen).toString("utf8");
  if (!MIME_PATTERN.test(mime)) return null;
  const data = raw.subarray(5 + mimeLen);
  return data.byteLength > 0 ? { mime, data } : null;
}

function insertCachedVariant(key: string, variant: ResolvedRefImage): ResolvedRefImage {
  const previous = cache.get(key);
  if (previous) {
    cache.delete(key);
    cachedBytes -= previous.data.byteLength;
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
}

/**
 * Installs (or clears) the derived on-disk card-variant store (`image-card-variants-v1`).
 * Startup indexes file metadata only (zero image payloads loaded into RAM);
 * individual variants are read lazily when requested.
 */
export async function setImageCardVariantStoreDir(dir: string | null): Promise<void> {
  const installation = Symbol();
  storeInstallation = installation;
  const previous = store;
  store = null;
  await previous?.writes;
  if (!dir || storeInstallation !== installation) return;
  const installed: VariantStore = {
    dir,
    files: new Map(),
    bytes: 0,
    ready: Promise.resolve(),
    writes: Promise.resolve(),
  };
  store = installed;
  installed.ready = indexVariantStore(installed);
  await installed.ready;
}

async function indexVariantStore(installed: VariantStore): Promise<void> {
  const { dir } = installed;
  try {
    await mkdir(dir, { recursive: true });
    const names = (await readdir(dir)).filter((name) => name.endsWith(".bin"));
    const entries: Array<{ name: string; mtimeMs: number; size: number }> = [];
    for (const name of names) {
      try {
        const stats = await stat(join(dir, name));
        if (stats.isFile()) entries.push({ name, mtimeMs: stats.mtimeMs, size: stats.size });
      } catch {
        // Vanished or unreadable cache entries are disposable.
      }
    }
    entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
    let keptBytes = 0;
    const kept: typeof entries = [];
    for (const entry of entries) {
      if (store !== installed) return;
      if (
        kept.length < MAX_STORED_VARIANT_FILES &&
        keptBytes + entry.size <= MAX_STORED_VARIANT_BYTES
      ) {
        kept.push(entry);
        keptBytes += entry.size;
      } else {
        await unlink(join(dir, entry.name)).catch(() => undefined);
      }
    }
    for (const entry of kept.reverse()) {
      if (store !== installed) return;
      installed.files.set(entry.name, entry.size);
      installed.bytes += entry.size;
    }
  } catch {
    // Disposable cache: directory errors must never disturb host startup or serving.
  }
}

function forgetStoredFile(installed: VariantStore, fileName: string): void {
  const removed = installed.files.get(fileName) ?? 0;
  installed.files.delete(fileName);
  installed.bytes = Math.max(0, installed.bytes - removed);
}

async function readStoredVariant(
  key: string,
  maxBytesExclusive?: number,
): Promise<ResolvedRefImage | null> {
  const installed = store;
  if (!installed) return null;
  await installed.ready;
  if (store !== installed) return null;
  const fileName = variantStoreFileName(key);
  if (!installed.files.has(fileName)) return null;
  const filePath = join(installed.dir, fileName);
  try {
    const raw = await readFile(filePath);
    const decoded = decodeVariantEnvelope(raw);
    if (
      !decoded ||
      (maxBytesExclusive !== undefined && decoded.data.byteLength >= maxBytesExclusive)
    ) {
      forgetStoredFile(installed, fileName);
      await unlink(filePath).catch(() => undefined);
      return null;
    }
    return decoded;
  } catch {
    forgetStoredFile(installed, fileName);
    return null;
  }
}

async function persistStoredVariant(key: string, variant: ResolvedRefImage): Promise<void> {
  const installed = store;
  if (!installed) return;
  const envelope = encodeVariantEnvelope(variant);
  if (!envelope || envelope.byteLength > MAX_STORED_VARIANT_BYTES) return;
  installed.writes = installed.writes.then(async () => {
    await installed.ready;
    if (store !== installed) return;
    const fileName = variantStoreFileName(key);
    const target = join(installed.dir, fileName);
    const temporary = `${target}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, envelope);
      await rename(temporary, target);
      installed.bytes -= installed.files.get(fileName) ?? 0;
      installed.files.delete(fileName);
      installed.files.set(fileName, envelope.byteLength);
      installed.bytes += envelope.byteLength;
      while (
        installed.files.size > MAX_STORED_VARIANT_FILES ||
        installed.bytes > MAX_STORED_VARIANT_BYTES
      ) {
        const oldest = installed.files.entries().next();
        if (oldest.done) break;
        const [name, size] = oldest.value;
        await unlink(join(installed.dir, name)).catch(() => undefined);
        installed.files.delete(name);
        installed.bytes -= size;
      }
    } catch {
      // Disposable cache write failures never surface.
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  });
  await installed.writes;
}

/**
 * Fast lookup by known content-addressed key (e.g. `blob:<hash>`) without
 * reading the multi-MB source bytes from SQLite first.
 */
export async function readCachedOrStoredCardVariant(key: string): Promise<ResolvedRefImage | null> {
  if (!generator) return null;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const jobGeneration = generation;
  const stored = await readStoredVariant(key);
  if (!stored || generation !== jobGeneration) return null;
  return insertCachedVariant(key, stored);
}

/**
 * Queues off-critical-path card-variant generation when an image reference is
 * projected so the variant is already persisted on disk before the user opens
 * the thread or restarts the app.
 */
export function scheduleImageCardVariant(
  key: string,
  sourceBytes: number,
  decode: () => ResolvedRefImage | null,
): boolean {
  if (
    !generator ||
    key.length === 0 ||
    !Number.isSafeInteger(sourceBytes) ||
    sourceBytes <= MIN_SOURCE_BYTES ||
    sourceBytes > MAX_BACKGROUND_RETAINED_BYTES ||
    cache.has(key) ||
    inFlight.has(key) ||
    backgroundQueued.has(key) ||
    backgroundQueued.size >= MAX_BACKGROUND_JOBS
  ) {
    return false;
  }
  if (store?.files.has(variantStoreFileName(key))) return false;
  if (sourceBytes > MAX_BACKGROUND_RETAINED_BYTES - backgroundRetainedBytes) return false;
  backgroundQueued.add(key);
  backgroundRetainedBytes += sourceBytes;
  backgroundPending.push({ key, retainedBytes: sourceBytes, generation, decode });
  scheduleBackgroundDrain();
  return true;
}

function scheduleBackgroundDrain(): void {
  if (backgroundActive || backgroundDrainScheduled || backgroundPending.length === 0) return;
  backgroundDrainScheduled = true;
  setImmediate(() => {
    backgroundDrainScheduled = false;
    void drainBackgroundVariants();
  });
}

async function drainBackgroundVariants(): Promise<void> {
  if (backgroundActive) return;
  const next = backgroundPending.shift();
  if (!next) return;
  backgroundActive = true;
  try {
    if (!generator || next.generation !== generation) return;
    if (cache.has(next.key) || store?.files.has(variantStoreFileName(next.key))) return;
    const source = next.decode();
    if (source && next.generation === generation) {
      await resolveCardVariant(source, next.key);
    }
  } catch {
    // Background warming is strictly best-effort.
  } finally {
    backgroundActive = false;
    backgroundQueued.delete(next.key);
    backgroundRetainedBytes = Math.max(0, backgroundRetainedBytes - next.retainedBytes);
    scheduleBackgroundDrain();
  }
}

/**
 * The card variant of `full`, or `full` itself when no generator is
 * installed, the format must pass through, generation fails, or the
 * variant is not actually smaller.
 */
export async function resolveCardVariant(
  full: ResolvedRefImage,
  explicitKey?: string,
): Promise<ResolvedRefImage> {
  const active = generator;
  if (!active) return full;
  if (PASSTHROUGH_MIMES.has(full.mime) || full.data.byteLength <= MIN_SOURCE_BYTES) return full;
  const key = explicitKey ?? createHash("sha256").update(full.data).digest("hex");
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const pending = inFlight.get(key);
  if (pending) return pending;
  const jobGeneration = generation;
  if (store) {
    const stored = await readStoredVariant(key, full.data.byteLength);
    if (stored && generation === jobGeneration) {
      return insertCachedVariant(key, stored);
    }
    if (generation !== jobGeneration) return full;
    const joinedAfterDisk = inFlight.get(key);
    if (joinedAfterDisk) return joinedAfterDisk;
  }
  if (activeJobs >= MAX_ACTIVE_JOBS || full.data.byteLength > MAX_RETAINED_BYTES - retainedBytes) {
    return full;
  }
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
      const admitted = insertCachedVariant(key, variant);
      void persistStoredVariant(key, variant);
      return admitted;
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
  for (const job of backgroundPending) {
    backgroundQueued.delete(job.key);
    backgroundRetainedBytes = Math.max(0, backgroundRetainedBytes - job.retainedBytes);
  }
  backgroundPending.length = 0;
}
