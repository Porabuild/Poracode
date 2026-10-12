import { useState } from "react";
import type { ThreadStatus } from "@/shared/contracts";

interface ThreadInterruptOptions {
  threadId: string;
  status: ThreadStatus;
  interrupt(): Promise<void>;
  onSuccess(): void;
  onError(error: unknown): void;
}

interface InterruptState {
  threadId: string;
  status: ThreadStatus;
  owner: object | null;
}

/** Own the pending Stop UI for one request on the currently rendered thread. */
export function useThreadInterrupt(options: ThreadInterruptOptions) {
  const [state, setState] = useState<InterruptState>(() => ({
    threadId: options.threadId,
    status: options.status,
    owner: null,
  }));
  const sameScope = state.threadId === options.threadId && state.status === options.status;
  if (!sameScope) {
    // Reset scoped state before children render; an effect would leave the
    // previous thread's pending Stop visible for an additional render.
    setState({ threadId: options.threadId, status: options.status, owner: null });
  }
  const isInterrupting = sameScope && state.owner !== null;

  function handleInterrupt() {
    if (isInterrupting) return;
    const owner = {};
    setState({ threadId: options.threadId, status: options.status, owner });
    void options
      .interrupt()
      .then(() => options.onSuccess())
      .catch((error: unknown) => {
        // A previous thread or turn can settle after this pane is reused.
        // Its failure must not release a newer request, even for the same ID.
        setState((current) => (current.owner === owner ? { ...current, owner: null } : current));
        options.onError(error);
      });
  }

  return { isInterrupting, handleInterrupt };
}
