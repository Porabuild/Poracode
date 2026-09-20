import { AsyncWorkTracker } from "@/shared/asyncWorkTracker";
import { joinRuntimeShutdown } from "@/shared/joinRuntimeShutdown";

/** Own full driver continuations as well as cancellation between native steps. */
export class NativeActionLifetime {
  private readonly work = new AsyncWorkTracker();
  private cancellation = new AbortController();
  private closed = false;
  private closing: Promise<void> | undefined;

  run<T>(action: (signal: AbortSignal) => T | PromiseLike<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error("Computer-use driver is closed."));
    const signal = this.cancellation.signal;
    return this.work.run(() => {
      signal.throwIfAborted();
      return action(signal);
    });
  }

  /** Interrupt the current generation; later user-authorized work may start anew. */
  interrupt(): void {
    this.cancellation.abort(new Error("Computer-use action was interrupted."));
    if (!this.closed) this.cancellation = new AbortController();
  }

  close(stops: readonly (() => void | Promise<void>)[]): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    const barrier = Promise.withResolvers<void>();
    this.closing = barrier.promise;
    this.interrupt();
    // Native stop must wake/cancel pending operations before the work join.
    // Keep the full admitted continuation, including its cleanup, in the join.
    void joinRuntimeShutdown(
      [...stops, () => this.work.drain()],
      "Native driver shutdown is unconfirmed.",
    ).then(barrier.resolve, (error: unknown) => {
      this.closing = undefined;
      barrier.reject(error);
    });
    return barrier.promise;
  }
}
