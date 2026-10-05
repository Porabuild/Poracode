import { joinRuntimeShutdown } from "@/shared/joinRuntimeShutdown";
import type { BackendStateStore } from "./BackendStateStore";
import type { BackendHostClient } from "./BackendHostClient";
import { BACKEND_HOST_DISPOSAL_FORCE_KILL_RESERVE_MS } from "./backendShutdownBudget";

/** Join shell saves and the backend they depend on during native app quit. */
export function closeDesktopBackend(
  shellState: Pick<BackendStateStore, "close">,
  backendHost: Pick<BackendHostClient, "disposeAsync">,
  timeoutMs: number,
): Promise<void> {
  const started = performance.now();
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
        // A failed state drain remains in the outer join's errors but must
        // not skip backend retirement. The backend stays available while the
        // admitted saves settle; independent shutdown participants still run.
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            stateClosed.catch(() => undefined),
            new Promise<void>((resolve) => {
              timer = setTimeout(
                resolve,
                Math.max(
                  0,
                  timeoutMs -
                    BACKEND_HOST_DISPOSAL_FORCE_KILL_RESERVE_MS -
                    (performance.now() - started),
                ),
              );
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
        await backendHost.disposeAsync({
          timeoutMs: Math.max(0, Math.floor(timeoutMs - (performance.now() - started))),
        });
      },
    ],
    "Desktop backend did not shut down cleanly.",
  );
}
