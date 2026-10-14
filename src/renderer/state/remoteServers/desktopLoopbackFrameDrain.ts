import {
  ClientEngineLaneOverflowError,
  ClientEngineLaneDisposedError,
  ClientEngineLaneSupersededError,
  ClientEngineProtocolMismatchError,
  ClientEngineTimeoutError,
  ClientEngineWorkerUnavailableError,
  type ClientEngineWorkerMode,
} from "@/renderer/state/remote/engine";
import type { DesktopFrameDecodeResult } from "@/renderer/state/remote/engine/decode";
import type { DesktopLoopbackFrame } from "./desktopLoopbackFrames";

/**
 * A3: the managed loopback leg's private decode port. The production
 * implementation is a client-engine lane; tests inject fakes. `workerMode`
 * lets the drain expose a truthful reduced state without probing the worker
 * with every frame.
 */
export interface DesktopLoopbackDecodePort {
  decodeDesktopFrame(raw: string): Promise<DesktopFrameDecodeResult>;
  /** New socket generation: pending results from the old socket are fenced. */
  renew(): void;
  dispose(): void;
  readonly workerMode: ClientEngineWorkerMode;
}

export type DesktopLoopbackDrainUnavailableReason =
  | "worker"
  | "overflow"
  | "bytes"
  | "age"
  | "disposed";

export interface DesktopLoopbackFrameDrainOptions {
  readonly decode: DesktopLoopbackDecodePort;
  readonly onFrame: (frame: DesktopLoopbackFrame) => void;
  /** Typed recovery signal: the drain cannot decode bulk frames anymore and
   * the leg must be re-established (never a synchronous UI parse burst). */
  readonly onUnavailable: (reason: DesktopLoopbackDrainUnavailableReason) => void;
  readonly maxPending?: number;
  readonly maxBytes?: number;
  readonly maxAgeMs?: number;
  readonly inFlight?: number;
}

interface QueuedFrame {
  readonly sequence: number;
  readonly raw: string;
  readonly bytes: number;
  readonly queuedAt: number;
}

/** A decoded frame parked out of order. It still holds the frame (and the
 * bytes charged when it arrived) until the gap routes it or the drain
 * authoritatively discards it. */
interface DecodedFrame {
  readonly frame: DesktopLoopbackFrame | null;
  readonly bytes: number;
}

const DEFAULT_MAX_PENDING = 64;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_AGE_MS = 5_000;
const DEFAULT_IN_FLIGHT = 8;

/**
 * Per-socket ordered, bounded drain between the managed loopback socket and the
 * off-thread client engine.
 *
 * Ordering: every pushed frame gets a monotonic sequence and decoded results
 * are routed strictly in that order, so terminal and event frames keep one
 * FIFO across the async boundary. Exactly one private frame decode is in
 * flight per in-flight slot; nothing is reordered by out-of-order completion.
 *
 * Budgets: count, bytes (UTF-16 upper bound of the raw frame) and age are
 * enforced before admission over the TOTAL retained set — queued, posted and
 * decoded-results-waiting-to-route — so a stalled first result cannot let
 * later completions accumulate past the bound. Exceeding a budget, a worker
 * failure, or a decode timeout moves the drain to a typed unavailable state:
 * its retained work is dropped, the decode port is renewed to fence pending
 * callbacks, late results are ignored, and `onUnavailable` is called exactly
 * once per socket generation. Renewing is a callback fence, not a memory
 * reclaim: the posted clones stay accounted by the engine-level transport
 * ledger until the worker consumes them or is terminated. There is no
 * synchronous bulk fallback — the leg owner closes and re-establishes
 * (resync) instead.
 */
export class DesktopLoopbackFrameDrain {
  private readonly maxPending: number;
  private readonly maxBytes: number;
  private readonly maxAgeMs: number;
  private readonly inFlightLimit: number;
  private generation = 0;
  private disposed = false;
  private unavailable = false;
  private unavailableReason: DesktopLoopbackDrainUnavailableReason | null = null;
  private nextSequence = 0;
  private nextToRoute = 0;
  private queued: QueuedFrame[] = [];
  private queuedBytes = 0;
  private outstanding = 0;
  private outstandingBytes = 0;
  private readonly decoded = new Map<number, DecodedFrame>();
  private decodedBytes = 0;
  private ageTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: DesktopLoopbackFrameDrainOptions) {
    this.maxPending = options.maxPending ?? DEFAULT_MAX_PENDING;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    this.inFlightLimit = options.inFlight ?? DEFAULT_IN_FLIGHT;
  }

  /** True while bulk frames can no longer be decoded for the current socket. */
  isUnavailable(): boolean {
    return this.disposed || this.unavailable;
  }

  unavailableMessageReason(): DesktopLoopbackDrainUnavailableReason | null {
    return this.unavailableReason;
  }

  /** Total retained entries: queued + posted-but-unanswered + decoded results
   * waiting for their routing gap. The decoded map used to be invisible here,
   * so a stalled first result let later completions accumulate unbounded. */
  pendingCount(): number {
    return this.queued.length + this.outstanding + this.decoded.size;
  }

  /** Total retained payload bytes across the same three stages. A UTF-16
   * upper bound of the raw frame (not exact heap usage), charged until the
   * frame is routed or authoritatively discarded. */
  retainedBytes(): number {
    return this.queuedBytes + this.outstandingBytes + this.decodedBytes;
  }

  push(raw: string): void {
    if (this.disposed || this.unavailable) return;
    const now = Date.now();
    this.enforceAge(now);
    if (this.unavailable) return;
    const bytes = raw.length * 2;
    if (this.pendingCount() >= this.maxPending) {
      this.markUnavailable("overflow");
      return;
    }
    if (this.retainedBytes() + bytes > this.maxBytes) {
      this.markUnavailable("bytes");
      return;
    }
    this.queued.push({ sequence: this.nextSequence++, raw, bytes, queuedAt: now });
    this.queuedBytes += bytes;
    this.armAgeTimer();
    this.pump();
  }

  /** New socket generation: drop the old socket's queue and stale results and
   * fence the decode port. The port's still-posted work is charged by the
   * engine until the worker consumes it or is terminated; `renew()` alone
   * cannot free a clone the worker is holding. */
  reset(): void {
    if (this.disposed) return;
    this.generation += 1;
    this.queued = [];
    this.queuedBytes = 0;
    this.outstanding = 0;
    this.outstandingBytes = 0;
    this.decoded.clear();
    this.decodedBytes = 0;
    this.nextSequence = 0;
    this.nextToRoute = 0;
    this.unavailable = false;
    this.unavailableReason = null;
    this.clearAgeTimer();
    this.options.decode.renew();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.queued = [];
    this.queuedBytes = 0;
    this.outstanding = 0;
    this.outstandingBytes = 0;
    this.decoded.clear();
    this.decodedBytes = 0;
    this.clearAgeTimer();
    this.options.decode.dispose();
  }

  private pump(): void {
    while (
      !this.disposed &&
      !this.unavailable &&
      this.outstanding < this.inFlightLimit &&
      this.queued.length > 0
    ) {
      const frame = this.queued.shift()!;
      // Queued -> posted keeps the payload charge: the port still holds it.
      this.queuedBytes -= frame.bytes;
      this.outstandingBytes += frame.bytes;
      if (this.queued.length === 0) this.clearAgeTimer();
      this.outstanding += 1;
      const generation = this.generation;
      void this.options.decode
        .decodeDesktopFrame(frame.raw)
        .then((result) => {
          if (this.disposed || generation !== this.generation) return;
          this.outstanding -= 1;
          this.outstandingBytes -= frame.bytes;
          this.recordResult(frame.sequence, result.ok ? result.frame : null, frame.bytes);
          this.pump();
        })
        .catch((error: unknown) => {
          if (this.disposed || generation !== this.generation) return;
          this.outstanding -= 1;
          this.outstandingBytes -= frame.bytes;
          this.markUnavailable(this.reasonFromError(error));
        });
    }
  }

  /** Parks one decoded result, then routes every frame the parked set makes
   * contiguous. Parked results keep charging count/bytes until routed;
   * consumer routing must never corrupt that accounting. */
  private recordResult(sequence: number, frame: DesktopLoopbackFrame | null, bytes: number): void {
    this.decoded.set(sequence, { frame, bytes });
    this.decodedBytes += bytes;
    while (this.decoded.has(this.nextToRoute)) {
      const next = this.decoded.get(this.nextToRoute)!;
      this.decoded.delete(this.nextToRoute);
      this.decodedBytes -= next.bytes;
      this.nextToRoute += 1;
      if (next.frame) {
        try {
          this.options.onFrame(next.frame);
        } catch {
          // A routing failure must not leave the accounting charged or turn
          // into an unhandled rejection; HTTP snapshots stay authoritative.
        }
      }
      if (this.disposed || this.unavailable) return;
    }
  }

  private enforceAge(now: number): void {
    const oldest = this.queued[0];
    if (!oldest) return;
    if (now - oldest.queuedAt < this.maxAgeMs) return;
    this.markUnavailable("age");
  }

  private armAgeTimer(): void {
    if (this.ageTimer || this.queued.length === 0) return;
    const oldest = this.queued[0]!;
    const delay = Math.max(0, oldest.queuedAt + this.maxAgeMs - Date.now());
    this.ageTimer = setTimeout(() => {
      this.ageTimer = null;
      if (this.disposed || this.unavailable) return;
      this.enforceAge(Date.now());
      this.pump();
    }, delay);
  }

  private clearAgeTimer(): void {
    if (!this.ageTimer) return;
    clearTimeout(this.ageTimer);
    this.ageTimer = null;
  }

  private markUnavailable(reason: DesktopLoopbackDrainUnavailableReason): void {
    if (this.disposed || this.unavailable) return;
    this.unavailable = true;
    this.unavailableReason = reason;
    // Fence the whole generation: queued frames and parked results are dropped
    // here, and renew() fences the decode port's pending callbacks. The port's
    // posted clones are NOT freed synchronously — the engine's transport
    // ledger keeps charging them until the worker responds or is terminated.
    this.generation += 1;
    this.queued = [];
    this.queuedBytes = 0;
    this.outstanding = 0;
    this.outstandingBytes = 0;
    this.decoded.clear();
    this.decodedBytes = 0;
    this.clearAgeTimer();
    this.options.decode.renew();
    this.options.onUnavailable(reason);
  }

  private reasonFromError(error: unknown): DesktopLoopbackDrainUnavailableReason {
    if (error instanceof ClientEngineLaneOverflowError) return "overflow";
    if (
      error instanceof ClientEngineWorkerUnavailableError ||
      error instanceof ClientEngineProtocolMismatchError ||
      error instanceof ClientEngineLaneSupersededError ||
      error instanceof ClientEngineLaneDisposedError ||
      error instanceof ClientEngineTimeoutError
    ) {
      return "worker";
    }
    return "worker";
  }
}
