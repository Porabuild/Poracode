/**
 * Per-handler wall-clock timings for the opt-in performance evidence file.
 *
 * Names come from closed vocabularies (registry route ids, supervisor
 * procedure names) — never user content — and are validated against a strict
 * charset before they can enter evidence. Capture is off unless
 * `startNodePerformanceDiagnostics` enabled it, so record sites on hot paths
 * cost one boolean check in normal runs. Sampling drains the window: each
 * sample line reports only the handlers that ran since the previous line,
 * aligned with the process sampler's event-loop-delay window so a stall can
 * be attributed to the handler(s) that ran during it.
 */

export interface HandlerTimingEntry {
  readonly name: string;
  readonly count: number;
  readonly totalMs: number;
  readonly maxMs: number;
}

const MAX_NAMES = 128;
const OTHER_NAME = "other";
const NAME_PATTERN = /^[a-z][a-zA-Z0-9:_-]{0,79}$/;

interface MutableEntry {
  count: number;
  totalMs: number;
  maxMs: number;
}

export class HandlerTimingObservations {
  private readonly entries = new Map<string, MutableEntry>();

  record(name: string, durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    const key = NAME_PATTERN.test(name) ? name : OTHER_NAME;
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.entries.size >= MAX_NAMES && key !== OTHER_NAME) {
        entry = this.entries.get(OTHER_NAME) ?? { count: 0, totalMs: 0, maxMs: 0 };
        this.entries.set(OTHER_NAME, entry);
      } else {
        entry = { count: 0, totalMs: 0, maxMs: 0 };
        this.entries.set(key, entry);
      }
    }
    entry.count += 1;
    entry.totalMs += durationMs;
    if (durationMs > entry.maxMs) entry.maxMs = durationMs;
  }

  /** Window totals since the previous sample, slowest first; drains the window. */
  sample(): HandlerTimingEntry[] {
    const drained: HandlerTimingEntry[] = [...this.entries.entries()].map(([name, entry]) => ({
      name,
      count: entry.count,
      totalMs: Math.round(entry.totalMs * 1000) / 1000,
      maxMs: Math.round(entry.maxMs * 1000) / 1000,
    }));
    this.entries.clear();
    drained.sort((a, b) => b.maxMs - a.maxMs || b.totalMs - a.totalMs);
    return drained;
  }

  reset(): void {
    this.entries.clear();
  }
}

const shared = new HandlerTimingObservations();
let captureEnabled = false;

/** Called by the diagnostics lifecycle only; record sites never toggle this. */
export function setHandlerTimingCaptureEnabled(enabled: boolean): void {
  captureEnabled = enabled;
  if (!enabled) shared.reset();
}

export function recordHandlerTiming(name: string, durationMs: number): void {
  if (!captureEnabled) return;
  shared.record(name, durationMs);
}

/** Null when capture is off or nothing ran in the window (field stays absent). */
export function sampleHandlerTimings(): HandlerTimingEntry[] | null {
  if (!captureEnabled) return null;
  const entries = shared.sample();
  return entries.length > 0 ? entries : null;
}
