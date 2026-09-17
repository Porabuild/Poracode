import { spawnSync, type ChildProcess } from "node:child_process";

/**
 * spawnSync blocks the calling loop (desktop main, supervisor host loop) until
 * the child exits, so the tree-kill tool itself must be bounded: a wedged
 * taskkill otherwise hangs shutdown forever. On timeout or failure the caller
 * falls through to the direct process kill below instead.
 */
const TASKKILL_TIMEOUT_MS = 5_000;

function isRunnablePid(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export interface TerminateProcessTreeOptions {
  /** The child was launched detached and owns its POSIX process group. */
  ownedProcessGroup?: boolean;
}

export function terminateProcessTree(pid: number, options?: TerminateProcessTreeOptions): void {
  if (!Number.isInteger(pid) || pid <= 0) {
    return;
  }

  if (process.platform === "win32") {
    if (!isRunnablePid(pid)) {
      return;
    }

    // Plain kill() only targets the parent process on Windows. Use taskkill
    // so Git, WSL, LSP, and agent descendants are torn down as one tree.
    const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
      timeout: TASKKILL_TIMEOUT_MS,
      maxBuffer: 0,
    });
    if (!result.error && result.status === 0) {
      return;
    }
  }

  if (options?.ownedProcessGroup) {
    try {
      process.kill(-pid, "SIGKILL");
      return;
    } catch {
      // The group may already be gone; fall back to the immediate process.
    }
  }

  try {
    if (options?.ownedProcessGroup) {
      process.kill(pid, "SIGKILL");
    } else {
      process.kill(pid);
    }
  } catch {
    // Best effort; the process may already be gone.
  }
}

export function terminateChildProcessTree(
  child: Pick<ChildProcess, "pid">,
  options?: TerminateProcessTreeOptions,
): void {
  if (typeof child.pid !== "number") {
    return;
  }

  terminateProcessTree(child.pid, options);
}
