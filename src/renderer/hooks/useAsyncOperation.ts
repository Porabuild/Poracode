import { useState } from "react";

export interface AsyncOperation {
  readonly busy: boolean;
  readonly error: string | null;
  /** Run an async op, tracking busy state and capturing its error message. */
  run(work: () => Promise<void>): void;
}

/**
 * Tiny helper for button handlers that kick off an async op: tracks a `busy`
 * flag (to disable the control) and captures the error message. Shared by the
 * remote-server management surfaces (desktop + PWA).
 */
export function useAsyncOperation(): AsyncOperation {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    void work()
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : String(caught)),
      )
      .finally(() => setBusy(false));
  };
  return { busy, error, run };
}
