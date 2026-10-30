/**
 * Per-thread backoff for re-running a failed history recovery. Each failure
 * spends the next delay; a success or an external baseline resets the budget.
 */
export interface RecoveryRetries {
  /** Schedules the next attempt; false once the budget is spent (and reset). */
  schedule(threadId: string): boolean;
  /** Drops a pending attempt but keeps the spent budget. */
  cancel(threadId: string): void;
  reset(threadId: string): void;
  clear(): void;
}

export function createRecoveryRetries(
  delaysMs: readonly number[],
  retry: (threadId: string) => void,
): RecoveryRetries {
  const attempts = new Map<string, number>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const cancel = (threadId: string): void => {
    const timer = timers.get(threadId);
    if (timer === undefined) return;
    clearTimeout(timer);
    timers.delete(threadId);
  };

  return {
    schedule(threadId) {
      const attempt = attempts.get(threadId) ?? 0;
      const delay = delaysMs[attempt];
      cancel(threadId);
      if (delay === undefined) {
        attempts.delete(threadId);
        return false;
      }
      attempts.set(threadId, attempt + 1);
      timers.set(
        threadId,
        setTimeout(() => {
          timers.delete(threadId);
          retry(threadId);
        }, delay),
      );
      return true;
    },
    cancel,
    reset(threadId) {
      cancel(threadId);
      attempts.delete(threadId);
    },
    clear() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      attempts.clear();
    },
  };
}
