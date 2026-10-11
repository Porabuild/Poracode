/**
 * The SDK's local transport can reject detached promises when a request is
 * aborted, including while sibling subagents and the parent are still running.
 * Node would otherwise terminate their shared worker. Cancellation of a Run
 * remains authoritative through stream()/wait(); a detached abort must not
 * manufacture a terminal result or cancel the other work in that process.
 */
export function installCursorSdkCancellationHandler(): void {
  process.on("unhandledRejection", (reason: unknown) => {
    if (isCursorSdkCancellation(reason)) return;
    // Preserve Node's fatal behavior for programming errors and other failures.
    throw reason;
  });
}

export function isCursorSdkCancellation(reason: unknown): boolean {
  const seen = new Set<object>();
  let current = reason;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const error = current as { name?: unknown; code?: unknown; message?: unknown; cause?: unknown };
    if (error.name === "AbortError" && error.code === "ABORT_ERR") return true;
    if (error.name === "AbortError" && error.code === 20) return true;
    if (error.name === "ConnectError") {
      if (error.code === 1) return true;
      // Connect can wrap a cancellation in Unknown without retaining its cause.
      if (
        error.code === 2 &&
        typeof error.message === "string" &&
        /^\[unknown\] \[canceled\] /u.test(error.message)
      )
        return true;
    }
    current = error.cause;
  }
  return false;
}
