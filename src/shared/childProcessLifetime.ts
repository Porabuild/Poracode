import type { ChildProcess } from "node:child_process";

export interface ChildProcessStopOptions {
  graceMs?: number;
  forceMs?: number;
}

/**
 * Observe immediately after spawn. `close` joins exit and the child's pipes;
 * `killed` only records that a signal was sent. This owns the immediate child,
 * not arbitrary descendants or applications intentionally opened by a tool.
 */
export class ChildProcessLifetime {
  readonly closed: Promise<void>;
  private didClose = false;
  private stopping: Promise<void> | undefined;

  constructor(private readonly child: ChildProcess) {
    this.closed = new Promise<void>((resolve) => {
      child.once("close", () => {
        this.didClose = true;
        resolve();
      });
    });
    // A failed spawn still emits close. Keep error handling while callers
    // retire their action listeners and the process/streams are being joined.
    child.on("error", () => {});
  }

  stop(options: ChildProcessStopOptions = {}): Promise<void> {
    if (this.didClose) return this.closed;
    if (this.stopping) return this.stopping;
    const barrier = Promise.withResolvers<void>();
    this.stopping = barrier.promise;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const settle = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error !== undefined) {
        this.stopping = undefined;
        barrier.reject(error);
      } else {
        barrier.resolve();
      }
    };
    void this.closed.then(() => settle());
    const signal = (value: NodeJS.Signals) => {
      // Never signal a numeric PID after this ChildProcess has exited: the
      // number may now identify an unrelated process. Pipes can outlive exit.
      if (
        typeof this.child.pid !== "number" ||
        !Number.isSafeInteger(this.child.pid) ||
        this.child.pid <= 0 ||
        this.child.exitCode !== null ||
        this.child.signalCode !== null
      )
        return;
      this.child.kill(value);
    };
    timer = setTimeout(() => {
      try {
        signal("SIGKILL");
      } catch (error) {
        settle(error);
        return;
      }
      timer = setTimeout(
        () => settle(new Error("Owned child exit and pipe closure remain unconfirmed.")),
        options.forceMs ?? 1_000,
      );
    }, options.graceMs ?? 2_000);
    try {
      signal("SIGTERM");
    } catch (error) {
      settle(error);
    }
    return barrier.promise;
  }
}
