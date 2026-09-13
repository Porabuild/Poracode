import { AsyncWorkTracker } from "@/shared/asyncWorkTracker";
import type { SendPush, SendPushInput, SendPushResult } from "./pushGateway";

export interface PushScheduler {
  setTimeout(handler: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

const defaultScheduler: PushScheduler = {
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => clearTimeout(handle),
};

/** Own every delayed callback and push continuation until permanent stop joins. */
export class PushWorkScope {
  private readonly work = new AsyncWorkTracker();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private closing: Promise<void> | undefined;
  private stopped = false;

  constructor(
    private readonly sendPush: SendPush,
    private readonly scheduler: PushScheduler = defaultScheduler,
  ) {}

  get closed(): boolean {
    return this.stopped;
  }

  run(operation: () => Promise<void>): void {
    if (this.stopped) return;
    void this.work.run(operation).catch(() => {});
  }

  send(input: SendPushInput): Promise<SendPushResult> {
    if (this.stopped) return Promise.reject(new Error("Push notifications are stopping."));
    return this.sendPush(input);
  }

  /** Preserve failure semantics while joining siblings before propagating them. */
  async join(work: readonly Promise<void>[]): Promise<void> {
    const results = await Promise.allSettled(work);
    const errors = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason as unknown] : [],
    );
    if (errors.length > 0) throw new AggregateError(errors, "Push notification delivery failed.");
  }

  hasTimer(key: string): boolean {
    return this.timers.has(key);
  }

  clearTimer(key: string): void {
    const pending = this.timers.get(key);
    if (pending === undefined) return;
    this.timers.delete(key);
    this.scheduler.clearTimeout(pending);
  }

  schedule(key: string, operation: () => Promise<void>, delayMs: number): void {
    if (this.stopped) return;
    const handle = this.scheduler.setTimeout(() => {
      if (this.timers.get(key) !== handle) return;
      this.timers.delete(key);
      this.run(operation);
    }, delayMs);
    if (this.stopped) this.scheduler.clearTimeout(handle);
    else this.timers.set(key, handle);
  }

  dispose(): Promise<void> {
    if (this.closing) return this.closing;
    this.stopped = true;
    const barrier = Promise.withResolvers<void>();
    this.closing = barrier.promise;
    const errors: unknown[] = [];
    for (const key of this.timers.keys()) {
      try {
        this.clearTimer(key);
      } catch (error) {
        errors.push(error);
      }
    }
    void this.work
      .drain()
      .then(() => {
        if (errors.length) throw new AggregateError(errors, "Push timers could not be stopped.");
      })
      .then(barrier.resolve, barrier.reject);
    return this.closing;
  }
}
