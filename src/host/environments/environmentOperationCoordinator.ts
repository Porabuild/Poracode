import { EnvironmentOperationBusyError, environmentAbortError } from "./environmentRuntimeErrors";

/**
 * Admission bounds. A burst above these limits is not normal environment
 * traffic: the coordinator refuses with a bounded busy error so a hostile or
 * runaway caller can neither grow an unbounded per-environment queue nor pin
 * an unbounded number of waiters on one operation.
 */
export const ENVIRONMENT_OPERATION_MAX_PENDING_GLOBAL = 64;
export const ENVIRONMENT_OPERATION_MAX_PENDING_PER_ENVIRONMENT = 8;
export const ENVIRONMENT_OPERATION_MAX_WAITERS_GLOBAL = 256;
export const ENVIRONMENT_OPERATION_MAX_WAITERS_PER_ENVIRONMENT = 32;

/**
 * Per-environment operation generations with serialized admission.
 *
 * - At most one operation per environment runs at a time; a `run` with the
 *   same coalesce key joins the in-flight one (a second client never starts a
 *   duplicate connect), and a different key queues behind it.
 * - `runExclusive` cancels *and joins* every operation for the environment
 *   (including queued ones) before admitting a mutation, so update/delete/
 *   disconnect can never overlap a connect or upgrade.
 * - Caller aborts detach one caller; the underlying operation is aborted only
 *   when no waiter still owns it. Closing one client never disturbs another's
 *   connect, and the service-level desired state is untouched by callers.
 * - Generations fence late results: a superseded operation's completion can
 *   never publish over a newer generation.
 */
export interface EnvironmentOperationContext {
  readonly generation: number;
  readonly signal: AbortSignal;
}

interface OperationSlot {
  readonly environmentId: string;
  readonly kind: string;
  readonly coalesceKey: string;
  readonly generation: number;
  readonly controller: AbortController;
  waiters: number;
  completion: Promise<unknown>;
}

export interface EnvironmentOperationOptions {
  readonly kind: string;
  readonly coalesceKey: string;
  readonly signal?: AbortSignal;
}

export class EnvironmentOperationCoordinator {
  private readonly slots = new Map<string, OperationSlot>();
  private readonly slotsByEnvironment = new Map<string, Set<OperationSlot>>();
  private readonly tails = new Map<string, Promise<void>>();
  private readonly pendingByEnvironment = new Map<string, number>();
  private readonly waitersByEnvironment = new Map<string, number>();
  private pendingTotal = 0;
  private waitersTotal = 0;
  private generationCounter = 0;
  private mutationCounter = 0;
  private disposed = false;
  private disposeStarted: Promise<void> | null = null;

  get generation(): number {
    return this.generationCounter;
  }

  current(environmentId: string): { kind: string; generation: number } | undefined {
    const slot = this.slots.get(environmentId);
    return slot === undefined ? undefined : { kind: slot.kind, generation: slot.generation };
  }

  run<T>(
    environmentId: string,
    options: EnvironmentOperationOptions,
    work: (context: EnvironmentOperationContext) => Promise<T>,
  ): Promise<T> {
    if (this.disposed) {
      return Promise.reject(environmentAbortError("The environment service was disposed."));
    }
    const existing = this.slots.get(environmentId);
    if (
      existing &&
      !existing.controller.signal.aborted &&
      existing.coalesceKey === options.coalesceKey
    ) {
      const coalesced = this.checkAdmission(environmentId, options.signal);
      if (coalesced !== undefined) return Promise.reject(coalesced);
      return this.attach<T>(existing, options.signal);
    }
    const admission = this.checkAdmission(environmentId, options.signal);
    if (admission !== undefined) return Promise.reject(admission);
    const previous = this.tails.get(environmentId) ?? Promise.resolve();
    const controller = new AbortController();
    const slot: OperationSlot = {
      environmentId,
      kind: options.kind,
      coalesceKey: options.coalesceKey,
      generation: ++this.generationCounter,
      controller,
      waiters: 0,
      completion: undefined as unknown as Promise<unknown>,
    };
    const completion = (async () => {
      await previous.catch(() => undefined);
      if (this.disposed) {
        throw environmentAbortError("The environment service was disposed.");
      }
      if (controller.signal.aborted) {
        throw environmentAbortError(controller.signal.reason);
      }
      return work({ generation: slot.generation, signal: controller.signal });
    })().finally(() => {
      if (this.slots.get(environmentId) === slot) this.slots.delete(environmentId);
      const set = this.slotsByEnvironment.get(environmentId);
      if (set) {
        set.delete(slot);
        if (set.size === 0) this.slotsByEnvironment.delete(environmentId);
      }
      if (this.tails.get(environmentId) === tail) this.tails.delete(environmentId);
      this.releasePending(environmentId);
    });
    slot.completion = completion;
    this.slots.set(environmentId, slot);
    this.retainPending(environmentId);
    const set = this.slotsByEnvironment.get(environmentId) ?? new Set<OperationSlot>();
    set.add(slot);
    this.slotsByEnvironment.set(environmentId, set);
    const tail = completion.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(environmentId, tail);
    // Keep an early rejection observed even when the caller attaches later.
    void completion.catch(() => undefined);
    return this.attach<T>(slot, options.signal);
  }

  /**
   * Cancel every operation for the environment (running and queued) and join
   * them before admitting `work` as the next serialized operation.
   *
   * `validate` runs first, synchronously: a mutation that already fails its
   * own admission (stale revision, invalid input) rejects without touching any
   * in-flight operation. The service still re-validates inside `work`, because
   * the small validate→abort window is not a serialization point.
   */
  async runExclusive<T>(
    environmentId: string,
    reason: Error,
    work: (context: EnvironmentOperationContext) => Promise<T>,
    validate?: () => void,
  ): Promise<T> {
    if (this.disposed) {
      throw environmentAbortError("The environment service was disposed.");
    }
    validate?.();
    const admission = this.checkAdmission(environmentId);
    if (admission !== undefined) throw admission;
    const pending = [...(this.slotsByEnvironment.get(environmentId) ?? [])];
    for (const slot of pending) slot.controller.abort(reason);
    const result = this.run<T>(
      environmentId,
      { kind: "mutation", coalesceKey: `mutation:${++this.mutationCounter}` },
      work,
    );
    await Promise.allSettled(pending.map((slot) => slot.completion));
    return result;
  }

  /** Abort and join the environment's operations without admitting new work. */
  async cancel(environmentId: string, reason: Error): Promise<void> {
    const pending = [...(this.slotsByEnvironment.get(environmentId) ?? [])];
    for (const slot of pending) slot.controller.abort(reason);
    await Promise.allSettled(pending.map((slot) => slot.completion));
  }

  /** Abort and join every operation across all environments; idempotent. */
  dispose(
    reason: Error = environmentAbortError("The environment service was disposed."),
  ): Promise<void> {
    this.disposed = true;
    if (!this.disposeStarted) {
      const started = (async () => {
        const all = [...this.slotsByEnvironment.values()].flatMap((set) => [...set]);
        for (const slot of all) slot.controller.abort(reason);
        await Promise.allSettled(all.map((slot) => slot.completion));
        await Promise.allSettled([...this.tails.values()]);
      })();
      this.disposeStarted = started;
    }
    return this.disposeStarted;
  }

  /** Resolves when the environment's serialized queue drains. */
  async whenIdle(environmentId: string): Promise<void> {
    await (this.tails.get(environmentId) ?? Promise.resolve());
  }

  /**
   * Wait for one operation as one caller. An abort detaches this caller and
   * cancels the underlying work only when it was the last waiter.
   */
  private attach<T>(slot: OperationSlot, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let detached = false;
      const detach = (): boolean => {
        if (detached) return true;
        detached = true;
        slot.waiters -= 1;
        this.releaseWaiter(slot.environmentId);
        signal?.removeEventListener("abort", onAbort);
        return false;
      };
      const onAbort = (): void => {
        if (detach()) return;
        if (slot.waiters === 0) slot.controller.abort(environmentAbortError(signal?.reason));
        reject(environmentAbortError(signal?.reason));
      };
      slot.waiters += 1;
      this.retainWaiter(slot.environmentId);
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      slot.completion.then(
        (value) => {
          if (!detach()) resolve(value as T);
        },
        (error) => {
          if (!detach()) reject(error);
        },
      );
    });
  }

  /**
   * The bounded admission check: pending operations and attached waiters are
   * both capped globally and per environment. `undefined` admits.
   */
  private checkAdmission(environmentId: string, signal?: AbortSignal): Error | undefined {
    if (
      this.pendingTotal >= ENVIRONMENT_OPERATION_MAX_PENDING_GLOBAL ||
      (this.pendingByEnvironment.get(environmentId) ?? 0) >=
        ENVIRONMENT_OPERATION_MAX_PENDING_PER_ENVIRONMENT
    ) {
      return new EnvironmentOperationBusyError(ENVIRONMENT_OPERATION_MAX_PENDING_GLOBAL);
    }
    if (signal !== undefined && signal.aborted) return undefined;
    if (
      this.waitersTotal >= ENVIRONMENT_OPERATION_MAX_WAITERS_GLOBAL ||
      (this.waitersByEnvironment.get(environmentId) ?? 0) >=
        ENVIRONMENT_OPERATION_MAX_WAITERS_PER_ENVIRONMENT
    ) {
      return new EnvironmentOperationBusyError(ENVIRONMENT_OPERATION_MAX_WAITERS_GLOBAL);
    }
    return undefined;
  }

  private retainPending(environmentId: string): void {
    this.pendingTotal += 1;
    this.pendingByEnvironment.set(
      environmentId,
      (this.pendingByEnvironment.get(environmentId) ?? 0) + 1,
    );
  }

  private releasePending(environmentId: string): void {
    this.pendingTotal = Math.max(0, this.pendingTotal - 1);
    const next = (this.pendingByEnvironment.get(environmentId) ?? 1) - 1;
    if (next <= 0) this.pendingByEnvironment.delete(environmentId);
    else this.pendingByEnvironment.set(environmentId, next);
  }

  private retainWaiter(environmentId: string): void {
    this.waitersTotal += 1;
    this.waitersByEnvironment.set(
      environmentId,
      (this.waitersByEnvironment.get(environmentId) ?? 0) + 1,
    );
  }

  private releaseWaiter(environmentId: string): void {
    this.waitersTotal = Math.max(0, this.waitersTotal - 1);
    const next = (this.waitersByEnvironment.get(environmentId) ?? 1) - 1;
    if (next <= 0) this.waitersByEnvironment.delete(environmentId);
    else this.waitersByEnvironment.set(environmentId, next);
  }
}
