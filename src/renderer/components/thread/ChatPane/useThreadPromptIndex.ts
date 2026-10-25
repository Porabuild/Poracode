import { useEffect, useState } from "react";
import type { PersistedPromptIndex } from "@/shared/ipc";
import {
  readCachedThreadPromptIndex,
  readThreadPromptIndex,
  threadPromptIndexOwner,
} from "@/renderer/state/threadPromptIndex";

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
 * Undefined while loading, null when unavailable, otherwise the host's prompts.
 * The rail waits for its first read instead of flashing a partial outline. It is
 * read once per thread, and only while the rail is shown: the rail only takes
 * prompts older than the loaded transcript from it, and those do not change
 * while the thread is open. A failed read is retried a couple of times so one
 * transient error does not cost the thread its history for the whole visit.
 */
export function useThreadPromptIndex(
  threadId: string,
  enabled: boolean,
): PersistedPromptIndex | null | undefined {
  const [loaded, setLoaded] = useState<{
    threadId: string;
    owner: unknown;
    index: PersistedPromptIndex | null;
  } | null>(null);

  const owner = threadPromptIndexOwner(threadId);
  const cached = readCachedThreadPromptIndex(threadId);

  useEffect(() => {
    if (!enabled || cached) return;
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
        setLoaded({ threadId, owner, index });
        if (index) {
          return;
        }
      }
    })();
    return () => controller.abort();
  }, [threadId, enabled, owner, cached]);

  return (
    cached ?? (loaded?.threadId === threadId && loaded.owner === owner ? loaded.index : undefined)
  );
}
