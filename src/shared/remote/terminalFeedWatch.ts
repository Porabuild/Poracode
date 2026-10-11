import { reconnectBackoffDelay } from "./backoff";
import {
  TERMINAL_CURSOR_SYNC_VERSION,
  type RemoteTerminalWatchResult,
  type RemoteTerminalWatchResultError,
  type RemoteTerminalWatchResultReady,
} from "./protocol";
import { reconcileTerminalRange, type TerminalPosition } from "./terminalRange";

/**
 * Per-terminal reliable (cursor-sync v1) watch state machine behind
 * {@link ./terminalFeed | terminalFeed}. One session owns everything that must
 * stay correct across a single terminal's snapshots and tagged live frames:
 *
 * - a **baseline attempt**: a fresh `watchId` sent with `terminal-watch`
 *   (cursorSync v1) whose authoritative `terminal-watch-result` must arrive
 *   within `baselineTimeoutMs`. Every `begin()` clears the previous attempt's
 *   pending frames — frames never straddle two watch attempts;
 * - a **bounded pending buffer** of tagged live frames received while the
 *   baseline is awaited (UTF-16 units, default 200_000 — the server's own
 *   retained-tail size, see `TranscriptBuffer(200_000)` in
 *   `src/supervisor/runtime/threadOutputPipeline.ts`; also capped by frame
 *   count, and empty frames are dropped). Overflow drops the whole buffer and
 *   triggers a bounded resnapshot rather than guessing bytes;
 * - a **bounded active cache** of installed history (UTF-16 units, default
 *   200_000, mirroring the server retained tail), trimmed on snapshot
 *   installation and on every append. Appends past the cap cut the front and
 *   shift the cached absolute `fromCursor`, exactly like the server's own tail
 *   retention; a trim boundary may split a surrogate pair, which is inherent
 *   to the protocol's UTF-16-unit accounting. The cache is retained while a
 *   new baseline is awaited (reconnect/resync) so late visual listeners never
 *   see a live-only empty view;
 * - bounded recovery: gap / generation-change / overflow frames reconcile via
 *   `reconcileTerminalRange` and trigger a resnapshot (fresh `watchId`) at most
 *   `maxResyncs` times **without forward progress** — progress means an append
 *   or a baseline with a new generation or an advanced cursor, so a server
 *   re-sending an unchanged baseline cannot loop the budget forever. A missing
 *   baseline retries with full-jitter backoff at most `maxAttempts` times.
 *   Exhaustion (and every non-retryable stop) reports `onWatchError` exactly
 *   once, sends `terminal-unwatch` so the server stops streaming to a stopped
 *   watch, and keeps the cache for late listeners — no silent live-only
 *   fallback, no invented bytes.
 *
 * Server-issued error results are forwarded verbatim. Client-synthesized
 * errors (baseline timeout, recovery exhaustion) only ever use
 * `code: "unavailable"`; `forbidden` / `not-found` are never fabricated.
 */

/** A cursor-tagged live `terminal-output` frame (schema-validated upstream). */
export interface TerminalWatchFrame {
  readonly generation: string;
  readonly fromCursor: number;
  readonly toCursor: number;
  readonly data: string;
}

/** Feed-owned callbacks the session uses to reach the wire and the listeners. */
export interface TerminalWatchHost {
  /** Send `terminal-watch` with cursorSync v1 and the given fresh watchId. */
  readonly sendWatch: (watchId: string) => void;
  /** Send `terminal-unwatch` (used when a watch stops locally). */
  readonly sendUnwatch: () => void;
  /** Uncovered live bytes for output listeners — never snapshot history. */
  readonly deliverOutput: (data: string) => void;
  /** Baseline / active-cache snapshot for visual listeners. */
  readonly deliverSnapshot: (snapshot: RemoteTerminalWatchResultReady) => void;
  /** Watch error for listeners implementing `onWatchError`. */
  readonly deliverWatchError: (error: RemoteTerminalWatchResultError) => void;
}

export interface TerminalWatchLimits {
  /** Active-cache cap in UTF-16 units (server retained tail is 200_000). */
  readonly cacheUnits: number;
  /** Pre-baseline pending-buffer cap in UTF-16 units. */
  readonly pendingUnits: number;
}

export const TERMINAL_WATCH_DEFAULT_LIMITS: TerminalWatchLimits = {
  cacheUnits: 200_000,
  pendingUnits: 200_000,
};

/** Hard cap on buffered frame count (zero- and tiny-unit frames are bounded too). */
const MAX_PENDING_FRAMES = 4_096;

export interface TerminalWatchRetryOptions {
  /** Backoff base for baseline retries (full jitter, see `reconnectBackoffDelay`). */
  readonly baseMs: number;
  readonly maxMs: number;
  /** Baseline attempts before the watch stops and reports `unavailable`. */
  readonly maxAttempts: number;
  /** A `terminal-watch-result` must arrive within this delay of sending a watch. */
  readonly baselineTimeoutMs: number;
  /** Resnapshot triggers (gap/generation/overflow) tolerated without progress. */
  readonly maxResyncs: number;
}

export const TERMINAL_WATCH_DEFAULT_RETRY: TerminalWatchRetryOptions = {
  baseMs: 500,
  maxMs: 8_000,
  maxAttempts: 5,
  baselineTimeoutMs: 10_000,
  maxResyncs: 3,
};

export type TerminalWatchScheduler = (delayMs: number, fn: () => void) => () => void;

export interface TerminalWatchDeps {
  readonly host: TerminalWatchHost;
  readonly generateWatchId: () => string;
  readonly schedule: TerminalWatchScheduler;
  readonly limits: TerminalWatchLimits;
  readonly retry: TerminalWatchRetryOptions;
}

const CLIENT_UNAVAILABLE_STOP: RemoteTerminalWatchResultError = {
  status: "error",
  code: "unavailable",
  retryable: false,
};

export const CLIENT_UNAVAILABLE_RETRYABLE: RemoteTerminalWatchResultError = {
  status: "error",
  code: "unavailable",
  retryable: true,
};

export class TerminalWatchSession {
  protected readonly host: TerminalWatchHost;
  protected readonly generateWatchId: () => string;
  protected readonly schedule: TerminalWatchScheduler;
  protected readonly limits: TerminalWatchLimits;
  protected readonly retry: TerminalWatchRetryOptions;

  /** Installed snapshot position; `generation: null` is replace-only. */
  private position: TerminalPosition | null = null;
  private cacheData = "";
  /** Absolute cursor of `cacheData[0]`; shifts when the cache front-trims. */
  private cacheFromCursor = 0;
  private processState: RemoteTerminalWatchResultReady["processState"] = "running";
  private terminalSize: RemoteTerminalWatchResultReady["terminalSize"] = null;

  /** True from `begin()` until the attempt's own baseline installs. While set,
   * all tagged frames for the current watchId buffer regardless of any cache
   * retained from a previous attempt/connection. */
  protected awaitingBaseline = false;
  private pending: TerminalWatchFrame[] = [];
  private pendingUnits = 0;

  protected currentWatchId: string | null = null;
  protected cancelBaselineTimer: (() => void) | null = null;
  private cancelRetryTimer: (() => void) | null = null;
  private retryAttempt = 0;
  private resyncs = 0;

  /** Set once the feed dropped this session (final unsubscribe). An orphaned
   * session must never act again — callbacks during delivery can unsubscribe
   * and re-watch the same id, and the old session would otherwise keep
   * sending watches/unwatches that clobber the new one. */
  protected disposed = false;
  /** Set while the sender is down; no timers or sends may be scheduled. */
  protected suspended = false;

  /** Non-retryable stop: cache is kept for late listeners; re-arm only via
   * rearm()/restart() (new connection / reset / new watch). */
  protected stopped = false;
  private lastStopError: RemoteTerminalWatchResultError | null = null;

  constructor(deps: TerminalWatchDeps) {
    this.host = deps.host;
    this.generateWatchId = deps.generateWatchId;
    this.schedule = deps.schedule;
    this.limits = deps.limits;
    this.retry = deps.retry;
  }

  /** Active cache as an authoritative snapshot, or null before any baseline. */
  currentSnapshot(): RemoteTerminalWatchResultReady | null {
    const position = this.position;
    if (!position) return null;
    return {
      status: "ready",
      generation: position.generation,
      fromCursor: this.cacheFromCursor,
      toCursor: position.cursor,
      data: this.cacheData,
      processState: this.processState,
      terminalSize: this.terminalSize,
    };
  }

  /** Final error, only once the watch stopped (not transient retry state). */
  currentError(): RemoteTerminalWatchResultError | null {
    return this.stopped ? this.lastStopError : null;
  }

  /** New connection or explicit new watch: fresh budgets, fresh watchId. */
  rearm(): void {
    this.disposed = false;
    this.stopped = false;
    this.lastStopError = null;
    this.retryAttempt = 0;
    this.resyncs = 0;
    this.begin();
  }

  /** The PTY restarted (sender live): prior generation and cache are invalid. */
  restart(): void {
    this.resetWatchedState();
    this.begin();
  }

  /** The PTY restarted while disconnected: invalidate without timers/sends. */
  invalidate(): void {
    this.resetWatchedState();
  }

  /** A terminal's PTY exited: retained cache must not keep reporting running. */
  markExited(): void {
    if (this.position) this.processState = "exited";
  }

  /** Sender lost: suspend writes/retries, keep listeners' state and cache. */
  suspend(): void {
    this.suspended = true;
    this.cancelBaseline();
    this.cancelRetry();
    this.currentWatchId = null;
    this.awaitingBaseline = false;
    this.clearPending();
  }

  /** Last listener detached: drop cache, queues, and timers. */
  dispose(): void {
    this.disposed = true;
    this.suspended = false;
    this.cancelBaseline();
    this.cancelRetry();
    this.currentWatchId = null;
    this.awaitingBaseline = false;
    this.clearPending();
    this.position = null;
    this.cacheData = "";
    this.cacheFromCursor = 0;
    this.stopped = false;
    this.lastStopError = null;
  }

  /** Cursor-tagged live frame; stale watchIds are ignored. While a baseline
   * attempt is open, frames buffer for that attempt — even when a previous
   * attempt's cache is retained (reconnect/resync). */
  handleFrame(watchId: string, frame: TerminalWatchFrame): void {
    if (this.stopped || watchId !== this.currentWatchId) return;
    if (this.awaitingBaseline || !this.position) {
      this.bufferFrame(frame);
      return;
    }
    const result = reconcileTerminalRange(this.position, frame.data, {
      version: TERMINAL_CURSOR_SYNC_VERSION,
      watchId,
      generation: frame.generation,
      fromCursor: frame.fromCursor,
      toCursor: frame.toCursor,
    });
    if (result.kind === "duplicate") return;
    if (result.kind === "resync") {
      this.resync();
      return;
    }
    this.append(result.data, result.toCursor);
  }

  /** Untagged frame while a cursor-sync watch is installed: the reliable
   * stream broke — bounded resnapshot, never a raw passthrough. */
  handleUntaggedFrame(): void {
    if (this.stopped || !this.currentWatchId) return;
    this.resync();
  }

  /** Authoritative `terminal-watch-result`; stale watchIds are ignored. */
  handleResult(watchId: string, result: RemoteTerminalWatchResult): void {
    if (this.stopped || watchId !== this.currentWatchId || !this.cancelBaselineTimer) return;
    this.cancelBaseline();
    if (result.status === "error") {
      // Retire the attempt BEFORE any callback runs: a listener may
      // unsubscribe and re-watch (new session) or reset the terminal from
      // inside onWatchError, and must never find this attempt still live.
      this.currentWatchId = null;
      if (result.retryable) {
        this.host.deliverWatchError(result);
        // The callback may have disposed this session, suspended it, or begun
        // a newer attempt — only schedule a retry if none of that happened.
        if (this.canScheduleRetry()) this.scheduleRetry();
      } else {
        this.stop(result);
      }
      return;
    }
    this.retryAttempt = 0;
    this.installSnapshot(watchId, result);
  }

  /** True when the just-retired attempt may still own the recovery: no
   * callback has stopped, disposed, suspended this session or begun a newer
   * attempt in the meantime. */
  protected canScheduleRetry(): boolean {
    return !this.stopped && !this.disposed && !this.suspended && this.currentWatchId === null;
  }

  private begin(): void {
    this.cancelBaseline();
    this.cancelRetry();
    // Frames from a prior attempt are stale for this one — never straddle.
    this.clearPending();
    this.currentWatchId = null;
    this.awaitingBaseline = true;
    this.suspended = false;
    const watchId = this.generateWatchId();
    this.currentWatchId = watchId;
    this.cancelBaselineTimer = this.schedule(this.retry.baselineTimeoutMs, () => {
      if (this.currentWatchId !== watchId || !this.cancelBaselineTimer) return;
      this.cancelBaselineTimer = null;
      this.currentWatchId = null; // retire before the callback sees the error
      // Client-side synthesized error: only ever "unavailable".
      this.host.deliverWatchError(CLIENT_UNAVAILABLE_RETRYABLE);
      if (this.canScheduleRetry()) this.scheduleRetry();
    });
    this.sendCurrentWatch(watchId);
  }

  /** The wire request for the current attempt. The default sends the v1
   * cursor-sync watch; the v2 session overrides this to add resume/bounds
   * (see `terminalFeedWatchV2.ts`). */
  protected sendCurrentWatch(watchId: string): void {
    this.host.sendWatch(watchId);
  }

  protected scheduleRetry(): void {
    this.retryAttempt += 1;
    if (this.retryAttempt > this.retry.maxAttempts) {
      this.stop(CLIENT_UNAVAILABLE_STOP);
      return;
    }
    const delay = reconnectBackoffDelay(this.retryAttempt, {
      baseMs: this.retry.baseMs,
      maxMs: this.retry.maxMs,
    });
    this.cancelRetryTimer = this.schedule(delay, () => {
      this.cancelRetryTimer = null;
      // Restart/rearm/dispose/suspend all cancel this timer, so by the time
      // it fires this attempt still owns recovery.
      this.begin();
    });
  }

  /** Gap / generation change / overflow / broken tagging: resnapshot with a
   * fresh watchId. Bounded — never a busy loop, never guessed bytes. */
  protected resync(): void {
    if (this.stopped) return;
    this.resyncs += 1;
    if (this.resyncs > this.retry.maxResyncs) {
      this.stop(CLIENT_UNAVAILABLE_STOP);
      return;
    }
    this.begin();
  }

  /** Terminal transition first, then a single error delivery — a callback
   * observing onWatchError always finds the attempt fully retired, so an
   * unsubscribe + re-watch or reset inside it cannot be clobbered. Idempotent. */
  private stop(error: RemoteTerminalWatchResultError): void {
    if (this.stopped) return;
    this.stopped = true;
    this.lastStopError = error;
    this.cancelBaseline();
    this.cancelRetry();
    this.currentWatchId = null;
    this.awaitingBaseline = false;
    this.clearPending();
    // Local stops leave the server-side registration alive (unlike server
    // verdicts, which clear it themselves) — tell the server to stop streaming.
    this.host.sendUnwatch();
    this.host.deliverWatchError(error);
  }

  private installSnapshot(watchId: string, ready: RemoteTerminalWatchResultReady): void {
    // Pin the attempt identity and its buffered frames before any callback:
    // a listener reacting to onSnapshot may reset or resnapshot the session,
    // and stale queued frames must never cross into the new watch attempt.
    const frames = this.pending;
    this.clearPending();
    const previous = this.position;
    this.setCache(ready.data, ready.fromCursor);
    this.position = { generation: ready.generation, cursor: ready.toCursor };
    this.processState = ready.processState;
    this.terminalSize = ready.terminalSize;
    this.awaitingBaseline = false;
    // Forward progress only: an unchanged baseline that re-covers the same
    // range must not refill the resync budget, or baseline+gap loops forever.
    const progressed =
      ready.generation !== null &&
      (previous === null ||
        previous.generation !== ready.generation ||
        ready.toCursor > previous.cursor);
    if (progressed) this.resyncs = 0;
    this.host.deliverSnapshot(ready);
    if (this.stopped || this.currentWatchId !== watchId) return;
    this.flushPending(frames, watchId);
  }

  /** Replay buffered live frames against the installed baseline, delivering
   * only uncovered suffixes. Snapshot install first, uncovered live after. */
  private flushPending(frames: TerminalWatchFrame[], watchId: string): void {
    for (const frame of frames) {
      if (this.stopped || this.currentWatchId !== watchId || !this.position) return;
      const result = reconcileTerminalRange(this.position, frame.data, {
        version: TERMINAL_CURSOR_SYNC_VERSION,
        watchId,
        generation: frame.generation,
        fromCursor: frame.fromCursor,
        toCursor: frame.toCursor,
      });
      if (result.kind === "duplicate") continue;
      if (result.kind === "resync") {
        // Generation broke between baseline and a buffered frame; the rest of
        // the buffer predates the resnapshot and is dropped, not guessed.
        this.resync();
        return;
      }
      this.append(result.data, result.toCursor);
    }
  }

  private bufferFrame(frame: TerminalWatchFrame): void {
    // Empty ranges carry no data; dropping them keeps the pending array
    // bounded against zero-unit floods (a real gap shows on the next frame).
    const units = frame.toCursor - frame.fromCursor;
    if (units <= 0) return;
    if (
      units > this.limits.pendingUnits ||
      this.pendingUnits + units > this.limits.pendingUnits ||
      this.pending.length + 1 > MAX_PENDING_FRAMES
    ) {
      // Live outran the baseline window. Drop the whole buffer (a fresh
      // snapshot is the only non-guessing recovery) and resnapshot.
      this.clearPending();
      this.resync();
      return;
    }
    this.pending.push(frame);
    this.pendingUnits += units;
  }

  private append(data: string, toCursor: number): void {
    const position = this.position;
    if (!position) return;
    this.position = { generation: position.generation, cursor: toCursor };
    if (data.length === 0) return;
    this.cacheData += data;
    // Appends are the only per-frame forward progress for the resync budget.
    this.resyncs = 0;
    if (this.cacheData.length > this.limits.cacheUnits) {
      const cut = this.cacheData.length - this.limits.cacheUnits;
      this.cacheData = this.cacheData.slice(cut);
      this.cacheFromCursor += cut;
    }
    this.host.deliverOutput(data);
  }

  /** Replace the cache with authoritative data, front-trimmed to the cap. */
  private setCache(data: string, fromCursor: number): void {
    if (data.length > this.limits.cacheUnits) {
      const cut = data.length - this.limits.cacheUnits;
      this.cacheData = data.slice(cut);
      this.cacheFromCursor = fromCursor + cut;
      return;
    }
    this.cacheData = data;
    this.cacheFromCursor = fromCursor;
  }

  private resetWatchedState(): void {
    this.stopped = false;
    this.lastStopError = null;
    this.cancelBaseline();
    this.cancelRetry();
    this.currentWatchId = null;
    this.position = null;
    this.cacheData = "";
    this.cacheFromCursor = 0;
    this.processState = "running";
    this.terminalSize = null;
    this.retryAttempt = 0;
    this.resyncs = 0;
    this.awaitingBaseline = false;
    this.clearPending();
  }

  protected clearPending(): void {
    this.pending = [];
    this.pendingUnits = 0;
  }

  protected cancelBaseline(): void {
    this.cancelBaselineTimer?.();
    this.cancelBaselineTimer = null;
  }

  protected cancelRetry(): void {
    this.cancelRetryTimer?.();
    this.cancelRetryTimer = null;
  }
}
