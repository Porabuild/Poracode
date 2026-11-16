import type { EventSequenceSpace } from "@/shared/eventSequenceSpace";

interface AppliedEvents {
  head: number;
  readonly threads: Map<string, number>;
}

/** In-memory cursors belong to one host session, independent of its location.
 * HTTP resume cursors and live per-thread marks remain separate: a catalog
 * snapshot cannot prove that a thread's transcript or live stream was applied. */
export class HostSession {
  generation = 0;
  private readonly applied = new Map<EventSequenceSpace, AppliedEvents>();
  private resumeSequence = 0;
  private resumeEpoch: string | undefined;
  private fence = 0;

  appliedSequence(space: EventSequenceSpace = "loopback"): number {
    return this.applied.get(space)?.head ?? 0;
  }

  threadSequence(threadId: string, space: EventSequenceSpace = "loopback"): number | undefined {
    return this.applied.get(space)?.threads.get(threadId);
  }

  recordApplied(
    seq: number,
    threadIds: readonly string[],
    space: EventSequenceSpace = "loopback",
  ): void {
    let ledger = this.applied.get(space);
    if (!ledger) {
      ledger = { head: 0, threads: new Map() };
      this.applied.set(space, ledger);
    }
    ledger.head = Math.max(ledger.head, seq);
    for (const threadId of threadIds) {
      if ((ledger.threads.get(threadId) ?? 0) < seq) ledger.threads.set(threadId, seq);
    }
  }

  clearApplied(): void {
    this.applied.clear();
  }

  get resumeSeq(): number {
    return this.resumeSequence;
  }

  get epoch(): string | undefined {
    return this.resumeEpoch;
  }

  get resumeFence(): number {
    return this.fence;
  }

  advanceResume(seq: number, fence?: number): void {
    if (fence !== undefined && fence !== this.fence) return;
    this.resumeSequence = Math.max(this.resumeSequence, seq);
  }

  bindResume(seq: number, epoch?: string): void {
    this.resumeSequence = seq;
    if (this.resumeEpoch === epoch) return;
    this.resumeEpoch = epoch;
    this.fence += 1;
  }

  clearResume(): void {
    this.resumeSequence = 0;
    this.resumeEpoch = undefined;
    this.fence += 1;
  }
}

/** Thread ids touched by a single event or a multi-thread runtime batch. */
export function hostEventThreadIds(event: unknown): readonly string[] {
  if (!event || typeof event !== "object") return [];
  const record = event as { threadId?: unknown; batches?: unknown };
  if (typeof record.threadId === "string") return [record.threadId];
  if (!Array.isArray(record.batches)) return [];
  return record.batches.flatMap((batch: { threadId?: unknown } | null) =>
    typeof batch?.threadId === "string" ? [batch.threadId] : [],
  );
}
