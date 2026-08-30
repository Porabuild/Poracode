const RECONNECT_INTERVAL_MS = 1_000;
const RECONNECT_TIMEOUT_MS = 60_000;
const TIMED_OUT = Symbol("timed-out");

export type HostUpdateReconnectOutcome =
  | { readonly type: "connected" }
  | { readonly type: "cancelled" }
  | { readonly type: "timeout" }
  | { readonly type: "terminal-error"; readonly error: unknown };

export async function waitForHostUpdateReconnect(options: {
  readonly isCurrent: () => boolean;
  readonly attempt: () => Promise<boolean>;
  readonly isTerminalError: (error: unknown) => boolean;
}): Promise<HostUpdateReconnectOutcome> {
  const deadline = Date.now() + RECONNECT_TIMEOUT_MS;

  while (options.isCurrent() && Date.now() < deadline) {
    const remaining = deadline - Date.now();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const connected = await Promise.race([
        options.attempt(),
        new Promise<typeof TIMED_OUT>((resolve) => {
          timeout = setTimeout(() => resolve(TIMED_OUT), remaining);
        }),
      ]).finally(() => {
        if (timeout) clearTimeout(timeout);
      });
      if (connected === TIMED_OUT) return { type: "timeout" };
      if (connected) return { type: "connected" };
    } catch (error) {
      if (options.isTerminalError(error)) return { type: "terminal-error", error };
    }

    const retryDelay = Math.min(RECONNECT_INTERVAL_MS, deadline - Date.now());
    if (retryDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  return options.isCurrent() ? { type: "timeout" } : { type: "cancelled" };
}
