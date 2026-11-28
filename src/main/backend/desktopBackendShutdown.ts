import { joinRuntimeShutdown } from "@/shared/joinRuntimeShutdown";
import { settlesWithinTimeout } from "../appQuitCleanup";
import type { BackendStateStore } from "./BackendStateStore";
import type { BackendHostClient } from "./BackendHostClient";

/**
 * How long the final shell-preference writes may take before the backend is
 * retired anyway. A healthy backend commits them in milliseconds; one that has
 * not answered by now is blocked or gone, and waiting longer only postpones
 * the escalation that ends the quit.
 */
export const SHELL_STATE_QUIT_DRAIN_MS = 1_000;

/** Join shell saves and the backend they depend on during native app quit. */
export function closeDesktopBackend(
  shellState: Pick<BackendStateStore, "close">,
  backendHost: Pick<BackendHostClient, "disposeAsync">,
  timeoutMs: number,
): Promise<void> {
  const started = performance.now();
  const remainingMs = (): number =>
    Math.max(0, Math.floor(timeoutMs - (performance.now() - started)));
  let stateClosed: Promise<void>;
  try {
    stateClosed = shellState.close();
  } catch (error) {
    stateClosed = Promise.reject(error);
  }
  return joinRuntimeShutdown(
    [
      () => stateClosed,
      async () => {
        // The backend stays available while the admitted saves settle. A failed
        // state drain remains in the outer join's errors but must not skip
        // backend retirement; independent shutdown participants still run.
        const stateSettled = await settlesWithinTimeout(
          stateClosed,
          Math.min(SHELL_STATE_QUIT_DRAIN_MS, remainingMs()),
        );
        // A backend that could not commit a few preference rows in time is not
        // going to finish a graceful retirement either. Retiring it now starts
        // the SIGTERM escalation at once instead of after a second wait for
        // the same answer; the IPC channel still delivers the `dispose`
        // request, so an answer that is merely late still drains on SIGTERM.
        await backendHost.disposeAsync({ timeoutMs: stateSettled ? remainingMs() : 0 });
      },
    ],
    "Desktop backend did not shut down cleanly.",
  );
}
