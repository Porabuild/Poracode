export class AgentDiscoveryCancelledError extends Error {
  constructor() {
    super("Agent discovery cancelled");
    this.name = "AgentDiscoveryCancelledError";
  }
}

/** Release a detection job promptly, even if an adapter ignores cancellation.
 * The signal also reaches the adapter so its owned probe processes can stop. */
export async function runAbortableDetection<T>(
  task: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return task();
  signal.throwIfAborted();
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([task(), aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
