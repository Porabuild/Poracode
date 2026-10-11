import { toError } from "@/shared/errorMessage";
import type { StructuredSessionHandle } from "@/supervisor/agents/base";
import type { HostResourceLease } from "@/supervisor/runtime/hostResourceAdmission";
import {
  settlesWithin,
  StructuredDisposalCustody,
} from "@/supervisor/runtime/threadSession/structuredDisposalCustody";
import type { OneShotChildHandle } from "./oneShotChild";

/**
 * One attempt generation's resource ownership, independent of the mutable run
 * record. Caller deadlines cover every cleanup phase; acquisition and disposal
 * continue under this custody after a join times out.
 */
export class SubagentAttemptCustody {
  handle: StructuredSessionHandle | undefined;
  oneShot: OneShotChildHandle | undefined;
  lease: HostResourceLease | undefined;
  retiring = false;
  retired = false;
  readonly disposal: StructuredDisposalCustody;
  private acquisition: Promise<unknown> | undefined;
  private startup: Promise<void> | undefined;
  private join: Promise<void> | undefined;
  private operation: Promise<void> | undefined;
  private interrupt: Promise<void> | undefined;
  private interruptOperation: Promise<void> | undefined;
  private cancelledOneShot = false;
  private acquired = false;

  constructor(
    readonly parentThreadId: string,
    readonly childThreadId: string,
    private readonly timeoutMs: number,
    private readonly onRetired: () => void,
  ) {
    this.disposal = new StructuredDisposalCustody(
      () => {
        const operation = this.cleanup();
        this.operation = operation;
        return operation;
      },
      {
        timeoutMs,
        onConfirmed: () => this.confirm(),
        onFailure: (error) => {
          console.warn(
            `[supervisor] failed to retire subagent ${childThreadId}; its execution slot stays counted:`,
            error,
          );
        },
      },
    );
  }

  get hasLiveResources(): boolean {
    return (
      !this.retired &&
      Boolean(
        this.handle ||
        this.oneShot ||
        (this.lease && this.lease.state !== "released") ||
        this.acquisition ||
        this.startup ||
        this.retiring,
      )
    );
  }

  /** Publish acquisition before invoking code that can synchronously settle/cancel. */
  acquire<T>(operation: () => Promise<T>, accept: (value: T) => void): Promise<T> {
    const acquisition = Promise.resolve()
      .then(operation)
      .then((value) => {
        accept(value);
        return value;
      })
      .finally(() => {
        if (this.acquisition === acquisition) this.acquisition = undefined;
      });
    this.acquisition = acquisition;
    return acquisition;
  }

  setHandle(handle: StructuredSessionHandle): void {
    this.handle = handle;
    this.activateLease();
  }

  setOneShot(handle: OneShotChildHandle): void {
    this.oneShot = handle;
    this.activateLease();
    // Exit observation outlives logical cancellation and manager map eviction.
    void handle.closed.then(
      () => {
        if (this.oneShot === handle) this.confirm();
      },
      () => {}, // Rejection alone is not evidence of exit.
    );
  }

  private activateLease(): void {
    this.acquired = true;
    this.lease?.activate();
    if (this.retiring) this.lease?.beginRetirement();
  }

  start(operation: () => Promise<unknown>): Promise<void> {
    const startup = Promise.resolve()
      .then(() => {
        if (!this.retiring && !this.retired) return operation();
        return undefined;
      })
      .then(() => {})
      .finally(() => {
        if (this.startup === startup) this.startup = undefined;
      });
    this.startup = startup;
    return startup;
  }

  /** A close during startup cannot fence resources that startup may acquire later. */
  closed(handle: StructuredSessionHandle): void {
    if (this.handle === handle && !this.acquisition && !this.startup) this.confirm();
  }

  releaseUnstarted(): void {
    if (!this.handle && !this.oneShot && !this.acquisition && !this.startup && !this.retiring) {
      this.confirm();
    }
  }

  teardown(): Promise<void> {
    if (this.join) return this.join;
    if (this.retired) return Promise.resolve();
    this.retiring = true;
    this.lease?.beginRetirement();
    const deadline = performance.now() + this.timeoutMs;
    // Publish before interrupt/cancel callbacks can re-enter. All phase joins
    // share the whole-cleanup budget; the underlying operation is retained.
    const join = Promise.resolve()
      .then(async () => {
        const retryingFailure = this.disposal.error !== undefined;
        this.disposal.begin();
        // Observe the initial phases before the final operation join so an
        // immediate interrupt/dispose needs no deadline timer. A failed cleanup
        // retry skips the original interrupt, whose bounded wait already ended.
        let withinDeadline = true;
        for (const phase of [
          this.acquisition,
          retryingFailure ? undefined : this.interruptOperation,
          this.startup,
        ]) {
          if (phase && !(await settlesWithin(phase, Math.max(0, deadline - performance.now())))) {
            withinDeadline = false;
            break;
          }
        }
        if (withinDeadline && !this.retired && this.operation && performance.now() < deadline) {
          await settlesWithin(this.operation, Math.max(0, deadline - performance.now()));
        }
        if (!this.retired) {
          throw toError(
            this.disposal.error ??
              new Error(`Subagent ${this.childThreadId} retirement did not confirm exit.`),
          );
        }
      })
      .finally(() => {
        if (this.join === join) this.join = undefined;
      });
    this.join = join;
    return join;
  }

  private async cleanup(): Promise<void> {
    try {
      // Creation may still produce a handle. Neither timeout nor cancellation
      // cancels that acquisition; the same cleanup owns its eventual result.
      if (this.acquisition) await this.acquisition.catch(() => undefined);
      if (this.retired) return;
      const oneShot = this.oneShot;
      if (oneShot) {
        if (!this.cancelledOneShot) {
          this.cancelledOneShot = true;
          oneShot.cancel();
        }
        await oneShot.closed;
        return;
      }
      const handle = this.handle;
      if (!handle) return;
      if (handle.interruptTurn && !this.interrupt) {
        // Best effort only: a hung interrupt RPC must not prevent real disposal.
        // The RPC itself is never cancelled or issued again on a cleanup retry.
        let interruption: Promise<void>;
        try {
          interruption = handle.interruptTurn();
        } catch {
          interruption = Promise.resolve();
        }
        this.interruptOperation = interruption;
        this.interrupt = new Promise<void>((resolve) => {
          // Resolve directly from the RPC so fast cleanup does not wait for
          // another bounded-join promise chain before disposing.
          const timer = setTimeout(resolve, this.timeoutMs);
          const done = () => {
            clearTimeout(timer);
            resolve();
          };
          void interruption.then(done, done);
        });
      }
      if (this.interrupt) await this.interrupt;
      // activate/openThread may still acquire a process/session; wait for their
      // fence before disposing. startTurn's lifetime is deliberately excluded.
      if (this.startup) await this.startup.catch(() => undefined);
      if (!this.retired) await handle.dispose();
    } catch (error) {
      // Rejection may carry undefined; the shared custody needs a real failure
      // to distinguish it from successful confirmation and permit retry.
      throw toError(error);
    }
  }

  private confirm(): void {
    if (this.retired) return;
    this.retired = true;
    if (this.acquired) this.lease?.confirmExit();
    else this.lease?.cancel();
    this.onRetired();
    this.handle = undefined;
    this.oneShot = undefined;
  }
}
