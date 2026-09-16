import { PerfRingBuffer } from "./perfRingBuffer";

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
 * Time convention matches the node-side perf NDJSON contract
 * (tmp/v4-stream-runtime-harness/lib/perfAnalyze.mjs header): record
 * timestamps are `performance.now()` monotonic values and the snapshot
 * carries `performance.timeOrigin` so the harness derives
 * `epochMs = timeOriginEpochMs + monotonicMs`. `startedMonotonicMs`-style
 * offsets are deliberately not used anywhere.
 */

/** Query parameter that opts a renderer into the diagnostics (`?poracodePerfDiag=1`). */
export const RENDERER_PERF_DIAG_QUERY_KEY = "poracodePerfDiag";
/** localStorage flag that keeps the diagnostics enabled across reloads (`poracode-perf-diag=1`). */
export const RENDERER_PERF_DIAG_STORAGE_KEY = "poracode-perf-diag";

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

export interface RendererPerfEventTimingRecord {
  readonly startMs: number;
  readonly inputDelayMs: number;
  readonly processingMs: number;
}

export interface RendererPerfLongTaskRecord {
  readonly startMs: number;
  readonly durationMs: number;
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
  eventTimings: { count: number; maxInputDelayMs: number | null };
  longTasks: { count: number; maxDurationMs: number | null };
}

export interface RendererPerfSnapshot {
  readonly formatVersion: 1;
  readonly phase: string;
  readonly frameBudgetMs: number;
  readonly timeOriginEpochMs: number | null;
  readonly startedMonotonicMs: number;
  readonly capturedAtMonotonicMs: number;
  readonly phases: Record<string, RendererPerfPhaseAggregate>;
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

export class RendererPerfDiagnostics {
  private readonly frameBudgetMs: number;
  private readonly nowFn: () => number;
  private readonly scheduleFrameFn: ((callback: (now: number) => void) => number) | undefined;
  private readonly cancelFrameFn: ((handle: number) => void) | undefined;
  private readonly spanRing: PerfRingBuffer<RendererPerfSpanRecord>;
  private readonly eventTimingRing: PerfRingBuffer<RendererPerfEventTimingRecord>;
  private readonly longTaskRing: PerfRingBuffer<RendererPerfLongTaskRecord>;
  private readonly slowFrameRing: PerfRingBuffer<RendererPerfSlowFrameRecord>;
  private readonly phases = new Map<string, RendererPerfPhaseAggregate>();
  private readonly frameState = new Map<string, PhaseFrameState>();
  private phase = DEFAULT_PHASE;
  private readonly startedAtMs: number;
  private lastFrameAtMs: number | null = null;
  private frameLoopHandle: number | null = null;
  private disposed = false;

  constructor(options: RendererPerfDiagnosticsOptions = {}) {
    this.frameBudgetMs = options.frameBudgetMs ?? RENDERER_FRAME_BUDGET_MS;
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
   * {@link MAX_TRACKED_PHASES} names; the oldest phase aggregate is dropped
   * beyond that so a pathological caller cannot grow the snapshot.
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

  recordEventTiming(startMs: number, processingStartMs: number, processingMs: number): void {
    if (this.disposed) return;
    this.eventTimingRing.push({
      startMs,
      inputDelayMs: Math.max(0, processingStartMs - startMs),
      processingMs: Math.max(0, processingMs),
    });
    const phase = this.ensurePhase(this.phase);
    phase.eventTimings.count += 1;
    phase.eventTimings.maxInputDelayMs =
      phase.eventTimings.maxInputDelayMs === null
        ? Math.max(0, processingStartMs - startMs)
        : Math.max(phase.eventTimings.maxInputDelayMs, Math.max(0, processingStartMs - startMs));
  }

  recordLongTask(startMs: number, durationMs: number): void {
    if (this.disposed) return;
    this.longTaskRing.push({ startMs, durationMs });
    const phase = this.ensurePhase(this.phase);
    phase.longTasks.count += 1;
    phase.longTasks.maxDurationMs =
      phase.longTasks.maxDurationMs === null
        ? durationMs
        : Math.max(phase.longTasks.maxDurationMs, durationMs);
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
      formatVersion: 1,
      phase: this.phase,
      frameBudgetMs: this.frameBudgetMs,
      timeOriginEpochMs: defaultTimeOriginEpochMs(),
      startedMonotonicMs: this.startedAtMs,
      capturedAtMonotonicMs,
      phases,
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
        eventTimings: { count: 0, maxInputDelayMs: null },
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
  installPerformanceObservers(diagnostics);
  diagnostics.startFrameMonitor();
  const target = (options.target ?? (typeof window !== "undefined" ? window : undefined)) as
    | { __poracodePerfDiagnostics?: unknown }
    | undefined;
  if (target) {
    target.__poracodePerfDiagnostics = {
      snapshot: () => diagnostics.snapshot(),
      setPhase: (name: string) => diagnostics.setPhase(name),
    };
  }
  return {
    diagnostics,
    dispose: () => {
      if (active === diagnostics) active = undefined;
      diagnostics.dispose();
      if (target) delete target.__poracodePerfDiagnostics;
    },
  };
}

/**
 * EventTiming + longtask observers; both optional browser features, so each
 * install is guarded. Event-timing fields are read through a structural shape
 * (the DOM lib may not carry every EventTiming member this TypeScript lib
 * targets); malformed entries are skipped, never coerced.
 */
function installPerformanceObservers(diagnostics: RendererPerfDiagnostics): void {
  if (typeof PerformanceObserver !== "function") return;
  try {
    const eventObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const timing = entry as unknown as {
          startTime?: unknown;
          processingStart?: unknown;
          processingDuration?: unknown;
        };
        if (
          typeof timing.startTime !== "number" ||
          typeof timing.processingStart !== "number" ||
          typeof timing.processingDuration !== "number"
        )
          continue;
        diagnostics.recordEventTiming(
          timing.startTime,
          timing.processingStart,
          timing.processingDuration,
        );
      }
    });
    eventObserver.observe({ type: "event", buffered: false });
  } catch {
    // EventTiming is unavailable (or the entry type is unsupported): the
    // remaining monitors stay authoritative.
  }
  try {
    const longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        diagnostics.recordLongTask(entry.startTime, entry.duration);
      }
    });
    longTaskObserver.observe({ type: "longtask", buffered: false });
  } catch {
    // Same: longtask attribution is best-effort.
  }
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
