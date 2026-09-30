/**
 * Structural adapters from standards-shaped performance entries to the
 * diagnostics record shapes. The TypeScript DOM lib does not carry every
 * Event Timing member, so entries are read structurally and validated field
 * by field; a malformed entry returns null and is counted by the recorder
 * instead of being coerced into a zero.
 *
 * Event Timing entries are event-level and censored: the platform delivers an
 * entry only when its `duration` meets the observer's effective
 * `durationThreshold` (see ./performanceObserverInstall). A percentile over
 * delivered events is therefore never a percentile over all interactions;
 * interaction-level maxima require grouping by `interactionId` first.
 */

/** One validated Event Timing sample. */
export interface RendererPerfEventTimingRecord {
  /** Entry `name` (the event type, e.g. `click`); null when absent. */
  readonly name: string | null;
  /**
   * Event Timing `interactionId`: 0 when the event belongs to no interaction,
   * positive for an interaction's events, null when the entry carries none.
   * Group samples by this id before computing interaction-level maxima.
   */
  readonly interactionId: number | null;
  /** Entry `startTime`: the event's hardware timestamp. */
  readonly startMs: number;
  /** Input delay: `processingStart - startTime`. */
  readonly inputDelayMs: number;
  /** Synchronous handler time: `processingEnd - processingStart`. */
  readonly processingMs: number;
  /**
   * Entry `duration`: `startTime` to the rendering update after dispatch,
   * rounded by the platform to 8 ms. Event-level, not an interaction
   * percentile; a measured `0` stays 0 and null means the entry carried no
   * usable duration.
   */
  readonly interactionDurationMs: number | null;
}

export interface RendererPerfLongTaskRecord {
  readonly startMs: number;
  readonly durationMs: number;
}

/** Structural `PerformanceEventTiming` shape (W3C Event Timing §2.1). */
export interface EventTimingEntryLike {
  readonly name?: unknown;
  readonly startTime?: unknown;
  readonly processingStart?: unknown;
  readonly processingEnd?: unknown;
  readonly duration?: unknown;
  readonly interactionId?: unknown;
}

export interface LongTaskEntryLike {
  readonly startTime?: unknown;
  readonly duration?: unknown;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Adapts one standards-shaped Event Timing entry, or null when its endpoints
 * are absent, non-finite, or out of dispatch order. `interactionDurationMs`
 * is null when the entry carries no usable duration so a missing value is
 * never reported as a measured zero.
 */
export function adaptEventTimingEntry(
  entry: EventTimingEntryLike,
): RendererPerfEventTimingRecord | null {
  const { startTime, processingStart, processingEnd } = entry;
  if (
    !isFiniteNumber(startTime) ||
    !isFiniteNumber(processingStart) ||
    !isFiniteNumber(processingEnd)
  )
    return null;
  if (processingStart < startTime || processingEnd < processingStart) return null;
  return {
    name: typeof entry.name === "string" ? entry.name : null,
    interactionId:
      isFiniteNumber(entry.interactionId) && entry.interactionId >= 0 ? entry.interactionId : null,
    startMs: startTime,
    inputDelayMs: processingStart - startTime,
    processingMs: processingEnd - processingStart,
    interactionDurationMs:
      isFiniteNumber(entry.duration) && entry.duration >= 0 ? entry.duration : null,
  };
}

/** Adapts one standards-shaped `longtask` entry; null when malformed. */
export function adaptLongTaskEntry(entry: LongTaskEntryLike): RendererPerfLongTaskRecord | null {
  if (!isFiniteNumber(entry.startTime) || !isFiniteNumber(entry.duration)) return null;
  if (entry.duration < 0) return null;
  return { startMs: entry.startTime, durationMs: entry.duration };
}
