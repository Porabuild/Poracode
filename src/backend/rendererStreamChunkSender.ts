import { BACKEND_RENDERER_STREAM_VERSION } from "@/shared/backendHostProtocol";
import {
  LARGE_REPLY_CREDIT_TIMEOUT_MS,
  LARGE_REPLY_MAX_ENCODED_FRAME_BYTES,
  LARGE_REPLY_MAX_LOGICAL_BYTES,
  LARGE_REPLY_MAX_UNACKED_BYTES,
  LARGE_REPLY_MAX_UNACKED_CHUNKS,
  LARGE_REPLY_TRANSFER_TIMEOUT_MS,
  isReplyAckFrame,
  sliceChunkForFrame,
  utf8ByteLength,
} from "@/shared/rendererStreamChunks";

/**
 * One bounded large-reply delivery (Phase 3 item 6). Owns exactly its logical
 * serialized bytes (one JSON.stringify, counted in the delivery account) plus
 * transient exact-length frame strings. Chunks are raw substrings, never
 * base64 and never subarray views of the 64MiB backing.
 *
 * Credit: at most 2 chunks / 128KiB unacknowledged; ACK only advances when it
 * names a sent-but-unacked seq. Duplicates/future acks grant nothing.
 * Every frame travels through the caller's budget-checked `send`; yields
 * between sends preserve room for control/event traffic. Credit stall aborts
 * with a bounded error; socket budget failure stops silently (the send path
 * already 1013s + announces recovery) without revoking ownership for a mere
 * missing ACK.
 */
export interface ChunkSenderSink {
  sendFrame(payload: string): boolean;
  isOpen(): boolean;
}

export type ChunkSenderOutcome = "completed" | "aborted" | "transport-lost" | "cancelled";

export class RendererStreamChunkSender {
  private readonly serialized: string;
  private readonly totalBytes: number;
  private offset = 0;
  private nextSeq = 0;
  private readonly unacked = new Map<number, number>();
  private ackWaiter: (() => void) | null = null;
  private cancelled = false;
  private settled = false;
  private creditTimer: ReturnType<typeof setTimeout> | null = null;
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly creditTimeoutMs: number;
  private readonly transferTimeoutMs: number;
  // Note: no creditDeadline field retained; the timer alone bounds the stall.

  constructor(
    private readonly id: string,
    data: unknown,
    private readonly sink: ChunkSenderSink,
    options?: { creditTimeoutMs?: number; transferTimeoutMs?: number },
  ) {
    this.creditTimeoutMs = options?.creditTimeoutMs ?? LARGE_REPLY_CREDIT_TIMEOUT_MS;
    this.transferTimeoutMs = options?.transferTimeoutMs ?? LARGE_REPLY_TRANSFER_TIMEOUT_MS;
    const text = JSON.stringify(data);
    // Large path never sees undefined (that reply is tiny); fail loudly rather
    // than delivering the wrong value.
    if (typeof text !== "string") {
      throw new Error("Large reply serialization produced no bytes.");
    }
    this.serialized = text;
    this.totalBytes = utf8ByteLength(text);
    if (this.totalBytes === 0 || this.totalBytes > LARGE_REPLY_MAX_LOGICAL_BYTES) {
      throw new Error("Large reply logical size out of range.");
    }
  }

  get logicalBytes(): number {
    return this.totalBytes;
  }

  /** Delivery-cancel: frees payload waiting, never publishes late. */
  cancel(): void {
    if (this.settled || this.cancelled) return;
    this.cancelled = true;
    this.clearTimers();
    this.ackWaiter?.();
    this.ackWaiter = null;
  }

  /** Returns false for stale/duplicate/overcredit (grants nothing). */
  onAck(raw: unknown): boolean {
    if (this.settled || this.cancelled) return false;
    if (!isReplyAckFrame(raw)) return false;
    if (raw.id !== this.id) return false;
    const held = this.unacked.get(raw.seq);
    if (held === undefined) return false;
    this.unacked.delete(raw.seq);
    this.armCreditTimer();
    this.ackWaiter?.();
    this.ackWaiter = null;
    return true;
  }

  socketLost(): void {
    if (this.settled) return;
    this.clearTimers();
    this.ackWaiter?.();
    this.ackWaiter = null;
  }

  private unackedBytes(): number {
    let total = 0;
    for (const bytes of this.unacked.values()) total += bytes;
    return total;
  }

  private armCreditTimer(): void {
    this.clearCreditTimer();
    if (this.unacked.size === 0) return;
    this.creditTimer = setTimeout(() => this.onCreditTimeout(), this.creditTimeoutMs);
    this.creditTimer.unref?.();
  }

  private clearCreditTimer(): void {
    if (this.creditTimer) clearTimeout(this.creditTimer);
    this.creditTimer = null;
  }

  private clearTimers(): void {
    this.clearCreditTimer();
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    this.deadlineTimer = null;
  }

  private creditWaiter: (() => void) | null = null;

  private onCreditTimeout(): void {
    this.creditTimer = null;
    this.creditWaiter?.();
    this.creditWaiter = null;
  }

  private waitForCreditOrTimeout(): Promise<boolean> {
    if (this.cancelled) return Promise.resolve(false);
    if (
      this.unacked.size < LARGE_REPLY_MAX_UNACKED_CHUNKS &&
      this.unackedBytes() < LARGE_REPLY_MAX_UNACKED_BYTES
    ) {
      return Promise.resolve(true);
    }
    return this.waitForAckOrTimeout();
  }

  /**
   * Pend until the next accepted ACK, credit timeout, cancel, or socket loss.
   * Unlike the credit gate above this never resolves immediately: the drain
   * phase calls it with a non-empty unacked set that may sit below the credit
   * limits, where an immediate "credit available" answer would spin the event
   * loop on resolved promises instead of waiting for the outstanding ACKs.
   */
  private waitForAckOrTimeout(): Promise<boolean> {
    if (this.cancelled) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const onAck = () => {
        cleanup();
        resolve(!this.cancelled);
      };
      const onTimeout = () => {
        cleanup();
        resolve(false);
      };
      const cleanup = () => {
        this.ackWaiter = null;
        this.creditWaiter = null;
      };
      this.ackWaiter = onAck;
      this.creditWaiter = onTimeout;
    });
  }

  private sendAbort(error: string): boolean {
    const frame = JSON.stringify({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "reply-abort",
      id: this.id,
      error,
    });
    return this.sink.sendFrame(frame);
  }

  async run(): Promise<ChunkSenderOutcome> {
    if (this.settled) return "aborted";
    this.deadlineTimer = setTimeout(() => {
      this.cancel();
    }, this.transferTimeoutMs);
    this.deadlineTimer.unref?.();
    try {
      if (this.cancelled) return "cancelled";
      if (!this.sink.isOpen()) return "transport-lost";
      const start = JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply-start",
        id: this.id,
        totalBytes: this.totalBytes,
      });
      if (utf8ByteLength(start) > LARGE_REPLY_MAX_ENCODED_FRAME_BYTES) {
        return "aborted";
      }
      if (!this.sink.sendFrame(start)) return "transport-lost";
      this.armCreditTimer();

      while (this.offset < this.serialized.length) {
        if (this.cancelled) return "cancelled";
        if (!this.sink.isOpen()) return "transport-lost";
        const canSend =
          this.unacked.size < LARGE_REPLY_MAX_UNACKED_CHUNKS &&
          this.unackedBytes() < LARGE_REPLY_MAX_UNACKED_BYTES;
        if (!canSend) {
          const progressed = await this.waitForCreditOrTimeout();
          if (this.cancelled) return "cancelled";
          if (!progressed) {
            // Credit stall: bounded error, socket survives, ownership kept.
            // The send path's 1013/failover is NOT used for a mere missing ACK.
            this.sendAbort("Large reply stalled waiting for receiver credit.");
            return "aborted";
          }
          continue;
        }
        const { endIndex, frame } = sliceChunkForFrame(
          this.serialized,
          this.offset,
          this.id,
          this.nextSeq,
        );
        const payload = JSON.stringify(frame);
        const logicalBytes = utf8ByteLength(frame.data);
        if (!this.sink.isOpen()) {
          return "transport-lost";
        }
        if (!this.sink.sendFrame(payload)) {
          return "transport-lost";
        }
        this.unacked.set(this.nextSeq, logicalBytes);
        this.armCreditTimer();
        this.offset = endIndex;
        this.nextSeq += 1;
        // Yield between sends so events/Stop interleave on the same socket.
        await new Promise<void>((resolve) => setImmediate(resolve));
      }

      // Drain outstanding ACKs before end: the receiver validates contiguity,
      // so end must not overtake an unacked chunk. This pends for the next
      // ACK (or credit timeout/cancel), never spinning on resolved promises.
      while (this.unacked.size > 0) {
        if (this.cancelled) return "cancelled";
        if (!this.sink.isOpen()) return "transport-lost";
        const progressed = await this.waitForAckOrTimeout();
        if (this.cancelled) return "cancelled";
        if (!progressed) {
          this.sendAbort("Large reply stalled waiting for receiver credit.");
          return "aborted";
        }
      }
      if (this.cancelled) return "cancelled";
      if (!this.sink.isOpen()) return "transport-lost";
      const end = JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply-end",
        id: this.id,
        totalBytes: this.totalBytes,
      });
      if (!this.sink.sendFrame(end)) return "transport-lost";
      return "completed";
    } finally {
      this.settled = true;
      this.clearTimers();
      this.ackWaiter = null;
      this.creditWaiter = null;
    }
  }
}
