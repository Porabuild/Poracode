/**
 * Single-writer lock for one ACP session's configuration.
 *
 * ACP config writes are not idempotent from the caller's point of view — an
 * interrupted write has an unknown outcome — so every mutation of the live
 * session's config options flows through one lock: the prompt's own
 * `applyTurnConfig` push and the live config-option setter share it. The
 * prompt path queues behind an in-flight write (its push must land after the
 * earlier mutation settled), while the live setter refuses to queue — a menu
 * action fired while a write is unresolved is a conflict, never a blind
 * second mutation.
 */

export class ConfigWriteLock {
  private tail: Promise<void> = Promise.resolve();
  /** Holders plus queued `runExclusive` tasks — any of them blocks a new acquire. */
  private busy = 0;
  private held = false;

  /**
   * Queue `task` after every prior write and run it while holding the lock.
   * Used by the session's own config push, which must serialize against (not
   * race) writes that were already in flight when the turn started.
   */
  runExclusive<T>(task: () => Promise<T> | T): Promise<T> {
    this.busy += 1;
    const run = async (): Promise<T> => {
      this.held = true;
      try {
        return await task();
      } finally {
        this.held = false;
      }
    };
    const result = this.tail.then(run, run);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    void result.then(
      () => {
        this.busy -= 1;
      },
      () => {
        this.busy -= 1;
      },
    );
    return result;
  }

  /**
   * Acquire the lock immediately, or return `undefined` when any write is in
   * flight or queued. The caller owns the returned `release`; it may be
   * deferred past the logical operation (an unabortable wire write whose
   * outcome is still unknown keeps the writer held so no second mutation can
   * start).
   */
  tryAcquire(): { release: () => void } | undefined {
    if (this.busy > 0 || this.held) return undefined;
    this.busy += 1;
    this.held = true;
    // A manual lease is part of the same queue as runExclusive. Merely
    // marking it busy prevents another menu setter, but does not stop a
    // prompt's queued task from running against the previous resolved tail.
    let releaseQueue!: () => void;
    this.tail = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.held = false;
        this.busy -= 1;
        releaseQueue();
      },
    };
  }

  /** True while a write is executing or queued for the lock. */
  isBusy(): boolean {
    return this.busy > 0;
  }
}
