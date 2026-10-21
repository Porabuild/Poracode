import { useEffect, useRef, useState } from "react";
import type { PersistedPromptIndex } from "@/shared/ipc";
import { readThreadPromptIndex } from "@/renderer/state/threadPromptIndex";

/** Waits before each retry of a failed read; a host without the route fails them all. */
const RETRY_DELAYS_MS = [1_500, 6_000] as const;

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * The host's list of the thread's newest prompts, or null while it is loading
 * or unavailable (the rail then works from the loaded transcript alone). It is
 * read once per thread, and only while the rail is shown: the rail only takes
 * prompts older than the loaded transcript from it, and those do not change
 * while the thread is open. A failed read is retried a couple of times so one
 * transient error does not cost the thread its history for the whole visit.
 */
export function useThreadPromptIndex(
  threadId: string,
  enabled: boolean,
): PersistedPromptIndex | null {
  const [loaded, setLoaded] = useState<{ threadId: string; index: PersistedPromptIndex } | null>(
    null,
  );

  // The thread whose index is already held: a rail that hides and shows again
  // (the pane narrows while a sidebar animates) must not read it a second time.
  const loadedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || loadedForRef.current === threadId) return;
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
        if (attempt > 0) {
          await delay(RETRY_DELAYS_MS[attempt - 1]!, signal);
          if (signal.aborted) return;
        }
        const index = await readThreadPromptIndex(threadId, signal);
        if (signal.aborted) return;
        if (index) {
          loadedForRef.current = threadId;
          setLoaded({ threadId, index });
          return;
        }
      }
    })();
    return () => controller.abort();
  }, [threadId, enabled]);

  return loaded?.threadId === threadId ? loaded.index : null;
}
