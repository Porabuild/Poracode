import { RemoteClientError, isRemoteTransportFailure } from "@/shared/remote/client";

/**
 * Retry policy for a thread's first bounded history read, shared by every
 * host. A transient refusal (transport failure, or a host whose persistence is
 * briefly busy) is retried twice before the read counts as failed, so a pane
 * never reports "Messages could not be loaded" for a blip the next attempt
 * would have survived.
 */
export const INITIAL_HISTORY_RETRY_DELAYS_MS = [250, 500] as const;

export function isRetryableHistoryReadError(error: unknown): boolean {
  return (
    isRemoteTransportFailure(error) ||
    (error instanceof RemoteClientError &&
      error.status === 503 &&
      [
        "persistence_read_refused",
        "persistence_busy",
        "persistence_degraded",
        "persistence_unavailable",
      ].includes(error.code))
  );
}

function waitForDelay(
  delayMs: number,
  signal: AbortSignal | undefined,
  onReplaced: ((listener: () => void) => () => void) | undefined,
): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let stopReplaced = () => {};
    const settle = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      stopReplaced();
    };
    const abort = () => {
      settle();
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      settle();
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", abort, { once: true });
    // A replaced connection owns its own read: stop waiting out this backoff.
    stopReplaced =
      onReplaced?.(() => {
        settle();
        resolve();
      }) ?? (() => {});
  });
}

/**
 * Runs one host history read with the shared retry policy. Retries stop at
 * the first non-transient error, when the caller cancels, or when the host
 * connection the read started on is no longer current (a replaced connection
 * owns its own read).
 */
export async function readWithHistoryRetries<Result>(
  read: () => Promise<Result>,
  options: {
    readonly signal?: AbortSignal | undefined;
    readonly isCurrent: () => boolean;
    /** Notifies when the connection the read started on is replaced, ending a backoff early. */
    readonly onReplaced?: (listener: () => void) => () => void;
  },
): Promise<Result> {
  for (let attempt = 0; ; attempt += 1) {
    options.signal?.throwIfAborted();
    try {
      return await read();
    } catch (error) {
      options.signal?.throwIfAborted();
      const delay = INITIAL_HISTORY_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !isRetryableHistoryReadError(error) || !options.isCurrent())
        throw error;
      await waitForDelay(delay, options.signal, options.onReplaced);
      if (!options.isCurrent()) throw error;
    }
  }
}
