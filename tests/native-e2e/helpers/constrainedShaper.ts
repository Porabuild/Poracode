import type { Socket } from "node:net";

/**
 * One direction of the constrained-network TCP shaper: deterministic one-way
 * delay plus per-byte serialization on an actual stream transport, with
 * bounded backpressure and cumulative byte/delay accounting.
 *
 * Exact approximation (deliberately NOT a TCP stack emulator): each inbound
 * chunk is sliced into `sliceBytes` pieces (default ~50ms of link time) and
 * every slice is forwarded at
 * `end = max(readAt + oneWayDelayMs, previousEnd) + sliceBytes / rate`,
 * so propagation delay AND per-byte serialization both apply — a 64KiB chunk
 * at 32kbps takes ~16s, not one burst after the base delay. It models
 * bandwidth and latency only: no packet loss, congestion windows, reordering,
 * or TCP connect latency.
 *
 * Backpressure is real and bounded: queued slice bytes over the soft cap pause
 * the source socket (the writer sees ordinary TCP backpressure); over the hard
 * cap the relay must be destroyed, so shaper memory stays bounded.
 *
 * Half-close: with `allowHalfOpen: true` on both relayed sockets, a source FIN
 * ("end") only ends the peer after this direction's shaped queue drains — a
 * half-closing client still receives every paced byte of the response before
 * the FIN is forwarded.
 */

export interface DirectionStats {
  readonly bytesForwarded: number;
  readonly chunksForwarded: number;
  readonly peakBufferedBytes: number;
  readonly backpressurePauses: number;
  readonly overflowTeardowns: number;
  readonly imposedDelayMinMs: number;
  readonly imposedDelayMeanMs: number;
  readonly imposedDelayMaxMs: number;
  readonly firstReadAtMs: number | null;
  readonly lastForwardAtMs: number | null;
  /** bytesForwarded over (lastForwardAt − firstReadAt): includes the first
   * chunk's delay and serialization, so a single-chunk stream still measures. */
  readonly effectiveBitsPerSecond: number | null;
}

export const SHAPER_BUFFER_DEFAULTS = {
  /** Queued slice bytes per direction above which the source pauses. */
  softBytes: 256 * 1024,
  /** Queued slice bytes per direction above which the relay is destroyed. */
  hardBytes: 4 * 1024 * 1024,
} as const;

/** Forward granularity: ~50ms of link time, clamped to 64..16384 bytes. */
export function defaultSliceBytes(bytesPerSecond: number): number {
  return Math.min(16_384, Math.max(64, Math.ceil(bytesPerSecond / 20)));
}

/** Cumulative accounting for one direction across every relayed connection. */
export class DirectionAccounting {
  bytesForwarded = 0;
  chunksForwarded = 0;
  peakBufferedBytes = 0;
  backpressurePauses = 0;
  overflowTeardowns = 0;
  imposedDelayMinMs = Number.POSITIVE_INFINITY;
  imposedDelaySumMs = 0;
  imposedDelayMaxMs = 0;
  firstReadAtMs: number | null = null;
  lastForwardAtMs: number | null = null;

  stats(): DirectionStats {
    const windowMs =
      this.firstReadAtMs !== null && this.lastForwardAtMs !== null
        ? Math.max(1, this.lastForwardAtMs - this.firstReadAtMs)
        : 0;
    return {
      bytesForwarded: this.bytesForwarded,
      chunksForwarded: this.chunksForwarded,
      peakBufferedBytes: this.peakBufferedBytes,
      backpressurePauses: this.backpressurePauses,
      overflowTeardowns: this.overflowTeardowns,
      imposedDelayMinMs: this.chunksForwarded === 0 ? 0 : Math.round(this.imposedDelayMinMs),
      imposedDelayMeanMs:
        this.chunksForwarded === 0 ? 0 : Math.round(this.imposedDelaySumMs / this.chunksForwarded),
      imposedDelayMaxMs: Math.round(this.imposedDelayMaxMs),
      firstReadAtMs: this.firstReadAtMs,
      lastForwardAtMs: this.lastForwardAtMs,
      effectiveBitsPerSecond:
        windowMs > 0 ? Math.round((this.bytesForwarded * 8 * 1000) / windowMs) : null,
    };
  }
}

interface PacedSlice {
  readonly data: Buffer;
  readonly readAtMs: number;
  readonly dueAtMs: number;
}

export type DirectionName = "clientToServer" | "serverToClient";

export interface ShapedSocketsConfig {
  readonly oneWayDelayMs: number;
  readonly bytesPerSecond: number;
  readonly softBufferBytes: number;
  readonly hardBufferBytes: number;
  readonly sliceBytes: number;
}

/** One shaped direction of one relayed connection: source → peer. */
export class ShapedDirection {
  private readonly queue: PacedSlice[] = [];
  private queueBytes = 0;
  private lastEndAtMs: number | null = null;
  private headTimer: ReturnType<typeof setTimeout> | null = null;
  private pausedByBuffer = false;
  private drainPaused = false;
  private endedPeer = false;
  private halted = false;
  sourceEndedGracefully = false;
  sourceClosed = false;

  constructor(
    private readonly config: ShapedSocketsConfig,
    private readonly accounting: DirectionAccounting,
    private readonly source: Socket,
    private readonly peer: Socket,
    private readonly onFatal: (reason: string) => void,
    private readonly onProgress: () => void,
  ) {}

  attach(direction: DirectionName): void {
    this.source.on("data", (chunk: Buffer) => {
      if (this.halted) return;
      this.enqueue(chunk);
      if (this.queueBytes > this.config.hardBufferBytes) {
        this.accounting.overflowTeardowns += 1;
        this.onFatal(`${direction}-overflow-hard-cap`);
        return;
      }
      if (!this.pausedByBuffer && this.queueBytes > this.config.softBufferBytes) {
        this.pausedByBuffer = true;
        this.accounting.backpressurePauses += 1;
        this.source.pause();
      }
    });
    this.source.on("end", () => {
      this.sourceEndedGracefully = true;
      this.flush();
    });
    this.source.on("close", () => {
      this.sourceClosed = true;
      this.onProgress();
    });
  }

  /** Slices a chunk and schedules every slice: propagation delay on the first
   * byte, serialization time for every byte. */
  private enqueue(chunk: Buffer): void {
    const readAtMs = Date.now();
    if (this.accounting.firstReadAtMs === null) this.accounting.firstReadAtMs = readAtMs;
    for (let offset = 0; offset < chunk.length; offset += this.config.sliceBytes) {
      const slice = chunk.subarray(offset, Math.min(offset + this.config.sliceBytes, chunk.length));
      const startAtMs = Math.max(readAtMs + this.config.oneWayDelayMs, this.lastEndAtMs ?? 0);
      const endAtMs = startAtMs + Math.ceil((slice.length * 1000) / this.config.bytesPerSecond);
      this.lastEndAtMs = endAtMs;
      this.queue.push({ data: slice, readAtMs, dueAtMs: endAtMs });
      this.queueBytes += slice.length;
    }
    this.accounting.peakBufferedBytes = Math.max(
      this.accounting.peakBufferedBytes,
      this.queueBytes,
    );
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.headTimer !== null || this.halted) return;
    const head = this.queue[0];
    if (!head) return;
    this.headTimer = setTimeout(
      () => {
        this.headTimer = null;
        this.flush();
      },
      Math.max(0, head.dueAtMs - Date.now()),
    );
  }

  /** Forwards every slice that is due, in order, honoring peer write backpressure. */
  private flush(): void {
    if (this.drainPaused || this.halted) return;
    for (;;) {
      const head = this.queue[0];
      if (!head || head.dueAtMs > Date.now()) break;
      this.queue.shift();
      this.queueBytes -= head.data.length;
      if (this.peer.destroyed) {
        this.onProgress();
        return;
      }
      const forwardedAtMs = Date.now();
      const imposed = forwardedAtMs - head.readAtMs;
      this.accounting.imposedDelayMinMs = Math.min(this.accounting.imposedDelayMinMs, imposed);
      this.accounting.imposedDelaySumMs += imposed;
      this.accounting.imposedDelayMaxMs = Math.max(this.accounting.imposedDelayMaxMs, imposed);
      this.accounting.bytesForwarded += head.data.length;
      this.accounting.chunksForwarded += 1;
      this.accounting.lastForwardAtMs = forwardedAtMs;
      if (!this.peer.write(head.data)) {
        this.drainPaused = true;
        this.peer.once("drain", () => {
          this.drainPaused = false;
          this.flush();
        });
        break;
      }
    }
    if (this.pausedByBuffer && this.queueBytes <= this.config.softBufferBytes / 2) {
      this.pausedByBuffer = false;
      this.source.resume();
    }
    if (this.queue.length === 0 && this.sourceEndedGracefully && !this.endedPeer) {
      this.endedPeer = true;
      if (!this.peer.destroyed) this.peer.end();
    }
    this.scheduleFlush();
    this.onProgress();
  }

  /** Stops the schedule and drops queued bytes; used only on bounded teardown. */
  halt(): void {
    this.halted = true;
    if (this.headTimer !== null) {
      clearTimeout(this.headTimer);
      this.headTimer = null;
    }
    this.queue.length = 0;
    this.queueBytes = 0;
  }

  destroySockets(): void {
    this.source.destroy();
    this.peer.destroy();
  }
}
