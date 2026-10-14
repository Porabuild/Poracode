import type { RuntimeControlWriteResult } from "./runtimePersistenceController";

/**
 * Bounded, retrying queue for small idempotent control writes (thread-state
 * rows, completed-turn anchors). A failed control write must not be dropped:
 * the durable row would silently freeze at a stale status while the published
 * cursor advanced past the state event. Every operation here is idempotent by
 * construction (row upserts; completed turns dedupe by start/end timestamps;
 * anchor ids are read after the thread's prefix commits), so retrying is safe.
 *
 * Policy is finite and explicit:
 * - The queue is capacity-bounded; overflow is refused (`"refused"`), never
 *   grown without limit.
 * - FIFO order is preserved; an operation may coalesce by `key` (newest wins)
 *   so a burst of `thread-state` transitions for one thread converges on the
 *   latest row instead of replaying every intermediate state.
 * - Each entry has a bounded attempt count and a fixed backoff curve. After
 *   the last attempt the entry is dropped with a loud diagnostic (the
 *   controller's degraded state already reflects the storage problem); it is
 *   never retried forever.
 * - One owner drives `processDue()` from the persistence flush cycle; there is
 *   no timer per operation.
 */

export interface RuntimeControlOperation {
  /** Coalescing identity; a newer operation with the same key replaces the queued one. */
  readonly key?: string;
  /** Diagnostic label. */
  readonly describe: string;
  /** Idempotent write. May be async; the queue awaits it without holding a timer. */
  readonly run: () => void | Promise<void>;
  /**
   * Called after each completed attempt (success or final failure) so the
   * caller can publish a deferred envelope or record diagnostics.
   */
  readonly onCompleted?: (result: RuntimeControlWriteResult) => void;
}

interface QueuedControlOperation {
  operation: RuntimeControlOperation;
  attempts: number;
  dueAt: number;
}

export interface RuntimeControlOperationQueueOptions {
  maxOperations?: number;
  maxAttempts?: number;
  backoffMs?: readonly number[];
  now?: () => number;
  execute: (
    operation: RuntimeControlOperation,
  ) => RuntimeControlWriteResult | Promise<RuntimeControlWriteResult>;
  onDropped?: (operation: RuntimeControlOperation, result: RuntimeControlWriteResult) => void;
}

const DEFAULT_MAX_CONTROL_OPERATIONS = 256;
/**
 * A retrying control write is a small, idempotent upsert. The attempt bound
 * keeps the promise "retained and retried, never dropped silently" finite: the
 * final failure is reported, not retried forever, and the health state already
 * tells the operator the storage path is failing.
 */
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BACKOFF_MS = [50, 100, 250, 500, 1_000] as const;

export class RuntimeControlOperationQueue {
  private readonly entries: QueuedControlOperation[] = [];
  private readonly options: Required<Omit<RuntimeControlOperationQueueOptions, "onDropped">> & {
    onDropped?: RuntimeControlOperationQueueOptions["onDropped"];
  };
  private processing = false;

  constructor(options: RuntimeControlOperationQueueOptions) {
    this.options = {
      maxOperations: DEFAULT_MAX_CONTROL_OPERATIONS,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      backoffMs: DEFAULT_BACKOFF_MS,
      now: () => Date.now(),
      ...options,
    };
  }

  enqueue(operation: RuntimeControlOperation): "accepted" | "refused" {
    if (operation.key !== undefined) {
      const existing = this.entries.findIndex((entry) => entry.operation.key === operation.key);
      if (existing >= 0) {
        const previous = this.entries[existing]!;
        this.entries[existing] = {
          operation,
          attempts: previous.attempts,
          dueAt: this.options.now(),
        };
        return "accepted";
      }
    }
    if (this.entries.length >= this.options.maxOperations) return "refused";
    this.entries.push({ operation, attempts: 0, dueAt: this.options.now() });
    return "accepted";
  }

  /**
   * Run due operations, oldest first, at most `maxPerCycle`. Stops at the
   * first operation that is not yet due so strict FIFO order is preserved (a
   * later operation never overtakes a retrying earlier one). Never throws;
   * async operations are awaited one at a time through `processing`.
   */
  processDue(maxPerCycle = 8): number {
    if (this.processing) return 0;
    this.processing = true;
    void this.runDue(maxPerCycle).finally(() => {
      this.processing = false;
    });
    return Math.min(maxPerCycle, this.entries.length);
  }

  private async runDue(maxPerCycle: number): Promise<void> {
    let processed = 0;
    while (processed < maxPerCycle && this.entries.length > 0) {
      const head = this.entries[0]!;
      if (head.dueAt > this.options.now()) break;
      const keepGoing = await this.executeAttempt(head);
      processed += 1;
      if (!keepGoing) break;
    }
  }

  private async executeAttempt(entry: QueuedControlOperation): Promise<boolean> {
    let result: RuntimeControlWriteResult;
    try {
      result = await this.options.execute(entry.operation);
    } catch (error) {
      // The execute callback is not supposed to throw; a throw is an unknown
      // failure. Treat it as storage-class (retryable, finite) rather than
      // letting an unhandled rejection escape the queue.
      result = { ok: false, errorClass: "storage", error };
    }
    if (result.ok) {
      this.entries.shift();
      this.notifyCompleted(entry.operation, result);
      return true;
    }
    entry.attempts += 1;
    const fatal = result.errorClass === "fatal";
    if (fatal || entry.attempts >= this.options.maxAttempts) {
      this.entries.shift();
      this.notifyCompleted(entry.operation, result);
      try {
        this.options.onDropped?.(entry.operation, result);
      } catch (error) {
        console.error("[db] runtime control-op drop handler failed:", error);
      }
      return true;
    }
    const backoff =
      this.options.backoffMs[Math.min(entry.attempts - 1, this.options.backoffMs.length - 1)] ??
      1_000;
    entry.dueAt = this.options.now() + backoff;
    return false;
  }

  private notifyCompleted(
    operation: RuntimeControlOperation,
    result: RuntimeControlWriteResult,
  ): void {
    try {
      operation.onCompleted?.(result);
    } catch (error) {
      console.error("[db] runtime control-op completion handler failed:", error);
    }
  }

  hasPending(): boolean {
    return this.entries.length > 0;
  }

  pendingCount(): number {
    return this.entries.length;
  }

  /** Drop pending operations. Only used at close after the drain report. */
  clear(): void {
    this.entries.length = 0;
  }
}
