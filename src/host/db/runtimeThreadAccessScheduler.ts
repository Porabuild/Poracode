import { RuntimePersistenceBusyError, type RuntimeFenceToken } from "./runtimePersistenceTypes";

/**
 * Per-thread access scheduler: one FIFO lock per thread that serializes the
 * read-fence barrier and content-mutating operations, with process- and
 * thread-level waiter bounds, per-request deadlines, and cancellation.
 *
 * Why this is one cohesive module and not a generic framework: the fence
 * driver and the mutation gate must serialize against each other, share the
 * same bounded waiter accounting, and share one deadline timer. Splitting them
 * would require a second lock and a second timer that could disagree; this
 * module is the concrete mechanism for exactly those two request kinds.
 *
 * Bounds (no unbounded map or timer per waiter):
 * - At most `maxFenceWaitersPerThread` queued fences behind the active one.
 * - At most `maxMutationWaitersPerThread` queued mutations per thread.
 * - At most `maxWaitersTotal` queued requests across all threads; beyond that
 *   the request is refused typed (`RuntimePersistenceBusyError`) instead of
 *   queueing.
 * - One `setTimeout` for the earliest deadline; cleared when no entries remain.
 * - Every entry carries a deadline; expired waiters settle `deadline`
 *   (fence) or reject busy (mutation) even when their caller never arrives, so
 *   the maps cannot retain abandoned work.
 */

export type ThreadMutationKind = "truncate" | "replace" | "reset" | "delete" | "acknowledge";

export type FenceTurnResult = { kind: "granted" } | { kind: "cancelled" } | { kind: "deadline" };

export interface RuntimeThreadAccessSchedulerOptions {
  now?: () => number;
  /** Queued fences allowed behind the active fence for one thread. */
  maxFenceWaitersPerThread?: number;
  /** Queued mutations allowed per thread behind the running request. */
  maxMutationWaitersPerThread?: number;
  /** Queued requests allowed across all threads (fences + mutations). */
  maxWaitersTotal?: number;
  /** How long one fence may hold the thread before it is force-released. */
  fenceMaxHoldMs?: number;
  /** Default mutation admission deadline. */
  mutationDeadlineMs?: number;
  /** Retry hint carried by busy refusals. */
  busyRetryAfterMs?: number;
  /** Test seam: invoked whenever the internal timer is armed/disarmed. */
  onTimerChange?: (armed: boolean) => void;
}

interface FenceEntry {
  kind: "fence";
  threadId: string;
  token: RuntimeFenceToken;
  enqueuedAt: number;
  deadlineAt: number;
  grantedAt: number | null;
  settled: boolean;
  cancelled: boolean;
  settleWaiter: ((result: FenceTurnResult) => void) | null;
}

interface MutationEntry {
  kind: "mutation";
  threadId: string;
  mutation: ThreadMutationKind;
  enqueuedAt: number;
  deadlineAt: number;
  settled: boolean;
}

type Entry = FenceEntry | MutationEntry;

export class RuntimeThreadAccessScheduler {
  private readonly queues = new Map<string, Entry[]>();
  private readonly entries = new Set<Entry>();
  private readonly mutationTurnWaiters = new Map<MutationEntry, (granted: boolean) => void>();
  private readonly options: Required<Omit<RuntimeThreadAccessSchedulerOptions, "onTimerChange">> & {
    onTimerChange?: (armed: boolean) => void;
  };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(options: RuntimeThreadAccessSchedulerOptions = {}) {
    this.options = {
      now: () => Date.now(),
      maxFenceWaitersPerThread: 2,
      maxMutationWaitersPerThread: 4,
      maxWaitersTotal: 32,
      fenceMaxHoldMs: 5_000,
      mutationDeadlineMs: 5_000,
      busyRetryAfterMs: 250,
      ...options,
    };
  }

  /**
   * Register a fence request and return its token. The caller captures the
   * published cursor in the same turn; `flushFence` then awaits this token's
   * turn. Throws `RuntimePersistenceBusyError` when the waiter bounds are full.
   */
  beginFence(threadId: string, throughPersistSeq: number, generation: number): RuntimeFenceToken {
    if (this.disposed) {
      throw new RuntimePersistenceBusyError(threadId, "fence", this.options.busyRetryAfterMs);
    }
    const queue = this.queues.get(threadId) ?? [];
    const queuedFences = queue.filter(
      (entry) => entry.kind === "fence" && !entry.settled && entry.grantedAt === null,
    ).length;
    if (
      queuedFences >= this.options.maxFenceWaitersPerThread ||
      this.entries.size >= this.options.maxWaitersTotal
    ) {
      throw new RuntimePersistenceBusyError(threadId, "fence", this.options.busyRetryAfterMs);
    }
    const now = this.options.now();
    const entry: FenceEntry = {
      kind: "fence",
      threadId,
      token: { threadId, throughPersistSeq, generation },
      enqueuedAt: now,
      deadlineAt: now + this.options.fenceMaxHoldMs,
      grantedAt: null,
      settled: false,
      cancelled: false,
      settleWaiter: null,
    };
    queue.push(entry);
    this.queues.set(threadId, queue);
    this.entries.add(entry);
    this.schedule();
    return entry.token;
  }

  /**
   * Await this token's turn. Resolves `granted` when the token is at the head
   * and no other request holds the thread; `cancelled`/`deadline` otherwise.
   * Safe to call after settlement.
   */
  waitFenceTurn(token: RuntimeFenceToken): Promise<FenceTurnResult> {
    const entry = this.findFence(token);
    if (!entry) return Promise.resolve({ kind: "cancelled" });
    if (entry.settled) {
      return Promise.resolve(entry.cancelled ? { kind: "cancelled" } : { kind: "deadline" });
    }
    if (entry.grantedAt !== null) return Promise.resolve({ kind: "granted" });
    if (this.isHeadRun(entry)) {
      this.markGranted(entry);
      return Promise.resolve({ kind: "granted" });
    }
    return new Promise<FenceTurnResult>((resolve) => {
      entry.settleWaiter = resolve;
    });
  }

  /** Settle a granted/completed fence and promote the next request on its thread. */
  settleFence(token: RuntimeFenceToken): number | null {
    const entry = this.findFence(token);
    if (entry && !entry.settled) this.settle(entry, { kind: "deadline" });
    return this.currentPin(token.threadId);
  }

  /**
   * Cancel every fence for a thread. Queued fences settle `cancelled` now; a
   * granted fence is marked so its driver observes the cancellation between
   * chunks. Returns the affected tokens.
   */
  cancelFencesForThread(threadId: string): RuntimeFenceToken[] {
    const queue = [...(this.queues.get(threadId) ?? [])];
    const affected: RuntimeFenceToken[] = [];
    for (const entry of queue) {
      if (entry.kind !== "fence" || entry.settled) continue;
      entry.cancelled = true;
      affected.push(entry.token);
      if (entry.grantedAt === null) this.settle(entry, { kind: "cancelled" });
    }
    return affected;
  }

  /**
   * Run one content mutation under the thread's serialization. The operation
   * executes at the head and may await (the lock is held until it settles).
   * Rejects typed busy when the waiter bounds are full or the deadline elapses
   * before the turn.
   */
  async runMutation<T>(
    threadId: string,
    mutation: ThreadMutationKind,
    operation: () => T | Promise<T>,
    options: { deadlineMs?: number } = {},
  ): Promise<T> {
    if (this.disposed) {
      throw new RuntimePersistenceBusyError(threadId, "mutation", this.options.busyRetryAfterMs);
    }
    const queue = this.queues.get(threadId) ?? [];
    const queuedMutations = queue.filter(
      (entry) => entry.kind === "mutation" && !entry.settled,
    ).length;
    if (
      queuedMutations >= this.options.maxMutationWaitersPerThread ||
      this.entries.size >= this.options.maxWaitersTotal
    ) {
      throw new RuntimePersistenceBusyError(threadId, "mutation", this.options.busyRetryAfterMs);
    }
    const now = this.options.now();
    const entry: MutationEntry = {
      kind: "mutation",
      threadId,
      mutation,
      enqueuedAt: now,
      deadlineAt: now + (options.deadlineMs ?? this.options.mutationDeadlineMs),
      settled: false,
    };
    queue.push(entry);
    this.queues.set(threadId, queue);
    this.entries.add(entry);
    this.schedule();

    const granted = await this.waitForMutationTurn(entry);
    if (!granted) {
      throw new RuntimePersistenceBusyError(threadId, "mutation", this.options.busyRetryAfterMs);
    }
    // Deletion preempts fences: cancel any fence still queued or active for
    // this thread so its readers settle cancelled instead of racing the
    // discard. An active fence driver observes the flag between chunks.
    if (mutation === "delete") this.cancelFencesForThread(threadId);

    try {
      return await operation();
    } finally {
      this.settleMutation(entry);
    }
  }

  /**
   * Synchronous mutation fast path for callers whose public contract is
   * synchronous (the checkpoint-revert truncate boundary). It acquires the
   * thread only when nothing is queued or active for it; otherwise it refuses
   * `{ granted: false }` so the caller can raise a typed busy error. Because
   * the whole acquisition runs in one turn, no fence can start inside the
   * operation, and fences enqueued afterwards queue behind the settled gate.
   */
  tryRunMutationSync<T>(
    threadId: string,
    _mutation: ThreadMutationKind,
    operation: () => T,
  ): { granted: true; value: T } | { granted: false } {
    if (this.disposed || this.queues.has(threadId)) return { granted: false };
    return { granted: true, value: operation() };
  }

  /** Number of queued requests (diagnostics/tests). */
  waiterCount(threadId?: string): number {
    if (threadId !== undefined) {
      return (this.queues.get(threadId) ?? []).filter((entry) => !entry.settled).length;
    }
    return this.entries.size;
  }

  /** Whether any fence currently holds this thread. */
  hasActiveFence(threadId: string): boolean {
    return (this.queues.get(threadId) ?? []).some(
      (entry) => entry.kind === "fence" && entry.grantedAt !== null && !entry.settled,
    );
  }

  /** Whether the token still holds its thread (between grant and settle). */
  isFenceActive(token: RuntimeFenceToken): boolean {
    const entry = this.findFence(token);
    return entry !== undefined && !entry.settled && entry.grantedAt !== null;
  }

  isFenceCancelled(token: RuntimeFenceToken): boolean {
    const entry = this.findFence(token);
    return entry === undefined || entry.cancelled || entry.settled;
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    const pending = [...this.entries];
    for (const entry of pending) {
      if (entry.kind === "fence") this.settle(entry, { kind: "cancelled" });
      else this.settleMutation(entry);
    }
    this.entries.clear();
    this.queues.clear();
    this.mutationTurnWaiters.clear();
  }

  private findFence(token: RuntimeFenceToken): FenceEntry | undefined {
    const queue = this.queues.get(token.threadId);
    if (!queue) return undefined;
    for (const entry of queue) {
      if (entry.kind === "fence" && entry.token === token) return entry;
    }
    return undefined;
  }

  private isHeadRun(entry: FenceEntry | MutationEntry): boolean {
    const queue = this.queues.get(entry.threadId);
    return queue !== undefined && queue[0] === entry;
  }

  private markGranted(entry: FenceEntry): void {
    if (entry.grantedAt === null) entry.grantedAt = this.options.now();
  }

  /** Pin of the thread's queue head fence, or null when no fence is queued. */
  private currentPin(threadId: string): number | null {
    const queue = this.queues.get(threadId) ?? [];
    for (const entry of queue) {
      if (entry.kind === "fence" && !entry.settled) return entry.token.throughPersistSeq;
    }
    return null;
  }

  private settle(entry: FenceEntry, result: FenceTurnResult): void {
    if (entry.settled) return;
    entry.settled = true;
    if (result.kind === "cancelled") entry.cancelled = true;
    this.removeEntry(entry);
    const waiter = entry.settleWaiter;
    entry.settleWaiter = null;
    if (waiter) waiter(result);
    this.promoteNext(entry.threadId);
  }

  private settleMutation(entry: MutationEntry): void {
    if (entry.settled) return;
    entry.settled = true;
    this.removeEntry(entry);
    const waiter = this.mutationTurnWaiters.get(entry);
    if (waiter) {
      this.mutationTurnWaiters.delete(entry);
      waiter(false);
    }
    this.promoteNext(entry.threadId);
  }

  private removeEntry(entry: Entry): void {
    this.entries.delete(entry);
    const queue = this.queues.get(entry.threadId);
    if (!queue) return;
    const index = queue.indexOf(entry);
    if (index >= 0) queue.splice(index, 1);
    if (queue.length === 0) this.queues.delete(entry.threadId);
    this.schedule();
  }

  /**
   * Promote the next queued request on a thread. A fence head is granted to
   * its `waitFenceTurn` waiter; a mutation head resolves its turn promise so
   * `runMutation` continues after the await microtask.
   */
  private promoteNext(threadId: string): void {
    if (this.disposed) return;
    const queue = this.queues.get(threadId);
    if (!queue || queue.length === 0) return;
    const head = queue[0]!;
    if (head.settled) return;
    if (head.kind === "fence") {
      if (head.grantedAt !== null) return;
      this.markGranted(head);
      const waiter = head.settleWaiter;
      head.settleWaiter = null;
      if (waiter) waiter({ kind: "granted" });
      return;
    }
    const waiter = this.mutationTurnWaiters.get(head);
    if (waiter) {
      this.mutationTurnWaiters.delete(head);
      waiter(true);
    }
  }

  private waitForMutationTurn(entry: MutationEntry): Promise<boolean> {
    const queue = this.queues.get(entry.threadId);
    if (queue && queue[0] === entry && !entry.settled) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      this.mutationTurnWaiters.set(entry, resolve);
    });
  }

  private schedule(): void {
    if (this.disposed) return;
    let earliest: number | null = null;
    for (const entry of this.entries) {
      const effective =
        entry.kind === "fence" && entry.grantedAt !== null
          ? entry.grantedAt + this.options.fenceMaxHoldMs
          : entry.deadlineAt;
      if (earliest === null || effective < earliest) earliest = effective;
    }
    if (earliest === null) {
      this.clearTimer();
      return;
    }
    const delay = Math.max(0, earliest - this.options.now());
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.options.onTimerChange?.(false);
      this.expire();
    }, delay);
    this.timer.unref?.();
    this.options.onTimerChange?.(true);
  }

  private clearTimer(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.options.onTimerChange?.(false);
  }

  private expire(): void {
    if (this.disposed) return;
    const now = this.options.now();
    for (const entry of [...this.entries]) {
      if (entry.settled) continue;
      if (entry.kind === "mutation") {
        if (now >= entry.deadlineAt) this.settleMutation(entry);
        continue;
      }
      if (entry.grantedAt !== null) {
        if (now >= entry.grantedAt + this.options.fenceMaxHoldMs) {
          entry.cancelled = true;
          this.settle(entry, { kind: "deadline" });
        }
        continue;
      }
      if (now >= entry.deadlineAt) this.settle(entry, { kind: "deadline" });
    }
    this.schedule();
  }
}
