import { type EventTimingEntryLike, type LongTaskEntryLike } from "./performanceEntryAdapters";

/** Event Timing `durationThreshold` floor (W3C Event Timing §3.3 step 5). */
export const EVENT_TIMING_DURATION_THRESHOLD_MS = 16;
/**
 * This module's own conservative normalization step. The spec rounds delivered
 * entry `duration` to the nearest 8 ms but does not require quantizing the
 * configured `durationThreshold`; rounding the request up to an 8 ms multiple
 * is local policy that keeps the published effective threshold from being
 * rounded below our request.
 */
export const EVENT_TIMING_DURATION_QUANTUM_MS = 8;

export interface EventTimingDurationThreshold {
  /** Caller-configured value after finite validation; never null. */
  readonly requestedMs: number;
  /**
   * `requestedMs` rounded up to an 8 ms multiple and the 16 ms floor by this
   * module's conservative normalization. This is the value passed to
   * `observe()`, so the published threshold is never below the request.
   */
  readonly effectiveMs: number;
}

/**
 * Validates and normalizes a configured `durationThreshold`. Non-finite and
 * non-positive values fall back to the 16 ms floor instead of being published.
 */
export function resolveEventTimingDurationThresholdMs(
  configured: unknown,
): EventTimingDurationThreshold {
  const requestedMs =
    typeof configured === "number" && Number.isFinite(configured) && configured > 0
      ? configured
      : EVENT_TIMING_DURATION_THRESHOLD_MS;
  const effectiveMs = Math.max(
    EVENT_TIMING_DURATION_THRESHOLD_MS,
    Math.ceil(requestedMs / EVENT_TIMING_DURATION_QUANTUM_MS) * EVENT_TIMING_DURATION_QUANTUM_MS,
  );
  return { requestedMs, effectiveMs };
}

/**
 * Observer availability, so "no samples" cannot be confused with "unsupported"
 * or with a measured zero:
 * - `not-installed`: diagnostics were constructed but no observer was
 *   installed (inert module or direct unit construction).
 * - `unsupported`: `PerformanceObserver` is missing or the entry type is not
 *   supported; sample counts stay 0 and mean nothing.
 * - `supported`: the observer is installed; `sampleCount === 0` means no entry
 *   was delivered in the observed window, never that interactions were fast.
 */
export type RendererPerfObserverStatus = "not-installed" | "unsupported" | "supported";

export interface RendererPerfEventTimingObserverState {
  readonly status: RendererPerfObserverStatus;
  /** Caller-configured threshold after validation; null unless installed. */
  readonly requestedDurationThresholdMs: number | null;
  /** Normalized threshold passed to `observe()`; null unless installed. */
  readonly durationThresholdMs: number | null;
  /** Valid entries recorded (observer callback or direct recorder calls). */
  readonly sampleCount: number;
  /** Entries rejected as malformed. */
  readonly skippedEntryCount: number;
}

export interface RendererPerfLongTaskObserverState {
  readonly status: RendererPerfObserverStatus;
  readonly sampleCount: number;
  readonly skippedEntryCount: number;
}

/** Recording and state-reporting surface an observer installation drives. */
export interface PerformanceObserverSink {
  recordEventTimingEntries(entries: readonly EventTimingEntryLike[]): void;
  recordLongTaskEntries(entries: readonly LongTaskEntryLike[]): void;
  markEventTimingObserver(
    status: "supported" | "unsupported",
    thresholds: EventTimingDurationThreshold | null,
  ): void;
  markLongTaskObserver(status: "supported" | "unsupported"): void;
}

/** Event Timing extension the DOM lib does not declare (W3C Event Timing §3.3). */
interface EventTimingObserverInit extends PerformanceObserverInit {
  readonly durationThreshold: number;
}

/**
 * Installs the Event Timing and `longtask` observers and returns a disposer
 * that disconnects both. `PerformanceObserver.observe()` may silently no-op
 * (or only warn) for an entry type the platform does not support, so
 * `PerformanceObserver.supportedEntryTypes` is consulted when the platform
 * exposes it; without that static list the guarded `observe()` call is the
 * only available signal. Each type's result is reported to the sink
 * separately, so one missing feature never marks the other unsupported.
 */
export function installPerformanceObservers(
  sink: PerformanceObserverSink,
  thresholds: EventTimingDurationThreshold,
): () => void {
  const observers: PerformanceObserver[] = [];
  if (typeof PerformanceObserver !== "function") {
    sink.markEventTimingObserver("unsupported", null);
    sink.markLongTaskObserver("unsupported");
    return () => undefined;
  }
  const supported = supportedEntryTypes();
  const eventTimingInit: EventTimingObserverInit = {
    type: "event",
    buffered: false,
    durationThreshold: thresholds.effectiveMs,
  };
  const eventTimingInstalled = installObserver(
    supported,
    "event",
    observers,
    (list) => sink.recordEventTimingEntries(list.getEntries() as readonly EventTimingEntryLike[]),
    eventTimingInit,
  );
  sink.markEventTimingObserver(
    eventTimingInstalled ? "supported" : "unsupported",
    eventTimingInstalled ? thresholds : null,
  );
  const longTaskInstalled = installObserver(
    supported,
    "longtask",
    observers,
    (list) => sink.recordLongTaskEntries(list.getEntries() as readonly LongTaskEntryLike[]),
    { type: "longtask", buffered: false },
  );
  sink.markLongTaskObserver(longTaskInstalled ? "supported" : "unsupported");
  return () => {
    for (const observer of observers.splice(0)) disconnectQuietly(observer);
  };
}

function supportedEntryTypes(): readonly string[] | null {
  const supported = (PerformanceObserver as { supportedEntryTypes?: unknown }).supportedEntryTypes;
  return Array.isArray(supported)
    ? supported.filter((type): type is string => typeof type === "string")
    : null;
}

function installObserver(
  supported: readonly string[] | null,
  entryType: string,
  observers: PerformanceObserver[],
  callback: (list: PerformanceObserverEntryList) => void,
  init: PerformanceObserverInit,
): boolean {
  if (supported !== null && !supported.includes(entryType)) return false;
  let observer: PerformanceObserver | undefined;
  try {
    observer = new PerformanceObserver(callback);
    observer.observe(init);
    observers.push(observer);
    return true;
  } catch {
    if (observer !== undefined) disconnectQuietly(observer);
    return false;
  }
}

function disconnectQuietly(observer: PerformanceObserver): void {
  try {
    observer.disconnect();
  } catch {
    // A failing disconnect must not throw out of controller disposal.
  }
}
