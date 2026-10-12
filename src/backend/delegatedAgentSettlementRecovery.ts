import type { RuntimeEvent } from "@/shared/contracts";
import { addRuntimePersistenceHealthListener } from "@/host/db/runtimePersistenceRuntime";
import {
  settleDeferredDelegatedAgentRuns,
  delegatedAgentSettlementRefusal,
  type DelegatedAgentSettlementRefusal,
  type DelegatedAgentBootSettleReport,
} from "./delegatedAgentBootSettle";

/**
 * Host-owned continuation of a positively retired generation. Captures contain
 * item IDs only; recovery cannot expand them to a replacement supervisor's
 * runs. The existing access scheduler owns bounded waits; availability/health
 * notifications and explicit gap acknowledgement supply subsequent attempts.
 */
export class DelegatedAgentSettlementRecovery {
  private readonly candidates = new Map<string, Set<string>>();
  private readonly refusals = new Map<string, DelegatedAgentSettlementRefusal>();
  private readonly warned = new Map<string, Set<DelegatedAgentSettlementRefusal>>();
  private readonly attempts = new Map<string, Promise<void>>();
  private readonly unsubscribe: () => void;
  private disposed = false;

  constructor(private readonly publish: (threadId: string, events: RuntimeEvent[]) => void) {
    this.unsubscribe = addRuntimePersistenceHealthListener({
      onThreadAccessAvailable: () => {
        // Release on another thread can free the scheduler's global slots.
        // Gap/storage refusals need their own recovery, not access retries.
        this.retryRefused("busy");
      },
      onStateChange: (info) => {
        if (info.state === "healthy") this.retryRefused("storage");
      },
      onCapacityChange: (change) => {
        if (change.kind === "committed") this.retryRefused("storage");
      },
    });
  }

  capture(report: DelegatedAgentBootSettleReport): void {
    if (this.disposed) return;
    for (const batch of report.deferredBatches ?? []) {
      const ids = this.candidates.get(batch.threadId) ?? new Set<string>();
      for (const id of batch.itemIds) ids.add(id);
      this.candidates.set(batch.threadId, ids);
      this.recordRefusal(batch.threadId, batch.refusal, batch.error);
      if (batch.refusal !== "gap") void this.retry(batch.threadId);
    }
  }

  /** Called under the supervisor dispatch lock, before publishing thread-reset. */
  async recoverAfterAcknowledgement(threadId: string): Promise<void> {
    await this.attempts.get(threadId);
    await this.retry(threadId);
  }

  /** An authoritative transcript reset retires any obsolete continuation. */
  forget(threadId: string): void {
    this.candidates.delete(threadId);
    this.refusals.delete(threadId);
    this.warned.delete(threadId);
  }

  dispose(): Promise<void> {
    this.disposed = true;
    this.unsubscribe();
    this.candidates.clear();
    this.refusals.clear();
    this.warned.clear();
    return Promise.all(this.attempts.values()).then(() => {});
  }

  private retryRefused(reason: DelegatedAgentSettlementRefusal): void {
    for (const [threadId, refusal] of this.refusals)
      if (refusal === reason) void this.retry(threadId);
  }

  private recordRefusal(
    threadId: string,
    refusal: DelegatedAgentSettlementRefusal,
    error: unknown,
  ): void {
    this.refusals.set(threadId, refusal);
    const warnings = this.warned.get(threadId) ?? new Set<DelegatedAgentSettlementRefusal>();
    if (warnings.has(refusal)) return;
    warnings.add(refusal);
    this.warned.set(threadId, warnings);
    console.warn(
      `[backend] Delegated-agent recovery deferred (${refusal}) for ${threadId}:`,
      error,
    );
  }

  private retry(threadId: string): Promise<void> {
    const running = this.attempts.get(threadId);
    if (running) return running;
    const ids = this.candidates.get(threadId);
    if (this.disposed || !ids) return Promise.resolve();
    const captured = new Set(ids);
    let repaired = false;
    // Scheduling can throw synchronously (e.g. connection retirement). An
    // already-committed gap acknowledgement must still publish its reset.
    const attempt = Promise.resolve()
      .then(() =>
        settleDeferredDelegatedAgentRuns(
          threadId,
          captured,
          () => !this.disposed && this.candidates.get(threadId) === ids,
        ),
      )
      .then((events) => {
        if (this.disposed || this.candidates.get(threadId) !== ids) return;
        repaired = true;
        this.refusals.delete(threadId);
        for (const id of captured) ids.delete(id);
        if (ids.size === 0) {
          this.candidates.delete(threadId);
          this.warned.delete(threadId);
        }
        if (events.length) {
          try {
            this.publish(threadId, events);
          } catch (error) {
            console.error("[backend] delegated-agent recovery publication failed:", error);
          }
        }
      })
      .catch((error: unknown) => {
        if (this.disposed || this.candidates.get(threadId) !== ids) return;
        this.recordRefusal(threadId, delegatedAgentSettlementRefusal(error), error);
      })
      .finally(() => {
        this.attempts.delete(threadId);
        // A reset may forget this Set and recapture IDs while the old attempt
        // is still queued. Continue the new capture independently of its result.
        const current = this.candidates.get(threadId);
        if (current && (repaired || current !== ids) && this.refusals.get(threadId) !== "gap")
          void this.retry(threadId);
      });
    this.attempts.set(threadId, attempt);
    return attempt;
  }
}
