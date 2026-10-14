import type { NativeThreadActivityChange } from "@/shared/backendHostProtocol";
import type { SupervisorEvent } from "@/shared/ipc";

/** Flush cadence for coalesced activity deltas. */
export const NATIVE_THREAD_ACTIVITY_FLUSH_INTERVAL_MS = 50;
/** Hard cap on changes carried by one `native-thread-activity` message. */
export const NATIVE_THREAD_ACTIVITY_MAX_CHANGES_PER_MESSAGE = 512;

export interface NativeThreadActivityProjectionOptions {
  /** Sends one bounded batch to main; never called with an empty batch. */
  emit(changes: NativeThreadActivityChange[]): void;
  flushIntervalMs?: number;
  maxChangesPerMessage?: number;
  /** Timer seam for tests; returns a cancel function. */
  scheduleFlush?(run: () => void, delayMs: number): () => void;
}

function defaultSchedule(run: () => void, delayMs: number): () => void {
  const timer = setTimeout(run, delayMs);
  timer.unref?.();
  return () => clearTimeout(timer);
}

/**
 * A2 native projection: the only supervisor-derived state main still needs
 * across the process boundary. Observes `thread-state` / `thread-exited`
 * after persistence, coalesces per thread with last-writer-wins semantics,
 * and flushes a bounded delta batch at most every
 * {@link NATIVE_THREAD_ACTIVITY_FLUSH_INTERVAL_MS}. Terminal output and
 * runtime content never cross this hop; renderer windows read them from the
 * loopback WS.
 *
 * Reset safety: the projection only ever emits transitions (never a snapshot),
 * and the child emits `supervisor-reset` after a supervisor restart, which
 * makes main clear its working set. A batch that was in flight during the
 * restart can therefore only add state that the reset then clears — main can
 * never keep a stale active flag.
 */
export class NativeThreadActivityProjection {
  private readonly pending = new Map<string, boolean>();
  private cancelScheduled: (() => void) | null = null;
  private disposed = false;
  private readonly flushIntervalMs: number;
  private readonly maxChangesPerMessage: number;

  constructor(private readonly options: NativeThreadActivityProjectionOptions) {
    this.flushIntervalMs = options.flushIntervalMs ?? NATIVE_THREAD_ACTIVITY_FLUSH_INTERVAL_MS;
    this.maxChangesPerMessage =
      options.maxChangesPerMessage ?? NATIVE_THREAD_ACTIVITY_MAX_CHANGES_PER_MESSAGE;
  }

  observe(event: SupervisorEvent): void {
    if (this.disposed) return;
    if (event.type === "thread-state") {
      this.record(event.threadId, event.status === "working" || event.status === "launching");
      return;
    }
    if (event.type === "thread-exited") {
      this.record(event.threadId, false);
    }
  }

  /** Test seam: flush whatever is pending now. */
  flush(): void {
    if (this.disposed || this.pending.size === 0) return;
    this.cancelScheduled?.();
    this.cancelScheduled = null;
    const changes: NativeThreadActivityChange[] = [];
    for (const [threadId, active] of this.pending) {
      changes.push({ threadId, active });
      this.pending.delete(threadId);
      if (changes.length >= this.maxChangesPerMessage) break;
    }
    if (changes.length === 0) return;
    // A re-entrant observe() during emit schedules the next flush itself; the
    // remainder of a capped batch would otherwise wait out the interval, so
    // shorten it when no flush is already scheduled.
    this.options.emit(changes);
    if (this.pending.size > 0 && !this.cancelScheduled) this.schedule(0);
  }

  dispose(): void {
    this.disposed = true;
    this.cancelScheduled?.();
    this.cancelScheduled = null;
    this.pending.clear();
  }

  private record(threadId: string, active: boolean): void {
    if (this.pending.get(threadId) === active) return;
    this.pending.set(threadId, active);
    if (!this.cancelScheduled) this.schedule(this.flushIntervalMs);
  }

  private schedule(delayMs: number): void {
    const schedule = this.options.scheduleFlush ?? defaultSchedule;
    this.cancelScheduled = schedule(() => {
      this.cancelScheduled = null;
      this.flush();
    }, delayMs);
  }
}

export function createNativeThreadActivityProjection(
  options: NativeThreadActivityProjectionOptions,
): NativeThreadActivityProjection {
  return new NativeThreadActivityProjection(options);
}
