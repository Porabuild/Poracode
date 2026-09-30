import { spawn } from "node:child_process";
import { terminateChildProcessTree } from "@/shared/processTree";

export interface SpawnAndAwaitExitOptions {
  /**
   * Hard deadline for the child. On expiry the process tree is terminated,
   * SIGKILL is escalated after a bounded grace, and the promise settles on the
   * child's actual exit — or, if SIGKILL cannot reap it, with an explicit
   * "could not be confirmed exited" error. It never resolves successfully on a
   * deadline and never leaves the caller pending forever.
   */
  timeoutMs?: number;
  /** Caller cancellation; behaves like the timeout for process termination. */
  signal?: AbortSignal;
  /** Human-readable label for error messages (defaults to the command). */
  label?: string;
  /**
   * Grace after the initial terminate (SIGTERM / `taskkill`) before escalating
   * to SIGKILL. Test seam; production uses the default.
   */
  terminateGraceMs?: number;
  /**
   * Bound on awaiting the child's exit after SIGKILL. When the child still has
   * not exited, the promise rejects with an explicit "could not be confirmed
   * exited" error instead of holding the caller forever. Test seam; production
   * uses the default.
   */
  reapTimeoutMs?: number;
}

/** Grace before escalating a timed-out/aborted child from SIGTERM to SIGKILL. */
const TERMINATE_GRACE_MS = 2_000;
/** Bound on awaiting the actual exit after SIGKILL before reporting failure. */
const REAP_TIMEOUT_MS = 2_000;

/**
 * Spawn a child process and resolve when it exits 0; reject on non-zero
 * exit (with stderr in the message), spawn error, timeout, or abort. Used by
 * both the WSL and native runtime resolvers for `tar` extraction — same
 * `windowsHide` + stderr-collection pattern, parameterized only by argv.
 *
 * Timeout/abort terminate the process tree, escalate to SIGKILL after a
 * bounded grace, and then join the child's actual `exit` event, so no
 * background extraction can race a successor install. A child that survives
 * SIGKILL is never silently released: the promise rejects with an error that
 * says its exit could not be confirmed.
 */
export function spawnAndAwaitExit(
  command: string,
  args: readonly string[],
  options?: SpawnAndAwaitExitOptions,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const label = options?.label ?? command;
    const terminateGraceMs = options?.terminateGraceMs ?? TERMINATE_GRACE_MS;
    const reapTimeoutMs = options?.reapTimeoutMs ?? REAP_TIMEOUT_MS;
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let settled = false;
    let exited = false;
    let timedOut = false;
    let aborted = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    let reapTimer: ReturnType<typeof setTimeout> | undefined;
    const clearTimers = (): void => {
      if (timer) clearTimeout(timer);
      if (graceTimer) clearTimeout(graceTimer);
      if (reapTimer) clearTimeout(reapTimer);
      graceTimer = undefined;
      reapTimer = undefined;
      timer = undefined;
    };
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimers();
      options?.signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    };
    const deadlineError = (): Error => {
      if (timedOut) {
        return new Error(`${label} timed out after ${options?.timeoutMs}ms: ${stderr.trim()}`);
      }
      const reason = options?.signal?.reason;
      return reason instanceof Error ? reason : new Error(`${label} aborted`);
    };
    const unconfirmedExitError = (): Error => {
      const detail = stderr.trim() ? `: ${stderr.trim()}` : "";
      const trigger = timedOut ? `timed out after ${options?.timeoutMs}ms` : "was aborted";
      return new Error(
        `${label} ${trigger} and could not be confirmed exited after SIGKILL; ` +
          `process ${child.pid ?? "unknown"} may still be running${detail}`,
      );
    };
    /**
     * SIGKILL escalation. Ownership is only released on the child's actual
     * exit; when SIGKILL cannot reap it either, the caller is told so instead
     * of being left pending forever or handed a false success.
     */
    const escalate = (): void => {
      if (settled || exited) return;
      try {
        child.kill("SIGKILL");
      } catch {
        // Best effort; the reap timer below bounds the wait either way.
      }
      reapTimer = setTimeout(() => {
        reapTimer = undefined;
        if (settled || exited) return;
        finish(unconfirmedExitError());
      }, reapTimeoutMs);
      reapTimer.unref?.();
    };
    const terminate = (): void => {
      if (settled || exited) return;
      terminateChildProcessTree(child);
      if (settled || exited || graceTimer) return;
      graceTimer = setTimeout(() => {
        graceTimer = undefined;
        escalate();
      }, terminateGraceMs);
      graceTimer.unref?.();
    };
    const onAbort = (): void => {
      aborted = true;
      terminate();
    };
    timer = options?.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          terminate();
        }, options.timeoutMs)
      : undefined;
    timer?.unref?.();
    options?.signal?.addEventListener("abort", onAbort, { once: true });
    if (options?.signal?.aborted) onAbort();

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => finish(error));
    child.on("exit", (code) => {
      exited = true;
      if (timedOut) {
        finish(deadlineError());
        return;
      }
      if (aborted) {
        finish(deadlineError());
        return;
      }
      if (code === 0) finish();
      else finish(new Error(`${label} exited ${code}: ${stderr.trim()}`));
    });
  });
}
