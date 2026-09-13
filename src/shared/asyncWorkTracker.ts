/**
 * Joins actual continuations, independently of their client/socket lifetime.
 * The owner must close external admission before draining. Work already
 * admitted may register more owned continuations while the drain is pending.
 */
export class AsyncWorkTracker {
  private readonly pending = new Set<Promise<unknown>>();

  run<T>(operation: () => T | PromiseLike<T>): Promise<T> {
    const work = Promise.withResolvers<T>();
    this.pending.add(work.promise);
    const settled = () => {
      this.pending.delete(work.promise);
    };
    void work.promise.then(settled, settled);
    // Register first, including when a synchronous callback initiates disposal.
    try {
      work.resolve(operation());
    } catch (error) {
      work.reject(error);
    }
    return work.promise;
  }

  async drain(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled([...this.pending]);
    }
  }
}
