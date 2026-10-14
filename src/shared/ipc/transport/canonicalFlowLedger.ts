import { randomUUID } from "node:crypto";

/**
 * B1 canonical credit ledger: one supervisor boot's in-flight byte window.
 *
 * The host grants a window and acknowledges a cumulative sequence prefix after
 * it has resolved (admitted or explicitly refused) each envelope. Every
 * canonical envelope emitted while a window is active is charged the exact
 * estimate the producer gated on and stays charged — including bytes already
 * handed to the Node IPC channel, the kernel, or the host's receiver — until
 * that ack arrives. The sender queue's own capacity is therefore not the
 * in-flight bound; this ledger is.
 *
 * Fences that keep the accounting honest:
 * - every grant/ack must echo this boot's generation; anything else is ignored
 *   (a restarted supervisor must never free bytes a previous boot emitted);
 * - an ack above the highest sequence this boot emitted is ignored rather than
 *   clamped (clamping would release envelopes the host never received);
 * - a locally dropped envelope releases its own entry immediately, and a later
 *   cumulative ack cannot subtract it twice;
 * - the entry count is bounded independently of the byte window so a stream of
 *   tiny envelopes cannot outgrow the sender's bulk message capacity.
 */
export class CanonicalFlowLedger {
  private readonly bootGeneration: string;
  private readonly maxEntries: number;
  private readonly entries = new Map<number, number>();
  private seqCounter = 0;
  private ackedSeq = 0;
  private outstandingBytes = 0;
  private windowBytes: number | null = null;

  constructor(options: { generation?: string; maxEntries: number }) {
    this.bootGeneration = options.generation ?? randomUUID();
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries));
  }

  /** Boot generation the host must echo on every credit grant and ack. */
  get generation(): string {
    return this.bootGeneration;
  }

  isActive(): boolean {
    return this.windowBytes !== null;
  }

  /**
   * Apply a negotiated window (or disable accounting with `windowBytes: null`).
   * Returns false — and changes nothing — for a stale/missing generation, so a
   * grant from another boot can never authorize a window this process did not
   * negotiate.
   */
  setWindow(credit: { windowBytes: number | null; ackSeq?: number; generation?: string }): boolean {
    if (credit.generation !== this.bootGeneration) return false;
    if (credit.windowBytes === null) {
      this.windowBytes = null;
      this.entries.clear();
      this.outstandingBytes = 0;
      return true;
    }
    this.windowBytes = Math.max(0, Math.floor(credit.windowBytes));
    if (credit.ackSeq !== undefined) this.applyAck(credit.ackSeq);
    return true;
  }

  /**
   * Advance the acknowledged prefix. Rejects stale generations, non-integer
   * values, and sequences this boot never emitted.
   */
  acknowledge(ackSeq: number, generation: string): boolean {
    if (generation !== this.bootGeneration) return false;
    if (!Number.isFinite(ackSeq) || !Number.isInteger(ackSeq) || ackSeq <= 0) return false;
    if (ackSeq > this.seqCounter) return false;
    this.applyAck(ackSeq);
    return true;
  }

  /**
   * Charge one canonical envelope. Returns its flow identity when a window is
   * active, or null when the static fallback applies (no host credit).
   */
  assign(bytes: number): { flowSeq: number; flowBytes: number } | null {
    if (this.windowBytes === null) return null;
    const flowSeq = ++this.seqCounter;
    this.entries.set(flowSeq, bytes);
    this.outstandingBytes += bytes;
    return { flowSeq, flowBytes: bytes };
  }

  /**
   * Release a locally refused envelope that never reached the channel. A later
   * cumulative ack that covers the same sequence finds no entry and cannot
   * subtract its bytes again.
   */
  release(flowSeq: number | undefined): void {
    if (typeof flowSeq !== "number") return;
    const bytes = this.entries.get(flowSeq);
    if (bytes === undefined) return;
    this.entries.delete(flowSeq);
    this.outstandingBytes = Math.max(0, this.outstandingBytes - bytes);
  }

  /** Remaining canonical bytes the host will credit right now. */
  remaining(): number {
    if (this.windowBytes === null) return Number.POSITIVE_INFINITY;
    if (this.entries.size >= this.maxEntries) return 0;
    return Math.max(0, this.windowBytes - this.outstandingBytes);
  }

  /** Outstanding charged bytes (diagnostics/tests). */
  outstanding(): number {
    return this.outstandingBytes;
  }

  /** Highest sequence emitted this boot (diagnostics/tests). */
  highestSeq(): number {
    return this.seqCounter;
  }

  private applyAck(ackSeq: number): void {
    if (ackSeq <= this.ackedSeq) return;
    this.ackedSeq = ackSeq;
    for (const [seq, bytes] of this.entries) {
      if (seq <= ackSeq) {
        this.entries.delete(seq);
        this.outstandingBytes -= bytes;
      }
    }
    if (this.outstandingBytes < 0) this.outstandingBytes = 0;
  }
}
