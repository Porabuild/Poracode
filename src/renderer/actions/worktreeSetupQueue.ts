interface WorktreeSetupJob {
  key: string;
  run: () => Promise<void>;
  resolve: () => void;
}

/**
 * Runs resource-heavy worktree setup scripts one at a time. Package managers
 * already parallelize internally; running several installs together mostly
 * multiplies CPU, filesystem metadata churn, and native rebuild contention.
 */
export class WorktreeSetupQueue {
  private active = false;
  private pending: WorktreeSetupJob[] = [];

  enqueue(key: string, run: () => Promise<void>): Promise<void> {
    return new Promise<void>((resolve) => {
      this.pending.push({ key, run, resolve });
      this.drain();
    });
  }

  cancelPending(key: string): void {
    const kept: WorktreeSetupJob[] = [];
    for (const job of this.pending) {
      if (job.key === key) {
        job.resolve();
      } else {
        kept.push(job);
      }
    }
    this.pending = kept;
  }

  private drain(): void {
    if (this.active) return;
    const job = this.pending.shift();
    if (!job) return;

    this.active = true;
    void Promise.resolve()
      .then(job.run)
      .catch((error) => {
        console.warn(
          "[renderer] worktree setup failed:",
          error instanceof Error ? error.message : error,
        );
      })
      .finally(() => {
        this.active = false;
        job.resolve();
        this.drain();
      });
  }
}

const worktreeSetupQueue = new WorktreeSetupQueue();

export function enqueueWorktreeSetup(key: string, run: () => Promise<void>): Promise<void> {
  return worktreeSetupQueue.enqueue(key, run);
}

export function cancelPendingWorktreeSetup(key: string): void {
  worktreeSetupQueue.cancelPending(key);
}
