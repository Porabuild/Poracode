import { useState } from "react";
import { readBridge } from "@/renderer/bridge";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";

/**
 * Manual single-provider refresh, shared by the usage panel card and the
 * Settings → Usage rows. Forces a live collection of just this provider and
 * merges the returned snapshot so the row updates immediately (the supervisor
 * also broadcasts `provider-usage`, but merging the reply avoids the round-trip
 * lag). `refreshing` drives the spinner; concurrent presses are ignored.
 */
export function useProviderUsageRefresh(id: string) {
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const usage = await readBridge().refreshProviderUsage({ providerIds: [id] });
      const fresh = usage.snapshots.find((s) => s.providerId === id);
      if (fresh) useProviderUsageStore.getState().mergeSnapshot(fresh);
    } catch {
      // Errors surface as the provider's own error snapshot via the broadcast.
    } finally {
      setRefreshing(false);
    }
  };

  return { refreshing, refresh };
}
