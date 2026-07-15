import type { StructuredSessionUpdate } from "../base";

/**
 * Holds the turn-completion status update (idle/error) that must not reach the
 * thread while background subagent tasks are still live.
 *
 * The main turn's `result` settles turn bookkeeping and emits `turn.completed`
 * immediately, but flipping the status channel to idle at that point would mark
 * a GUI thread finished while its background tasks keep running. The stored
 * update is released once the live-task registry drains (the last
 * `task_notification` closes), or flushed verbatim if the stream stops first so
 * the thread never stays stuck `working`. The full update is retained so an
 * error result still surfaces as `error`, not `idle`.
 */
export class DeferredTurnCompletion {
  private pending: StructuredSessionUpdate | undefined;

  get hasPending(): boolean {
    return this.pending !== undefined;
  }

  defer(update: StructuredSessionUpdate): void {
    this.pending = update;
  }

  clear(): void {
    this.pending = undefined;
  }

  take(): StructuredSessionUpdate | undefined {
    const update = this.pending;
    this.pending = undefined;
    return update;
  }
}
