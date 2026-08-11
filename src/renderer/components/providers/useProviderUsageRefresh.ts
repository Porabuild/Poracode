import { useState } from "react";
import { refreshAndMergeProviderUsage } from "./refreshProviderUsageSnapshot";

/**
 * Manual single-provider refresh, shared by the usage panel card and the
 * Settings → Usage rows. Forces a live collection of just this provider and
 * merges the returned snapshot so the row updates immediately. `refreshing`
 * drives the spinner; concurrent presses are ignored.
 */
export function useProviderUsageRefresh(id: string) {
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshAndMergeProviderUsage(id);
    } finally {
      setRefreshing(false);
    }
  };

  return { refreshing, refresh };
}
