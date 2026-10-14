import { useEffect, useRef } from "react";
import { useShallow } from "zustand/shallow";
import { isThreadTurnActive, type Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { isManagedRootDesktopRuntime } from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import { retainRuntimeThreadReader } from "@/renderer/state/runtimeInterestHydration";

const EMPTY_IDS: readonly string[] = [];
const runningIdCache = new WeakMap<readonly Thread[], readonly string[]>();
function runningThreadIds(threads: readonly Thread[]): readonly string[] {
  let ids = runningIdCache.get(threads);
  if (!ids) {
    ids = threads
      .filter(
        (thread) =>
          thread.presentationMode === "gui" &&
          !thread.archived &&
          isThreadTurnActive(thread.status) &&
          thread.remoteServerId === undefined,
      )
      .map((thread) => thread.id);
    runningIdCache.set(threads, ids);
  }
  return ids;
}

/** Runtime ownership follows running threads, independently of mounted chat panes. */
export function useRunningThreadRuntime(enabled: boolean): void {
  const runningIds = useAppStore(
    useShallow((state) =>
      isManagedRootDesktopRuntime() ? runningThreadIds(state.threads) : EMPTY_IDS,
    ),
  );
  const leases = useRef(new Map<string, ReturnType<typeof retainRuntimeThreadReader>>());

  useEffect(() => {
    const wanted = new Set(enabled ? runningIds : []);
    for (const [threadId, lease] of leases.current) {
      if (wanted.has(threadId)) continue;
      leases.current.delete(threadId);
      lease.release();
    }
    for (const threadId of wanted) {
      if (leases.current.has(threadId)) continue;
      const lease = retainRuntimeThreadReader(threadId);
      leases.current.set(threadId, lease);
    }
  }, [enabled, runningIds]);

  useEffect(() => {
    const retained = leases.current;
    return () => {
      for (const lease of retained.values()) {
        lease.release();
      }
      retained.clear();
    };
  }, []);
}
