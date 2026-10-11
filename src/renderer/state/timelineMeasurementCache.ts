/** Renderer-document-local row geometry; no DOM, persisted state or wire format. */
const MAX_TIMELINE_CACHE_ENTRIES = 16;
export const MAX_TIMELINE_SNAPSHOT_ROWS = 1024;
const MAX_TIMELINE_CACHE_ROWS = 4096;
// Logical UTF-16 key storage plus a conservative per-record allowance; this is
// an admission estimate, not a bound on JavaScript/native heap allocation.
const MAX_TIMELINE_CACHE_ESTIMATED_BYTES = 1024 * 1024;
const MEASUREMENT_ESTIMATED_OVERHEAD_BYTES = 96;

type TimelineMeasurementCacheEntry = {
  signature: string;
  measurements: readonly Readonly<TimelineMeasurement>[];
  estimatedBytes: number;
};

export type TimelineMeasurement = {
  key: string;
  index: number;
  size: number;
};

const timelineMeasurementCache = new Map<string, TimelineMeasurementCacheEntry>();
let cachedRows = 0;
let cachedEstimatedBytes = 0;

/** Forget a definitively removed thread without retaining a retired-ID ledger. */
export function forgetTimelineMeasurements(threadId: string): void {
  const entry = timelineMeasurementCache.get(threadId);
  if (!entry) return;
  cachedRows -= entry.measurements.length;
  cachedEstimatedBytes -= entry.estimatedBytes;
  timelineMeasurementCache.delete(threadId);
}

export function readTimelineMeasurements(threadId: string, signature: string | null) {
  if (!signature) return [];
  const cached = timelineMeasurementCache.get(threadId);
  if (!cached || cached.signature !== signature) return [];

  timelineMeasurementCache.delete(threadId);
  timelineMeasurementCache.set(threadId, cached);
  return cached.measurements;
}

export function writeTimelineMeasurements(
  threadId: string,
  signature: string | null,
  measurements: TimelineMeasurement[],
): void {
  // Rejected/empty replacements retire the previous snapshot too. Keeping it
  // would retain IDs that this snapshot no longer considers restorable.
  forgetTimelineMeasurements(threadId);
  if (!signature || measurements.length === 0 || measurements.length > MAX_TIMELINE_SNAPSHOT_ROWS)
    return;
  let estimatedBytes = (threadId.length + signature.length) * 2;
  for (const measurement of measurements) {
    estimatedBytes += measurement.key.length * 2 + MEASUREMENT_ESTIMATED_OVERHEAD_BYTES;
    if (estimatedBytes > MAX_TIMELINE_CACHE_ESTIMATED_BYTES) return;
  }
  // Own the admitted records: later caller mutation must not defeat the bounds.
  const snapshot = Object.freeze(
    measurements.map(({ key, index, size }) => Object.freeze({ key, index, size })),
  );
  timelineMeasurementCache.set(threadId, { signature, measurements: snapshot, estimatedBytes });
  cachedRows += snapshot.length;
  cachedEstimatedBytes += estimatedBytes;
  while (
    timelineMeasurementCache.size > MAX_TIMELINE_CACHE_ENTRIES ||
    cachedRows > MAX_TIMELINE_CACHE_ROWS ||
    cachedEstimatedBytes > MAX_TIMELINE_CACHE_ESTIMATED_BYTES
  ) {
    const oldestThreadId = timelineMeasurementCache.keys().next().value;
    if (oldestThreadId === undefined) break;
    forgetTimelineMeasurements(oldestThreadId);
  }
}

export function clearTimelineMeasurementCache(): void {
  timelineMeasurementCache.clear();
  cachedRows = 0;
  cachedEstimatedBytes = 0;
}
