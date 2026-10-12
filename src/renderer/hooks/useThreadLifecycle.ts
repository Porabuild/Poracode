import { useEffect } from "react";
import { useShallow } from "zustand/shallow";
import { isDraftPaneId } from "@/shared/paneId";
import { useAppStore } from "@/renderer/state/appStore";
import { getThreadMap } from "@/renderer/state/useThread";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { reopenPaneThreadsIfInactive, sweepStaleThreads } from "@/renderer/actions/threadActions";
import { STALE_THREAD_SWEEP_INTERVAL_MS } from "@/renderer/utils/gitHelpers";

const NO_RESIDENT_PANE_IDS: readonly string[] = [];

export function useThreadLifecycle(storeHydrated: boolean) {
  const staleThreadUnloadMinutes = useSharedSettings((s) => s.staleThreadUnloadMinutes);
  // The host catalog can arrive after the persisted panes and snapshot
  // readiness. Subscribe to row presence, not runtime status: status churn
  // must not retry a failed reconnect or restart an already owned session.
  const residentPaneIds = useAppStore(
    useShallow((state) =>
      state.view.kind === "thread"
        ? state.view.panes.filter((id) => getThreadMap(state.threads).has(id))
        : NO_RESIDENT_PANE_IDS,
    ),
  );

  useEffect(() => {
    if (!storeHydrated) return;
    reopenPaneThreadsIfInactive();
    const visibleThreadIds = residentPaneIds.filter((paneId) => !isDraftPaneId(paneId));
    if (visibleThreadIds.length > 0) {
      useAppStore.getState().markThreadsViewed(visibleThreadIds);
    }
  }, [residentPaneIds, storeHydrated]);

  useEffect(() => {
    if (!storeHydrated || staleThreadUnloadMinutes <= 0) {
      return;
    }

    const intervalId = setInterval(() => {
      sweepStaleThreads();
    }, STALE_THREAD_SWEEP_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [storeHydrated, staleThreadUnloadMinutes]);
}
