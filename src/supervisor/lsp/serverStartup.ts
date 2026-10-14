import type { ChildProcess } from "node:child_process";

/** Preserve the existing startup window, releasing only this wait's listeners. */
export function waitForServerCandidate(
  process: ChildProcess,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted || process.exitCode !== null || process.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const finish = (earlyExit: boolean) => {
      clearTimeout(timer);
      process.off("error", exited);
      process.off("exit", exited);
      signal.removeEventListener("abort", cancelled);
      resolve(earlyExit);
    };
    const exited = () => finish(true);
    const cancelled = () => finish(true);
    const timer = setTimeout(() => finish(false), 200);
    process.once("error", exited);
    process.once("exit", exited);
    signal.addEventListener("abort", cancelled, { once: true });
  });
}
