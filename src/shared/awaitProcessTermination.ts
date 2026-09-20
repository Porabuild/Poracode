import type { ChildProcess } from "node:child_process";
import { terminateChildProcessTree, type TerminateProcessTreeOptions } from "./processTree";

/** Confirm owned process/group exit before a scheduler releases ownership or capacity. */
export async function awaitProcessTermination(
  child: ChildProcess,
  options?: TerminateProcessTreeOptions & { graceMs?: number },
): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) return;
  const ownsGroup = options?.ownedProcessGroup === true && process.platform !== "win32";
  const groupAlive = () => {
    if (!ownsGroup) return false;
    try {
      process.kill(-pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== "ESRCH";
    }
  };
  let exited = child.exitCode != null || child.signalCode != null;
  if (exited && !groupAlive()) return;
  const graceMs = options?.graceMs ?? 3_000;
  await new Promise<void>((resolve, reject) => {
    let forceTimer: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let groupTimer: ReturnType<typeof setInterval> | undefined;
    let lastError: Error | undefined;
    const cleanup = () => {
      clearTimeout(forceTimer);
      clearTimeout(deadline);
      clearInterval(groupTimer);
      child.removeListener("exit", onExit);
      child.removeListener("error", onError);
    };
    const check = () => {
      if (!exited || groupAlive()) return;
      cleanup();
      resolve();
    };
    const onExit = () => {
      exited = true;
      check();
    };
    const onError = (error: Error) => {
      lastError = error;
    };
    child.once("exit", onExit);
    child.on("error", onError);
    forceTimer = setTimeout(() => {
      try {
        if (ownsGroup) process.kill(-pid, "SIGKILL");
        else if (!exited) child.kill("SIGKILL");
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }, graceMs);
    deadline = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Subagent process did not exit after termination${lastError ? `: ${lastError.message}` : ""}`,
        ),
      );
    }, graceMs * 2);
    // An exited group leader can leave live descendants, so still kill its owned group.
    if (ownsGroup) groupTimer = setInterval(check, 20);
    terminateChildProcessTree(child, options);
    exited ||= child.exitCode != null || child.signalCode != null;
    check();
  });
}
