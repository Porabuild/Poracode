import { useEffect, useState } from "react";
import type { PersistedPromptIndex } from "@/shared/ipc";
import {
  readCachedThreadPromptIndex,
  readThreadPromptIndex,
  threadPromptIndexOwner,
  shouldRefreshThreadPromptIndex,
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
 * The rail waits for its first read instead of flashing a partial outline, and
 * keeps a known outline visible during recovery refreshes. Navigation can
 * prefetch it; this hook reads only while the rail has room. A failed read is
 * retried a couple of times so one
 * transient error does not cost the thread its history for the whole visit.
 */
export function useThreadPromptIndex(
  threadId: string,
  enabled: boolean,
): PersistedPromptIndex | null | undefined {
  // The owner, cached outline and refresh flag come from an imperative, mutable
  // cache that changes outside React (a late read completing, a hard reset
  // forgetting it). They must be read on every render; React Compiler would
  // otherwise memoize them on `threadId` alone and freeze the first answer.
  "use no memo";
  const [loaded, setLoaded] = useState<{
    threadId: string;
    owner: unknown;
    index: PersistedPromptIndex | null;
  } | null>(null);

  const owner = threadPromptIndexOwner(threadId);
  const cached = readCachedThreadPromptIndex(threadId);
  const needsRefresh = shouldRefreshThreadPromptIndex(threadId);

  useEffect(() => {
    if (!enabled || (cached && !needsRefresh)) return;
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
        if (index || attempt === RETRY_DELAYS_MS.length) setLoaded({ threadId, owner, index });
        if (index) {
          return;
        }
      }
    })();
    return () => controller.abort();
  }, [threadId, enabled, owner, cached, needsRefresh]);

  return (
    cached ??
    (loaded?.threadId === threadId && loaded.owner === owner && loaded.index === null
      ? null
      : undefined)
  );
}
