import { useEffect, useSyncExternalStore } from "react";
import { readBridge } from "@/renderer/bridge";
import { readClientRuntime } from "@/renderer/clientRuntime";
import {
  readManagedLoopbackActivation,
  subscribeManagedLoopbackActivation,
} from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";

/** Hydrate the sidebar on host readiness and reconnect. The supervisor owns polling. */
export function useProviderUsageHydration(): void {
  const managed = readClientRuntime().transport === "electron-backend-host";
  const activation = useSyncExternalStore(
    subscribeManagedLoopbackActivation,
    readManagedLoopbackActivation,
  );

  useEffect(() => {
    // Managed usage requests require the HTTP data plane; preload refuses them.
    if (managed && !activation) return;
    let cancelled = false;
    void readBridge()
      .getProviderUsage({})
      .then((res) => {
        if (cancelled || (managed && activation !== readManagedLoopbackActivation())) return;
        const store = useProviderUsageStore.getState();
        for (const snapshot of res.snapshots) {
          // A live refresh can arrive while the cached read is still in flight.
          const current = store.snapshots[snapshot.providerId];
          if (!current || current.fetchedAt <= snapshot.fetchedAt) store.mergeSnapshot(snapshot);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [managed, activation]);
}
