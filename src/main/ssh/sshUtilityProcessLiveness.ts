/**
 * Exit-observation custody for one forked utility process (C3/A5).
 *
 * Electron's `UtilityProcess` does not reliably expose an `exitCode`, and a
 * `kill()` return value is not proof that a process exited. The supervisor
 * therefore attaches an `exit` listener at fork time and keeps the observed
 * exit as the only evidence of a join:
 *
 * - an exit that happens before the supervisor reaches its join point is never
 *   missed (the listener was already attached);
 * - `waitForExit` reports `null` on timeout instead of pretending the process
 *   is gone;
 * - `terminateAndJoin` only reports success once the real `exit` event was
 *   observed.
 *
 * Callers must not `release()` before an exit was observed: the observed exit
 * is what settles waiters, so a pre-exit release would strand them. The
 * supervisor only releases after `hasExited` is true or a join succeeded.
 */

/** Structural slice of a child process needed to observe its real exit. */
export interface SshUtilityProcessHandle {
  readonly exitCode?: number | null;
  kill(): boolean;
  on(event: string, listener: (...args: never[]) => void): unknown;
  off?(event: string, listener: (...args: never[]) => void): unknown;
}

export interface SshUtilityExitInfo {
  readonly code: number | null;
}

export class SshUtilityChildLiveness {
  private exitValue: SshUtilityExitInfo | null = null;
  private readonly waiters = new Set<(value: SshUtilityExitInfo) => void>();
  private readonly exitPromise: Promise<SshUtilityExitInfo>;
  private resolveExit: (value: SshUtilityExitInfo) => void = () => undefined;

  private readonly onExit = (code: number | null): void => {
    this.recordExit(code);
  };

  constructor(private readonly child: SshUtilityProcessHandle) {
    this.exitPromise = new Promise<SshUtilityExitInfo>((resolve) => {
      this.resolveExit = resolve;
    });
    child.on("exit", this.onExit);
    // A fake or an Electron build that does expose an already-settled
    // `exitCode` is honored even before the event loop delivers `exit`.
    if (typeof child.exitCode === "number") this.recordExit(child.exitCode);
  }

  get hasExited(): boolean {
    return this.exitValue !== null;
  }

  get exitInfo(): SshUtilityExitInfo | null {
    return this.exitValue;
  }

  /** Resolves once with the observed exit; never rejects and never changes value. */
  get exited(): Promise<SshUtilityExitInfo> {
    return this.exitPromise;
  }

  /**
   * Wait for the real `exit` event. Returns `null` on timeout — never a
   * synthetic success, so a bounded failure stays truthful.
   */
  waitForExit(timeoutMs: number): Promise<SshUtilityExitInfo | null> {
    if (this.exitValue !== null) return Promise.resolve(this.exitValue);
    if (!(timeoutMs > 0)) return Promise.resolve(null);
    return new Promise<SshUtilityExitInfo | null>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const waiter = (value: SshUtilityExitInfo) => {
        if (timer !== null) clearTimeout(timer);
        resolve(value);
      };
      this.waiters.add(waiter);
      timer = setTimeout(() => {
        this.waiters.delete(waiter);
        resolve(null);
      }, timeoutMs);
      timer.unref?.();
    });
  }

  /** Ask the process to terminate, then join its real exit (or report `null`). */
  async terminateAndJoin(kill: () => void, timeoutMs: number): Promise<SshUtilityExitInfo | null> {
    if (this.exitValue !== null) return this.exitValue;
    kill();
    return this.waitForExit(timeoutMs);
  }

  /** Stop observing a child whose exit was already observed (or joined). */
  release(): void {
    this.child.off?.("exit", this.onExit);
  }

  private recordExit(code: number | null): void {
    if (this.exitValue !== null) return;
    this.exitValue = { code };
    this.resolveExit(this.exitValue);
    for (const waiter of [...this.waiters]) waiter(this.exitValue);
    this.waiters.clear();
  }
}
