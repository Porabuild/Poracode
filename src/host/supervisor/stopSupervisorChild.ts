import type { ChildProcess } from "node:child_process";
import { terminateChildProcessTree } from "@/shared/processTree";

/** SupervisorRuntime allows 5 seconds for disposal and 1 second to flush IPC. */
const SUPERVISOR_EXIT_GRACE_MS = 7_000;
const SUPERVISOR_FORCE_EXIT_MS = 1_000;

/**
 * Join child close after exit and IPC/stdio closure, retaining final messages.
 * On POSIX escalation covers this PID only: provider/PTY descendants rely on the
 * supervisor's own disposal and are not proved gone by this parent-exit barrier.
 * Windows retains the existing taskkill /T process-tree termination behavior.
 */
export function stopSupervisorChild(
  child: ChildProcess,
  options: { graceMs?: number; forceMs?: number } = {},
): Promise<void> {
  const exited = () => typeof child.exitCode === "number" || typeof child.signalCode === "string";
  const streamsClosed = () =>
    !child.connected &&
    (!child.stdout || child.stdout.destroyed) &&
    (!child.stderr || child.stderr.destroyed);
  if (exited() && streamsClosed()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      child.off("close", done);
    };
    const done = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    // close also covers a failed fork that never emitted exit or owned a PID.
    child.once("close", done);
    timer = setTimeout(() => {
      // A dead child's numeric PID must never be used for escalation.
      try {
        if (!exited()) child.kill("SIGKILL");
      } catch (error) {
        cleanup();
        reject(error);
        return;
      }
      if (settled) return;
      timer = setTimeout(() => {
        settled = true;
        cleanup();
        reject(
          new Error(
            "Supervisor exit and channel closure were not confirmed after termination; database must remain open.",
          ),
        );
      }, options.forceMs ?? SUPERVISOR_FORCE_EXIT_MS);
    }, options.graceMs ?? SUPERVISOR_EXIT_GRACE_MS);
    // Install the exit observer first: even an immediate exit must be joined.
    if (!exited()) terminateChildProcessTree(child);
  });
}
