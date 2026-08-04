import { CHAT_FONT_SIZE_VAR } from "../chatFontVars";

const MAX_TIMELINE_CACHE_ENTRIES = 16;
const MAX_TIMELINE_WIDTH_PX = 920;

type TimelineMeasurementCacheEntry = {
  signature: string;
  measurements: TimelineMeasurement[];
};

export type TimelineMeasurement = {
  key: string;
  index: number;
  size: number;
};

const timelineMeasurementCache = new Map<string, TimelineMeasurementCacheEntry>();

export function getTimelineMeasurementSignature(
  scrollElement: HTMLDivElement | null,
): string | null {
  if (!scrollElement || scrollElement.clientWidth <= 0) return null;
  const width = Math.min(scrollElement.clientWidth, MAX_TIMELINE_WIDTH_PX);
  const fontSize = getComputedStyle(scrollElement).getPropertyValue(CHAT_FONT_SIZE_VAR).trim();
  return `${width}:${fontSize}`;
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
  if (!signature || measurements.length === 0) return;

  timelineMeasurementCache.delete(threadId);
  timelineMeasurementCache.set(threadId, { signature, measurements });
  if (timelineMeasurementCache.size > MAX_TIMELINE_CACHE_ENTRIES) {
    const oldestThreadId = timelineMeasurementCache.keys().next().value;
    if (oldestThreadId !== undefined) timelineMeasurementCache.delete(oldestThreadId);
  }
}

export function clearTimelineMeasurementCache(): void {
  timelineMeasurementCache.clear();
}
