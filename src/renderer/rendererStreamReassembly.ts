import { BACKEND_RENDERER_STREAM_VERSION } from "@/shared/backendHostProtocol";
import {
  LARGE_REPLY_MAX_BYTES_PER_CLIENT,
  LARGE_REPLY_MAX_ENCODED_FRAME_BYTES,
  LARGE_REPLY_MAX_LOGICAL_BYTES,
  LARGE_REPLY_MAX_PER_CLIENT,
  encodedFrameByteLength,
  isReplyAbortFrame,
  isReplyChunkFrame,
  isReplyEndFrame,
  isReplyStartFrame,
  utf8ByteLength,
} from "@/shared/rendererStreamChunks";

/**
 * Client-side reassembly for bounded large replies (Phase 3 item 6).
 * Portable: TextEncoder + strings only, no Node imports.
 *
 * - At most 2 concurrent reassemblies, 64MiB retained serialized bytes.
 * - Validates version/identity/contiguity/exact total/64KiB encoded bound.
 * - ACKs only after validating + accepting a chunk; stale/duplicate/
 *   out-of-order/corrupt frames never revive a request or add credit and keep
 *   the socket alive.
 * - Event-only barriers (resync-required/gap) must NOT call into here;
 *   partials drop only on transport-generation invalidation
 *   (close/disconnect/timeout/cancel/abort), which the transport owns.
 */

export interface ReassemblyEvents {
  sendAck(id: string, seq: number): void;
  sendCancel(id: string): void;
  resolveReply(id: string, data: unknown): void;
  rejectReply(id: string, error: Error): void;
}

interface ActiveTransfer {
  totalBytes: number;
  receivedBytes: number;
  expectedSeq: number;
  parts: string[];
}

export class RendererStreamReassembly {
  private readonly active = new Map<string, ActiveTransfer>();

  activeCount(): number {
    return this.active.size;
  }

  retainedBytes(): number {
    let total = 0;
    for (const transfer of this.active.values()) total += transfer.totalBytes;
    return total;
  }

  has(id: string): boolean {
    return this.active.has(id);
  }

  /** Drop one partial without resolving (transport invalidation). */
  drop(id: string): void {
    this.active.delete(id);
  }

  dropAll(): void {
    this.active.clear();
  }

  /**
   * Handle one parsed backend frame that may be a large-reply frame.
   * Returns true when the frame was a large-reply frame (handled or safely
   * dropped); false when the caller should try the ordinary reply path.
   * `hasPending` reports whether the request id still has a live caller;
   * `rawBytes` is the complete encoded frame length for the 64KiB bound.
   */
  handleBackendFrame(
    message: unknown,
    rawBytes: number,
    events: ReassemblyEvents,
    hasPending: (id: string) => boolean,
  ): boolean {
    if (typeof message !== "object" || message === null) return false;
    const type = (message as { type?: unknown }).type;
    if (
      type !== "reply-start" &&
      type !== "reply-chunk" &&
      type !== "reply-end" &&
      type !== "reply-abort"
    ) {
      return false;
    }
    // Version fence matches the ordinary reply path: a mismatched version is
    // a protocol violation the transport closes 1008 for. Here we only claim
    // v6 large frames; anything else falls through to the ordinary gate.
    if ((message as { version?: unknown }).version !== BACKEND_RENDERER_STREAM_VERSION) {
      return false;
    }

    if (isReplyStartFrame(message)) {
      this.onStart(message, events, hasPending);
      return true;
    }
    if (isReplyChunkFrame(message)) {
      this.onChunk(message, rawBytes, events, hasPending);
      return true;
    }
    if (isReplyEndFrame(message)) {
      this.onEnd(message, events, hasPending);
      return true;
    }
    if (isReplyAbortFrame(message)) {
      this.onAbort(message, events);
      return true;
    }
    // Right version+type but malformed shape: safely abort that transfer (if
    // any) with a bounded error, socket survives, never 1008 from here. When
    // no transfer exists but a caller waits, bound the failure the same way
    // instead of hanging until timeout.
    const id = (message as { id?: unknown }).id;
    if (typeof id === "string") {
      if (this.active.has(id)) {
        this.failTransfer(id, events, new Error("Malformed large-reply frame."));
      } else if (hasPending(id)) {
        events.sendCancel(id);
        events.rejectReply(id, new Error("Malformed large-reply frame."));
      }
    }
    return true;
  }

  private onStart(
    frame: { id: string; totalBytes: number },
    events: ReassemblyEvents,
    hasPending: (id: string) => boolean,
  ): void {
    if (
      !Number.isSafeInteger(frame.totalBytes) ||
      frame.totalBytes <= 0 ||
      frame.totalBytes > LARGE_REPLY_MAX_LOGICAL_BYTES
    ) {
      // Oversized head: bounded rejection when a caller waits, else prompt
      // sender release. Socket survives; never hang until timeout.
      if (hasPending(frame.id) && !this.active.has(frame.id)) {
        events.sendCancel(frame.id);
        events.rejectReply(
          frame.id,
          new Error("Backend response exceeded the renderer transport limit."),
        );
      } else {
        events.sendCancel(frame.id);
      }
      return;
    }
    if (!hasPending(frame.id)) {
      // Stale start (timed-out/settled request): free the sender promptly.
      events.sendCancel(frame.id);
      return;
    }
    if (this.active.has(frame.id)) {
      // Duplicate start cannot revive or double-reserve; keep the first.
      return;
    }
    if (this.active.size >= LARGE_REPLY_MAX_PER_CLIENT) {
      events.sendCancel(frame.id);
      events.rejectReply(frame.id, new Error("Large reply concurrency limit reached."));
      return;
    }
    let retained = frame.totalBytes;
    for (const transfer of this.active.values()) retained += transfer.totalBytes;
    if (retained > LARGE_REPLY_MAX_BYTES_PER_CLIENT) {
      events.sendCancel(frame.id);
      events.rejectReply(frame.id, new Error("Large reply byte limit reached."));
      return;
    }
    this.active.set(frame.id, {
      totalBytes: frame.totalBytes,
      receivedBytes: 0,
      expectedSeq: 0,
      parts: [],
    });
  }

  private onChunk(
    frame: { id: string; seq: number; data: string },
    rawBytes: number,
    events: ReassemblyEvents,
    hasPending: (id: string) => boolean,
  ): void {
    const transfer = this.active.get(frame.id);
    if (!transfer) {
      // Stale chunk for an unknown transfer: never revive; tell the sender to
      // release promptly when we still have a live socket.
      if (hasPending(frame.id)) events.sendCancel(frame.id);
      return;
    }
    if (!hasPending(frame.id)) {
      this.active.delete(frame.id);
      events.sendCancel(frame.id);
      return;
    }
    if (rawBytes > LARGE_REPLY_MAX_ENCODED_FRAME_BYTES) {
      this.failTransfer(frame.id, events, new Error("Large reply frame exceeded the size bound."));
      return;
    }
    if (frame.seq !== transfer.expectedSeq) {
      // Duplicate (seq < expected) or out-of-order/future (seq > expected):
      // drop safely, no credit, socket alive. Duplicates must not double-append.
      if (frame.seq < transfer.expectedSeq) return;
      this.failTransfer(frame.id, events, new Error("Large reply chunk arrived out of order."));
      return;
    }
    const logicalBytes = utf8ByteLength(frame.data);
    if (transfer.receivedBytes + logicalBytes > transfer.totalBytes) {
      this.failTransfer(frame.id, events, new Error("Large reply exceeded its declared total."));
      return;
    }
    // Accept: exact owning copy (new string part, no backing view), then ACK.
    transfer.parts.push(frame.data.slice(0));
    transfer.receivedBytes += logicalBytes;
    transfer.expectedSeq += 1;
    events.sendAck(frame.id, frame.seq);
  }

  private onEnd(
    frame: { id: string; totalBytes: number },
    events: ReassemblyEvents,
    hasPending: (id: string) => boolean,
  ): void {
    const transfer = this.active.get(frame.id);
    if (!transfer) {
      if (hasPending(frame.id)) events.sendCancel(frame.id);
      return;
    }
    if (!hasPending(frame.id)) {
      this.active.delete(frame.id);
      return;
    }
    if (frame.totalBytes !== transfer.totalBytes) {
      this.failTransfer(frame.id, events, new Error("Large reply total mismatch."));
      return;
    }
    if (transfer.receivedBytes !== transfer.totalBytes) {
      this.failTransfer(frame.id, events, new Error("Large reply ended before completion."));
      return;
    }
    const joined = transfer.parts.join("");
    if (utf8ByteLength(joined) !== transfer.totalBytes) {
      this.failTransfer(frame.id, events, new Error("Large reply byte count mismatch."));
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(joined);
    } catch {
      this.failTransfer(frame.id, events, new Error("Large reply payload was not valid JSON."));
      return;
    }
    // Exact completion: single join + single parse, then release.
    this.active.delete(frame.id);
    events.resolveReply(frame.id, data);
  }

  private onAbort(frame: { id: string; error: string }, events: ReassemblyEvents): void {
    if (!this.active.has(frame.id)) return;
    this.failTransfer(frame.id, events, new Error(frame.error));
  }

  private failTransfer(id: string, events: ReassemblyEvents, error: Error): void {
    if (!this.active.has(id)) return;
    this.active.delete(id);
    events.sendCancel(id);
    events.rejectReply(id, error);
  }
}

/** Encoded-bound helper for transport tests (raw frame string). */
export function rawFrameBytes(raw: string): number {
  return utf8ByteLength(raw);
}

export function __testOnly(): { encoded: typeof encodedFrameByteLength } {
  return { encoded: encodedFrameByteLength };
}
