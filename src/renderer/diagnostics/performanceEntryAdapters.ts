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

/** One script that ran in a long animation frame (`PerformanceScriptTiming`). */
export interface RendererPerfFrameScriptRecord {
  /** What called the script, e.g. `DOMWindow.onmessage` or `HTMLElement.onclick`. */
  readonly invoker: string | null;
  readonly invokerType: string | null;
  /** Bundle file name only: directories (user paths), query and hash are dropped. */
  readonly sourceFile: string | null;
  readonly sourceFunctionName: string | null;
  readonly sourceCharPosition: number | null;
  readonly durationMs: number;
  readonly forcedStyleAndLayoutMs: number | null;
}

/**
 * One long animation frame (W3C Long Animation Frames). Unlike a `longtask`
 * entry it attributes the frame to the scripts that ran in it, so a stalled
 * interaction can be traced to code instead of only being timed.
 */
export interface RendererPerfLongAnimationFrameRecord {
  readonly startMs: number;
  readonly durationMs: number;
  /** Time beyond 50 ms that could delay input; null when the entry has none. */
  readonly blockingDurationMs: number | null;
  /** Style, layout and paint at the end of the frame; null when absent. */
  readonly renderMs: number | null;
  /** Longest first, at most {@link MAX_FRAME_SCRIPTS}. */
  readonly scripts: readonly RendererPerfFrameScriptRecord[];
}

/** Structural `PerformanceLongAnimationFrameTiming` shape. */
export interface LongAnimationFrameEntryLike {
  readonly startTime?: unknown;
  readonly duration?: unknown;
  readonly blockingDuration?: unknown;
  readonly renderStart?: unknown;
  readonly scripts?: unknown;
}

export const MAX_FRAME_SCRIPTS = 5;
const MAX_ATTRIBUTION_TEXT = 160;

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

function nonNegative(value: unknown): number | null {
  return isFiniteNumber(value) && value >= 0 ? value : null;
}

function attributionText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0
    ? value.slice(0, MAX_ATTRIBUTION_TEXT)
    : null;
}

/** File name of a script URL or path; never its directories, query or hash. */
export function sourceFileName(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const path = value.split(/[?#]/u, 1)[0] ?? "";
  const name = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
  return attributionText(name);
}

function adaptFrameScript(script: unknown): RendererPerfFrameScriptRecord | null {
  if (typeof script !== "object" || script === null) return null;
  const fields = script as Record<string, unknown>;
  const durationMs = nonNegative(fields.duration);
  if (durationMs === null) return null;
  // Script-evaluation invokers are the script URL itself; keep only its name.
  const invoker =
    typeof fields.invoker === "string" && /^(?:[a-z][a-z0-9+.-]*:|[/\\])/iu.test(fields.invoker)
      ? sourceFileName(fields.invoker)
      : attributionText(fields.invoker);
  return {
    invoker,
    invokerType: attributionText(fields.invokerType),
    sourceFile: sourceFileName(fields.sourceURL),
    sourceFunctionName: attributionText(fields.sourceFunctionName),
    sourceCharPosition: nonNegative(fields.sourceCharPosition),
    durationMs,
    forcedStyleAndLayoutMs: nonNegative(fields.forcedStyleAndLayoutDuration),
  };
}

/** Adapts one `long-animation-frame` entry; null when its timing is malformed. */
export function adaptLongAnimationFrameEntry(
  entry: LongAnimationFrameEntryLike,
): RendererPerfLongAnimationFrameRecord | null {
  if (!isFiniteNumber(entry.startTime) || !isFiniteNumber(entry.duration)) return null;
  if (entry.duration < 0) return null;
  const endMs = entry.startTime + entry.duration;
  const renderMs =
    isFiniteNumber(entry.renderStart) &&
    entry.renderStart >= entry.startTime &&
    entry.renderStart <= endMs
      ? endMs - entry.renderStart
      : null;
  const scripts = (Array.isArray(entry.scripts) ? entry.scripts : [])
    .map(adaptFrameScript)
    .filter((script): script is RendererPerfFrameScriptRecord => script !== null)
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, MAX_FRAME_SCRIPTS);
  return {
    startMs: entry.startTime,
    durationMs: entry.duration,
    blockingDurationMs: nonNegative(entry.blockingDuration),
    renderMs,
    scripts,
  };
}
