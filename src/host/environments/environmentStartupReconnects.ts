import { environmentAbortError, EnvironmentRuntimeError } from "./environmentRuntimeErrors";

/**
 * Host-owned reconnect schedule for `desired: enabled` environments.
 *
 * - One owner loop per environment. Repeated triggers (`start`, a
 *   connection-relevant update, an adoption) join the running loop instead of
 *   starting another one, so the retry budget cannot multiply with the number
 *   of requests.
 * - Each loop makes at most `maxAttempts` attempts with exponential backoff and
 *   exits when the environment connects, the error is terminal, the owner is
 *   cancelled, or the service lifecycle aborts. A later trigger may start a new
 *   bounded loop only after the previous one settled.
 * - Attempts share one bounded, fair FIFO concurrency gate, so a slow or
 *   unreachable environment cannot starve the others.
 * - `awaitIdle`/`dispose` join every owner loop; `cancel` stops and joins one
 *   environment's loop.
 */

export interface EnvironmentStartupReconnectsOptions {
  readonly concurrency: number;
  readonly maxAttempts: number;
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export interface EnvironmentStartupReconnectsDeps {
  /** Runs one full host-owned connect attempt for the environment. */
  readonly runAttempt: (environmentId: string) => Promise<void>;
  /** The service lifecycle signal; aborting it stops every owner loop. */
  readonly signal: AbortSignal;
  readonly options: EnvironmentStartupReconnectsOptions;
  /** Terminal failures are not retried (for example not-found, trust gates). */
  readonly isTerminal?: (error: unknown) => boolean;
}

interface OwnerEntry {
  readonly controller: AbortController;
  promise: Promise<void>;
}

interface GateWaiter {
  resolve(): void;
  reject(error: Error): void;
}

const TERMINAL_RETRY_CODES = new Set([
  "environment/not-found",
  "environment/not-authorized",
  "environment/invalid-input",
  "environment/credential-missing",
  "environment/trust-required",
  "environment/trust-changed",
  "environment/trust-mismatch",
  "environment/hostkey-mismatch",
  "environment/identity-changed",
]);

function defaultIsTerminal(error: unknown): boolean {
  return error instanceof EnvironmentRuntimeError && TERMINAL_RETRY_CODES.has(error.code);
}

export class EnvironmentStartupReconnects {
  private readonly owners = new Map<string, OwnerEntry>();
  private readonly gateWaiters: GateWaiter[] = [];
  private activeAttempts = 0;
  private disposed = false;

  constructor(private readonly deps: EnvironmentStartupReconnectsDeps) {}

  /**
   * Run the first reconnect round for the given environments with bounded
   * concurrency. Resolves when every environment's owner loop has settled;
   * a `schedule` for an environment already in the round joins its loop.
   */
  async start(environmentIds: readonly string[]): Promise<void> {
    if (this.disposed) return;
    const queue = [...environmentIds];
    const workers = Array.from(
      { length: Math.max(1, Math.min(this.deps.options.concurrency, queue.length)) },
      async () => {
        while (queue.length > 0 && !this.disposed) {
          const environmentId = queue.shift();
          if (environmentId === undefined) return;
          await this.ensureOwner(environmentId);
        }
      },
    );
    await Promise.all(workers);
  }

  /** Start (or join) the bounded reconnect loop for one environment. */
  schedule(environmentId: string): void {
    if (this.disposed) return;
    void this.ensureOwner(environmentId).catch(() => undefined);
  }

  /** Abort and join one environment's loop; later triggers may start a new one. */
  async cancel(environmentId: string): Promise<void> {
    const owner = this.owners.get(environmentId);
    if (owner === undefined) return;
    owner.controller.abort(environmentAbortError("The environment reconnect was cancelled."));
    await owner.promise.catch(() => undefined);
  }

  /** Resolves when every owner loop has settled. */
  async awaitIdle(): Promise<void> {
    while (this.owners.size > 0) {
      await Promise.allSettled([...this.owners.values()].map((owner) => owner.promise));
    }
  }

  /** Stop admission, abort every loop, and join them. Idempotent. */
  async dispose(): Promise<void> {
    this.disposed = true;
    const owners = [...this.owners.values()];
    for (const owner of owners) {
      owner.controller.abort(environmentAbortError("The environment service was disposed."));
    }
    await this.awaitIdle();
  }

  private ensureOwner(environmentId: string): Promise<void> {
    const existing = this.owners.get(environmentId);
    if (existing !== undefined) return existing.promise;
    const controller = new AbortController();
    const onLifecycleAbort = (): void =>
      controller.abort(environmentAbortError(this.deps.signal.reason));
    this.deps.signal.addEventListener("abort", onLifecycleAbort, { once: true });
    const entry: OwnerEntry = {
      controller,
      promise: Promise.resolve(),
    };
    const promise = this.runOwner(environmentId, controller.signal).finally(() => {
      this.deps.signal.removeEventListener("abort", onLifecycleAbort);
      if (this.owners.get(environmentId) === entry) this.owners.delete(environmentId);
    });
    entry.promise = promise;
    this.owners.set(environmentId, entry);
    return promise;
  }

  private async runOwner(environmentId: string, signal: AbortSignal): Promise<void> {
    for (let attempt = 1; attempt <= this.deps.options.maxAttempts; attempt += 1) {
      if (signal.aborted || this.disposed) return;
      try {
        await this.acquire(signal);
      } catch {
        return;
      }
      let failure: unknown;
      let connected = false;
      try {
        await this.deps.runAttempt(environmentId);
        connected = true;
      } catch (error) {
        failure = error;
      } finally {
        this.release();
      }
      if (connected) return;
      if (signal.aborted || this.disposed) return;
      if (this.isTerminal(failure)) return;
      if (attempt >= this.deps.options.maxAttempts) return;
      try {
        await this.sleep(this.backoffDelay(attempt), signal);
      } catch {
        return;
      }
    }
  }

  private isTerminal(error: unknown): boolean {
    return (this.deps.isTerminal ?? defaultIsTerminal)(error);
  }

  private backoffDelay(attempt: number): number {
    const base = this.deps.options.backoffBaseMs * 2 ** Math.max(0, attempt - 1);
    return Math.min(this.deps.options.backoffMaxMs, base);
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    const sleepImpl = this.deps.options.sleep;
    if (sleepImpl !== undefined) return sleepImpl(ms, signal);
    if (ms <= 0) return Promise.resolve();
    if (signal.aborted) return Promise.reject(environmentAbortError(signal.reason));
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);
      const onAbort = (): void => {
        cleanup();
        reject(environmentAbortError(signal.reason));
      };
      const cleanup = (): void => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  /**
   * Fair FIFO concurrency gate. `release` hands the slot directly to the
   * longest-waiting attempt; an abort removes the waiter and rejects it.
   */
  private acquire(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(environmentAbortError(signal.reason));
    if (this.activeAttempts < this.deps.options.concurrency) {
      this.activeAttempts += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const waiter: GateWaiter = {
        resolve: () => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        },
        reject: (error) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      };
      const onAbort = (): void => {
        const index = this.gateWaiters.indexOf(waiter);
        if (index >= 0) this.gateWaiters.splice(index, 1);
        reject(environmentAbortError(signal.reason));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      this.gateWaiters.push(waiter);
    });
  }

  private release(): void {
    const next = this.gateWaiters.shift();
    if (next !== undefined) next.resolve();
    else this.activeAttempts = Math.max(0, this.activeAttempts - 1);
  }
}
