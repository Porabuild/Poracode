import { useAppStore } from "@/renderer/state/appStore";

/**
 * Persisted-store hydration as an external store, for windows that read the
 * persisted projection without running the shell's startup work
 * (`useAppHydration`).
 */
export function subscribeToAppStoreHydration(listener: () => void): () => void {
  const unsubscribeHydrate = useAppStore.persist.onHydrate(listener);
  const unsubscribeFinishHydration = useAppStore.persist.onFinishHydration(listener);
  return () => {
    unsubscribeHydrate();
    unsubscribeFinishHydration();
  };
}

export function getAppStoreHydrationSnapshot(): boolean {
  return useAppStore.persist.hasHydrated();
}
