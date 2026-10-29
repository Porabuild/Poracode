import { randomUUID } from "node:crypto";
import { REPLAY_RING_LIMIT, REPLAY_RING_MAX_BYTES } from "./constants.ts";

export interface ReplayEntry {
  readonly seq: number;
  readonly event: Record<string, unknown>;
  readonly bytes: number;
}

export type ReplayDecision =
  | { readonly kind: "current" }
  | { readonly kind: "replay"; readonly entries: readonly ReplayEntry[] }
  | { readonly kind: "resync"; readonly seq: number; readonly reason: string };

export class ReplayRing {
  private readonly entries: ReplayEntry[] = [];
  private nextSeq = 0;
  /** Mirrors the host's per-instance event-stream epoch (`eventEpoch=v1`). */
  private currentEpoch = randomUUID();
  /** Sessions with an undeclared connection in this epoch (host legacy fallback). */
  private readonly legacySessions = new Set<string>();

  constructor(
    private readonly limit = REPLAY_RING_LIMIT,
    private readonly maxBytes = REPLAY_RING_MAX_BYTES,
  ) {}

  get seq(): number {
    return this.nextSeq;
  }

  get epoch(): string {
    return this.currentEpoch;
  }

  /**
   * Mirrors the host's resume verification (`server/eventStreamEpoch.ts`): a
   * declared positive cursor must carry this epoch; an undeclared session's
   * first positive resume in this epoch is refused once. `lastSeenEpoch` is
   * undefined for an undeclared connection and null for a declared one
   * without a bound epoch.
   */
  verifyResume(
    sessionId: string,
    lastSeenSeq: number | null,
    lastSeenEpoch: string | null | undefined,
  ): boolean {
    const positive = lastSeenSeq !== null && lastSeenSeq >= 1;
    if (lastSeenEpoch !== undefined) return !positive || lastSeenEpoch === this.currentEpoch;
    const known = this.legacySessions.has(sessionId);
    this.legacySessions.add(sessionId);
    return !positive || known;
  }

  get size(): number {
    return this.entries.length;
  }

  get oldestSeq(): number | null {
    return this.entries[0]?.seq ?? null;
  }

  get newestSeq(): number | null {
    return this.entries.at(-1)?.seq ?? null;
  }

  reset(): void {
    this.entries.length = 0;
    this.nextSeq = 0;
    this.renewEpoch();
  }

  /**
   * Force the in-memory cursor, used by the sequence-regression fault. A
   * regressed stream is a new sequence space, exactly like a host restart.
   */
  regressTo(seq: number): void {
    this.nextSeq = seq;
    while (this.entries.length > 0 && this.entries[this.entries.length - 1]!.seq > seq) {
      this.entries.pop();
    }
    this.renewEpoch();
  }

  private renewEpoch(): void {
    this.currentEpoch = randomUUID();
    this.legacySessions.clear();
  }

  publish(
    event: Record<string, unknown>,
    options?: { readonly skipStore?: boolean; readonly sequenceGap?: number },
  ): number {
    const sequenceGap = options?.sequenceGap ?? 0;
    if (!Number.isSafeInteger(sequenceGap) || sequenceGap < 0) {
      throw new Error("Replay sequence gap must be a non-negative safe integer.");
    }
    this.nextSeq += sequenceGap;
    const seq = ++this.nextSeq;
    if (!options?.skipStore) {
      const bytes = Buffer.byteLength(JSON.stringify(event), "utf8");
      this.entries.push({ seq, event, bytes });
      this.trim();
    }
    return seq;
  }

  decide(lastSeenSeq: number | null): ReplayDecision {
    if (lastSeenSeq === null || lastSeenSeq === this.nextSeq) {
      return { kind: "current" };
    }
    if (lastSeenSeq > this.nextSeq) {
      return {
        kind: "resync",
        seq: this.nextSeq,
        reason: "Server event stream reset; request a fresh snapshot.",
      };
    }
    const replay = this.entries.filter((entry) => entry.seq > lastSeenSeq);
    if (replay.length !== this.nextSeq - lastSeenSeq) {
      return {
        kind: "resync",
        seq: this.nextSeq,
        reason: "Event replay window expired; request a fresh snapshot.",
      };
    }
    return { kind: "replay", entries: replay };
  }

  private trim(): void {
    if (this.entries.length > this.limit) {
      this.entries.splice(0, this.entries.length - this.limit);
    }
    let total = 0;
    for (const entry of this.entries) total += entry.bytes;
    let dropped = 0;
    while (dropped < this.entries.length && total > this.maxBytes) {
      total -= this.entries[dropped]!.bytes;
      dropped += 1;
    }
    if (dropped >= this.entries.length) dropped = this.entries.length - 1;
    if (dropped > 0) this.entries.splice(0, dropped);
  }
}
