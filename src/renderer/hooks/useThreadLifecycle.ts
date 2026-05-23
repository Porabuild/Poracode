import { useEffect } from "react";
import { isDraftPaneId } from "@/shared/paneId";
import { useAppStore } from "@/renderer/state/appStore";
import { useCurrentThreadIds } from "@/renderer/hooks/uiSelectors";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { reopenPaneThreadsIfInactive, sweepStaleThreads } from "@/renderer/actions/threadActions";
import { STALE_THREAD_SWEEP_INTERVAL_MS } from "@/renderer/utils/gitHelpers";

export function useThreadLifecycle(storeHydrated: boolean) {
  const staleThreadUnloadMinutes = useSharedSettings((s) => s.staleThreadUnloadMinutes);
  const currentPaneIds = useCurrentThreadIds();

  useEffect(() => {
    if (!storeHydrated) return;
    reopenPaneThreadsIfInactive();
    const visibleThreadIds = currentPaneIds.filter((paneId) => !isDraftPaneId(paneId));
    if (visibleThreadIds.length > 0) {
      useAppStore.getState().markThreadsViewed(visibleThreadIds);
    }
  }, [currentPaneIds, storeHydrated]);

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
