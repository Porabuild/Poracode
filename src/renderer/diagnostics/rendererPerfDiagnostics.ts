import { PerfRingBuffer } from "./perfRingBuffer";
import {
  adaptEventTimingEntry,
  adaptLongTaskEntry,
  type EventTimingEntryLike,
  type LongTaskEntryLike,
  type RendererPerfEventTimingRecord,
  type RendererPerfLongTaskRecord,
} from "./performanceEntryAdapters";
import {
  installPerformanceObservers,
  resolveEventTimingDurationThresholdMs,
  type EventTimingDurationThreshold,
  type RendererPerfEventTimingObserverState,
  type RendererPerfLongTaskObserverState,
} from "./performanceObserverInstall";

export type {
  EventTimingEntryLike,
  LongTaskEntryLike,
  RendererPerfEventTimingRecord,
  RendererPerfLongTaskRecord,
} from "./performanceEntryAdapters";
export type {
  EventTimingDurationThreshold,
  PerformanceObserverSink,
  RendererPerfEventTimingObserverState,
  RendererPerfLongTaskObserverState,
  RendererPerfObserverStatus,
} from "./performanceObserverInstall";

/**
 * Renderer-side performance diagnostics for the Gate 4 measurement sessions
 * (S4 UI budgets): rAF cadence, event input delay, long tasks, and
 * mark/measure spans around the runtime drain / apply / transport paths.
 *
 * Contamination-safe by construction:
 * - Inert unless explicitly requested (see {@link isRendererPerfDiagnosticsRequested}).
 *   Production runs are untouched: no observers, no frame loop, no marks.
 * - Everything is event-driven into count-capped ring buffers (drop-oldest);
 *   nothing is written on a timer and nothing leaves the renderer until a
 *   CDP evaluation reads {@link RendererPerfDiagnostics.snapshot} after the
 *   measured window closes.
 *
 * Measurement format boundary (audited for A0): the snapshot is read live
 * over CDP from `window.__poracodePerfDiagnostics`. No product state is
 * persisted from it, but the CDP qualification harness reads the live
 * snapshot and may save it as run evidence, so readers must treat unknown
 * fields as optional. `formatVersion` stays 2: the A0 observer-state and
 * event-duration fields are additions within that format.
 *
 * Sampling semantics (must travel with every report):
 * - Event Timing samples are event-level and censored. The platform delivers
 *   an entry only when its `duration` meets the effective `durationThreshold`,
 *   so delivered samples never cover all interactions and
 *   `sampleCount === 0` means "nothing delivered", not zero latency.
 * - Samples retain `name` and `interactionId` where the platform provides
 *   them. Interaction-level maxima (INP-style) require grouping by
 *   `interactionId`; a percentile over delivered events is not a percentile
 *   over interactions.
 * - Record timestamps are `performance.now()` monotonic values and the
 *   snapshot carries `performance.timeOrigin` so a consumer derives
 *   `epochMs = timeOriginEpochMs + monotonicMs`. `startedMonotonicMs`-style
 *   offsets are not used anywhere.
 */

/** Query parameter that opts a renderer into the diagnostics (`?poracodePerfDiag=1`). */
export const RENDERER_PERF_DIAG_QUERY_KEY = "poracodePerfDiag";
/** localStorage flag that keeps the diagnostics enabled across reloads (`poracode-perf-diag=1`). */
export const RENDERER_PERF_DIAG_STORAGE_KEY = "poracode-perf-diag";

/** Snapshot shape version; bump for any field or semantics change. */
export const RENDERER_PERF_DIAG_FORMAT_VERSION = 2;
/** 120 Hz frame opportunity budget (S4 gate reference). */
export const RENDERER_FRAME_BUDGET_MS = 1000 / 120;
const DEFAULT_SPAN_CAPACITY = 512;
const DEFAULT_EVENT_TIMING_CAPACITY = 256;
const DEFAULT_LONG_TASK_CAPACITY = 64;
const DEFAULT_SLOW_FRAME_CAPACITY = 128;
const MAX_TRACKED_PHASES = 8;
const MAX_SPAN_NAMES_PER_PHASE = 32;
const DEFAULT_PHASE = "session";

export interface RendererPerfSpanRecord {
  readonly name: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly detail?: Readonly<Record<string, number | string | boolean>>;
}

export interface RendererPerfSlowFrameRecord {
  readonly atMs: number;
  readonly deltaMs: number;
}

export interface RendererPerfPhaseAggregate {
  frames: number;
  onTimeFrames: number;
  maxFrameDeltaMs: number | null;
  spans: Record<string, { count: number; totalMs: number; maxMs: number }>;
  eventTimings: {
    count: number;
    maxInputDelayMs: number | null;
    maxProcessingMs: number | null;
    /**
     * Max delivered entry `duration`: event-level and threshold-censored, not
     * an interaction percentile. The name is retained for recorded-evidence
     * compatibility; group `recentEventTimings` by `interactionId` for
     * interaction-level figures.
     */
    maxInteractionDurationMs: number | null;
  };
  longTasks: { count: number; maxDurationMs: number | null };
}

export interface RendererPerfSnapshot {
  readonly formatVersion: typeof RENDERER_PERF_DIAG_FORMAT_VERSION;
  readonly phase: string;
  readonly frameBudgetMs: number;
  readonly timeOriginEpochMs: number | null;
  readonly startedMonotonicMs: number;
  readonly capturedAtMonotonicMs: number;
  readonly phases: Record<string, RendererPerfPhaseAggregate>;
  readonly observers: {
    readonly eventTiming: RendererPerfEventTimingObserverState;
    readonly longTask: RendererPerfLongTaskObserverState;
  };
  readonly recentSpans: RendererPerfSpanRecord[];
  readonly droppedSpans: number;
  readonly recentEventTimings: RendererPerfEventTimingRecord[];
  readonly droppedEventTimings: number;
  readonly recentLongTasks: RendererPerfLongTaskRecord[];
  readonly droppedLongTasks: number;
  readonly recentSlowFrames: RendererPerfSlowFrameRecord[];
  readonly droppedSlowFrames: number;
}

export interface RendererPerfSpanHandle {
  end(detail?: Readonly<Record<string, number | string | boolean>>): void;
}

export interface RendererPerfDiagnosticsOptions {
  readonly frameBudgetMs?: number;
  readonly spanCapacity?: number;
  readonly eventTimingCapacity?: number;
  readonly longTaskCapacity?: number;
  readonly slowFrameCapacity?: number;
  /**
   * Event Timing `durationThreshold` request. Non-finite values fall back to
   * the 16 ms floor; the effective value is rounded up to an 8 ms multiple by
   * this module's own conservative normalization (the spec quantizes entry
   * durations, not the requested threshold), and the snapshot publishes both
   * the requested and effective values.
   */
  readonly eventTimingDurationThresholdMs?: number;
  /** Monotonic clock; defaults to `performance.now()` when available. */
  readonly now?: () => number;
  /** Animation-frame scheduler; the callback receives the frame timestamp. */
  readonly scheduleFrame?: (callback: (now: number) => void) => number;
  readonly cancelFrame?: (handle: number) => void;
}

interface PhaseFrameState {
  frames: number;
  onTimeFrames: number;
  maxFrameDeltaMs: number | null;
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

function maxOrNull(current: number | null, value: number): number {
  return current === null ? value : Math.max(current, value);
}

export class RendererPerfDiagnostics {
  private readonly frameBudgetMs: number;
  readonly eventTimingDurationThresholds: EventTimingDurationThreshold;
  private readonly nowFn: () => number;
  private readonly scheduleFrameFn: ((callback: (now: number) => void) => number) | undefined;
  private readonly cancelFrameFn: ((handle: number) => void) | undefined;
  private readonly spanRing: PerfRingBuffer<RendererPerfSpanRecord>;
  private readonly eventTimingRing: PerfRingBuffer<RendererPerfEventTimingRecord>;
  private readonly longTaskRing: PerfRingBuffer<RendererPerfLongTaskRecord>;
  private readonly slowFrameRing: PerfRingBuffer<RendererPerfSlowFrameRecord>;
  private readonly phases = new Map<string, RendererPerfPhaseAggregate>();
  private readonly frameState = new Map<string, PhaseFrameState>();
  private readonly eventTimingObserver: Mutable<RendererPerfEventTimingObserverState> = {
    status: "not-installed",
    requestedDurationThresholdMs: null,
    durationThresholdMs: null,
    sampleCount: 0,
    skippedEntryCount: 0,
  };
  private readonly longTaskObserver: Mutable<RendererPerfLongTaskObserverState> = {
    status: "not-installed",
    sampleCount: 0,
    skippedEntryCount: 0,
  };
  private phase = DEFAULT_PHASE;
  private readonly startedAtMs: number;
  private lastFrameAtMs: number | null = null;
  private frameLoopHandle: number | null = null;
  private disposed = false;

  constructor(options: RendererPerfDiagnosticsOptions = {}) {
    this.frameBudgetMs = options.frameBudgetMs ?? RENDERER_FRAME_BUDGET_MS;
    this.eventTimingDurationThresholds = resolveEventTimingDurationThresholdMs(
      options.eventTimingDurationThresholdMs,
    );
    this.nowFn = options.now ?? defaultMonotonicNow;
    this.scheduleFrameFn = options.scheduleFrame;
    this.cancelFrameFn = options.cancelFrame;
    this.spanRing = new PerfRingBuffer(options.spanCapacity ?? DEFAULT_SPAN_CAPACITY);
    this.eventTimingRing = new PerfRingBuffer(
      options.eventTimingCapacity ?? DEFAULT_EVENT_TIMING_CAPACITY,
    );
    this.longTaskRing = new PerfRingBuffer(options.longTaskCapacity ?? DEFAULT_LONG_TASK_CAPACITY);
    this.slowFrameRing = new PerfRingBuffer(
      options.slowFrameCapacity ?? DEFAULT_SLOW_FRAME_CAPACITY,
    );
    this.startedAtMs = this.nowFn();
  }

  // ── Phase windows ─────────────────────────────────────────────

  /**
   * Names the phase subsequent observations belong to (the harness sets this
   * over CDP before each measured window). Phases are retained up to
   * {@link MAX_TRACKED_PHASES} names; the oldest aggregate is dropped beyond
   * that so a pathological caller cannot grow the snapshot.
   */
  setPhase(name: string): void {
    const normalized = name.length > 0 ? name : DEFAULT_PHASE;
    this.phase = normalized;
    this.ensurePhase(normalized);
  }

  // ── Frame cadence ─────────────────────────────────────────────

  /**
   * One animation-frame opportunity. `now` is the monotonic timestamp the
   * frame callback received; the delta against the previous frame classifies
   * the opportunity against the 120 Hz budget.
   */
  handleFrame(now: number): void {
    const last = this.lastFrameAtMs;
    this.lastFrameAtMs = now;
    if (last === null) return;
    const deltaMs = Math.max(0, now - last);
    const state = this.ensureFrameState(this.phase);
    state.frames += 1;
    if (deltaMs <= this.frameBudgetMs) state.onTimeFrames += 1;
    else {
      state.maxFrameDeltaMs =
        state.maxFrameDeltaMs === null ? deltaMs : Math.max(state.maxFrameDeltaMs, deltaMs);
      this.slowFrameRing.push({ atMs: now, deltaMs });
    }
  }

  /** Starts the rAF cadence loop. Without an injected scheduler this is a no-op. */
  startFrameMonitor(): void {
    if (this.frameLoopHandle !== null || !this.scheduleFrameFn || this.disposed) return;
    const tick = (now: number): void => {
      if (this.disposed) return;
      this.handleFrame(now);
      this.frameLoopHandle = this.scheduleFrameFn?.(tick) ?? null;
    };
    this.frameLoopHandle = this.scheduleFrameFn(tick);
  }

  stopFrameMonitor(): void {
    if (this.frameLoopHandle !== null && this.cancelFrameFn)
      this.cancelFrameFn(this.frameLoopHandle);
    this.frameLoopHandle = null;
  }

  // ── Spans ─────────────────────────────────────────────────────

  beginSpan(name: string): RendererPerfSpanHandle {
    const startedAt = this.nowFn();
    markPerformance(name);
    return {
      end: (detail?: Readonly<Record<string, number | string | boolean>>): void => {
        if (this.disposed) return;
        const durationMs = Math.max(0, this.nowFn() - startedAt);
        measurePerformance(name, startedAt, durationMs);
        this.recordSpan(name, startedAt, durationMs, detail);
      },
    };
  }

  recordSpan(
    name: string,
    startMs: number,
    durationMs: number,
    detail?: Readonly<Record<string, number | string | boolean>>,
  ): void {
    if (this.disposed) return;
    this.spanRing.push({ name, startMs, durationMs, ...(detail ? { detail } : {}) });
    const phase = this.ensurePhase(this.phase);
    if (Object.keys(phase.spans).length < MAX_SPAN_NAMES_PER_PHASE || phase.spans[name]) {
      const aggregate = phase.spans[name] ?? { count: 0, totalMs: 0, maxMs: 0 };
      aggregate.count += 1;
      aggregate.totalMs += durationMs;
      aggregate.maxMs = Math.max(aggregate.maxMs, durationMs);
      phase.spans[name] = aggregate;
    }
  }

  // ── Event timing / long tasks ─────────────────────────────────

  /**
   * Direct Event Timing recording from standards timestamps. Validation and
   * clamping match the observer path ({@link adaptEventTimingEntry}), so a
   * malformed call is counted as skipped instead of entering the snapshot as
   * `NaN`. Direct calls carry no entry `name`/`interactionId`; prefer
   * {@link recordEventTimingEntries} for platform entries.
   */
  recordEventTiming(
    startMs: number,
    processingStartMs: number,
    processingEndMs: number,
    durationMs: number | null = null,
  ): void {
    if (this.disposed) return;
    this.acceptEventTimingEntry({
      startTime: startMs,
      processingStart: processingStartMs,
      processingEnd: processingEndMs,
      duration: durationMs,
    });
  }

  /** Feeds a batch of standards-shaped Event Timing entries (observer callback path). */
  recordEventTimingEntries(entries: readonly EventTimingEntryLike[]): void {
    if (this.disposed) return;
    for (const entry of entries) this.acceptEventTimingEntry(entry);
  }

  private acceptEventTimingEntry(entry: EventTimingEntryLike): void {
    const record = adaptEventTimingEntry(entry);
    if (!record) {
      this.eventTimingObserver.skippedEntryCount += 1;
      return;
    }
    this.pushEventTimingRecord(record);
  }

  private pushEventTimingRecord(record: RendererPerfEventTimingRecord): void {
    this.eventTimingRing.push(record);
    this.eventTimingObserver.sampleCount += 1;
    const phase = this.ensurePhase(this.phase);
    phase.eventTimings.count += 1;
    phase.eventTimings.maxInputDelayMs = maxOrNull(
      phase.eventTimings.maxInputDelayMs,
      record.inputDelayMs,
    );
    phase.eventTimings.maxProcessingMs = maxOrNull(
      phase.eventTimings.maxProcessingMs,
      record.processingMs,
    );
    if (record.interactionDurationMs !== null) {
      phase.eventTimings.maxInteractionDurationMs = maxOrNull(
        phase.eventTimings.maxInteractionDurationMs,
        record.interactionDurationMs,
      );
    }
  }

  /** Direct long-task recording; malformed calls are counted, never coerced. */
  recordLongTask(startMs: number, durationMs: number): void {
    if (this.disposed) return;
    this.acceptLongTaskEntry({ startTime: startMs, duration: durationMs });
  }

  /** Feeds a batch of standards-shaped `longtask` entries. */
  recordLongTaskEntries(entries: readonly LongTaskEntryLike[]): void {
    if (this.disposed) return;
    for (const entry of entries) this.acceptLongTaskEntry(entry);
  }

  private acceptLongTaskEntry(entry: LongTaskEntryLike): void {
    const record = adaptLongTaskEntry(entry);
    if (!record) {
      this.longTaskObserver.skippedEntryCount += 1;
      return;
    }
    this.pushLongTaskRecord(record);
  }

  private pushLongTaskRecord(record: RendererPerfLongTaskRecord): void {
    this.longTaskRing.push(record);
    this.longTaskObserver.sampleCount += 1;
    const phase = this.ensurePhase(this.phase);
    phase.longTasks.count += 1;
    phase.longTasks.maxDurationMs = maxOrNull(phase.longTasks.maxDurationMs, record.durationMs);
  }

  /**
   * Installation result wiring for {@link installPerformanceObservers}; public
   * so the snapshot can distinguish unsupported, no-sample and measured zero.
   */
  markEventTimingObserver(
    status: "supported" | "unsupported",
    thresholds: EventTimingDurationThreshold | null,
  ): void {
    this.eventTimingObserver.status = status;
    const effective = status === "supported" ? thresholds : null;
    this.eventTimingObserver.requestedDurationThresholdMs = effective?.requestedMs ?? null;
    this.eventTimingObserver.durationThresholdMs = effective?.effectiveMs ?? null;
  }

  /** Installation result wiring for {@link installPerformanceObservers}. */
  markLongTaskObserver(status: "supported" | "unsupported"): void {
    this.longTaskObserver.status = status;
  }

  /** Zero-duration point event (e.g. large-reply completion) at the current time. */
  recordPoint(name: string, detail: Readonly<Record<string, number | string | boolean>>): void {
    this.recordSpan(name, this.nowFn(), 0, detail);
  }

  // ── Snapshot ──────────────────────────────────────────────────

  snapshot(): RendererPerfSnapshot {
    const capturedAtMonotonicMs = this.nowFn();
    const phases: Record<string, RendererPerfPhaseAggregate> = {};
    for (const [name, aggregate] of this.phases) {
      const frames = this.frameState.get(name);
      phases[name] = {
        ...aggregate,
        spans: Object.fromEntries(
          Object.entries(aggregate.spans).map(([spanName, span]) => [spanName, { ...span }]),
        ),
        eventTimings: { ...aggregate.eventTimings },
        longTasks: { ...aggregate.longTasks },
        frames: frames?.frames ?? 0,
        onTimeFrames: frames?.onTimeFrames ?? 0,
        maxFrameDeltaMs: frames?.maxFrameDeltaMs ?? null,
      };
    }
    return {
      formatVersion: RENDERER_PERF_DIAG_FORMAT_VERSION,
      phase: this.phase,
      frameBudgetMs: this.frameBudgetMs,
      timeOriginEpochMs: defaultTimeOriginEpochMs(),
      startedMonotonicMs: this.startedAtMs,
      capturedAtMonotonicMs,
      phases,
      observers: {
        eventTiming: { ...this.eventTimingObserver },
        longTask: { ...this.longTaskObserver },
      },
      recentSpans: this.spanRing.toArray(),
      droppedSpans: this.spanRing.droppedCount,
      recentEventTimings: this.eventTimingRing.toArray(),
      droppedEventTimings: this.eventTimingRing.droppedCount,
      recentLongTasks: this.longTaskRing.toArray(),
      droppedLongTasks: this.longTaskRing.droppedCount,
      recentSlowFrames: this.slowFrameRing.toArray(),
      droppedSlowFrames: this.slowFrameRing.droppedCount,
    };
  }

  dispose(): void {
    this.disposed = true;
    this.stopFrameMonitor();
  }

  private ensurePhase(name: string): RendererPerfPhaseAggregate {
    let phase = this.phases.get(name);
    if (!phase) {
      if (this.phases.size >= MAX_TRACKED_PHASES) {
        const oldest = this.phases.keys().next().value;
        if (oldest !== undefined) {
          this.phases.delete(oldest);
          this.frameState.delete(oldest);
        }
      }
      phase = {
        frames: 0,
        onTimeFrames: 0,
        maxFrameDeltaMs: null,
        spans: {},
        eventTimings: {
          count: 0,
          maxInputDelayMs: null,
          maxProcessingMs: null,
          maxInteractionDurationMs: null,
        },
        longTasks: { count: 0, maxDurationMs: null },
      };
      this.phases.set(name, phase);
    }
    return phase;
  }

  private ensureFrameState(name: string): PhaseFrameState {
    this.ensurePhase(name);
    let state = this.frameState.get(name);
    if (!state) {
      state = { frames: 0, onTimeFrames: 0, maxFrameDeltaMs: null };
      this.frameState.set(name, state);
    }
    return state;
  }
}

const NOOP_SPAN: RendererPerfSpanHandle = { end: () => undefined };

let active: RendererPerfDiagnostics | undefined;

/** The active diagnostics instance, or undefined when the module is inert. */
export function activeRendererPerfDiagnostics(): RendererPerfDiagnostics | undefined {
  return active;
}

/** Begin a span against the active diagnostics; a no-op handle when inert. */
export function beginRendererPerfSpan(name: string): RendererPerfSpanHandle {
  return active?.beginSpan(name) ?? NOOP_SPAN;
}

/** Record a zero-duration point event (e.g. large-reply completion); no-op when inert. */
export function noteRendererPerfEvent(
  name: string,
  detail: Readonly<Record<string, number | string | boolean>>,
): void {
  active?.recordPoint(name, detail);
}

function defaultMonotonicNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function defaultTimeOriginEpochMs(): number | null {
  return typeof performance !== "undefined" && Number.isFinite(performance.timeOrigin)
    ? performance.timeOrigin
    : null;
}

function markPerformance(name: string): void {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  try {
    performance.mark(`poracode:perf-diag:${name}`);
  } catch {
    // Marks are cosmetic; a failing user-timing implementation must not
    // turn the monitor itself into a fault.
  }
}

function measurePerformance(name: string, startMs: number, durationMs: number): void {
  if (typeof performance === "undefined" || typeof performance.measure !== "function") return;
  try {
    performance.measure(`poracode:perf-diag:${name}`, {
      start: startMs,
      duration: durationMs,
    });
  } catch {
    // See markPerformance.
  }
}

/**
 * True when the current renderer explicitly requested the diagnostics via the
 * `?poracodePerfDiag=1` query parameter or the `poracode-perf-diag=1`
 * localStorage flag. Anything else — including any production default — keeps
 * the module inert.
 */
export function isRendererPerfDiagnosticsRequested(
  environment: { query?: string; storage?: Pick<Storage, "getItem"> | null } = {},
): boolean {
  let query: string | undefined;
  let storage: Pick<Storage, "getItem"> | null | undefined;
  if (environment.query !== undefined || environment.storage !== undefined) {
    query = environment.query;
    storage = environment.storage;
  } else if (typeof window !== "undefined") {
    try {
      query = window.location.search;
      storage = window.localStorage;
    } catch {
      return false;
    }
  } else {
    return false;
  }
  try {
    if (query !== undefined && new URLSearchParams(query).get(RENDERER_PERF_DIAG_QUERY_KEY) === "1")
      return true;
    return storage?.getItem(RENDERER_PERF_DIAG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export interface RendererPerfDiagnosticsController {
  readonly diagnostics: RendererPerfDiagnostics;
  dispose(): void;
}

/**
 * Starts the renderer diagnostics when requested and exports the CDP-evaluable
 * snapshot handle on `window.__poracodePerfDiagnostics` (plain data only, same
 * discipline as the harness probes). Returns undefined when not requested, so
 * production renders never construct an observer or a frame loop.
 */
export function startRendererPerfDiagnostics(
  options: RendererPerfDiagnosticsOptions & {
    /** Overrides request detection (tests pass `true` with injected clocks). */
    readonly requested?: boolean;
    readonly target?: { __poracodePerfDiagnostics?: unknown };
  } = {},
): RendererPerfDiagnosticsController | undefined {
  const requested = options.requested ?? isRendererPerfDiagnosticsRequested();
  if (!requested || active) return undefined;
  const diagnostics = new RendererPerfDiagnostics(options);
  active = diagnostics;
  const disconnectObservers = installPerformanceObservers(
    diagnostics,
    diagnostics.eventTimingDurationThresholds,
  );
  diagnostics.startFrameMonitor();
  const target = (options.target ?? (typeof window !== "undefined" ? window : undefined)) as
    | { __poracodePerfDiagnostics?: unknown }
    | undefined;
  const exposedHandle = {
    snapshot: () => diagnostics.snapshot(),
    setPhase: (name: string) => diagnostics.setPhase(name),
  };
  if (target) target.__poracodePerfDiagnostics = exposedHandle;
  return {
    diagnostics,
    dispose: () => {
      // Idempotent and identity-safe: only this controller's own handle is
      // removed, so re-disposing a stale controller cannot unpublish a newer
      // active one.
      if (active === diagnostics) active = undefined;
      disconnectObservers();
      diagnostics.dispose();
      if (target && target.__poracodePerfDiagnostics === exposedHandle) {
        delete target.__poracodePerfDiagnostics;
      }
    },
  };
}

declare global {
  interface Window {
    /** CDP-evaluable diagnostics snapshot handle; present only while the monitor is active. */
    __poracodePerfDiagnostics?: {
      snapshot(): RendererPerfSnapshot;
      setPhase(name: string): void;
    };
  }
}
