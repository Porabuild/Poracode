import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getAppStoreHydrationSnapshot,
  subscribeToAppStoreHydration,
} from "@/renderer/state/appStoreHydration";
import { isManagedRootDesktopRuntime } from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import {
  getManagedRootCatalogStatus,
  subscribeManagedRootCatalogStatus,
} from "@/renderer/state/managedRootCatalog/rootCatalogStore";

/**
 * Longest the overlay holds its loader for the first catalog page. A slow or
 * failing read must not pin the overlay: it shows what it has, and the catalog
 * projection updates the overlay when the page lands.
 */
const CATALOG_SETTLE_TIMEOUT_MS = 1_500;

function subscribeToRootCatalogStatus(listener: () => void): () => void {
  return subscribeManagedRootCatalogStatus(listener);
}

function getRootCatalogSettledSnapshot(): boolean {
  // Only the managed desktop projects root projects through the catalog; an
  // attached window reads them from its paired owner instead.
  return !isManagedRootDesktopRuntime() || getManagedRootCatalogStatus().status !== "starting";
}

/**
 * Hydration gate of the quick-composer window. The overlay submits through the
 * main window, so unlike `useAppHydration` it runs none of the shell's startup
 * work (runtime snapshot reconciliation, experiment recovery, deferred feature
 * prewarm). It waits only for the two projections the overlay reads: the
 * persisted store, then the first catalog page, so the overlay never paints
 * "Add a project to start" for projects that are still loading.
 */
export function useQuickComposerHydration(): { initialLoading: boolean } {
  const storeHydrated = useSyncExternalStore(
    subscribeToAppStoreHydration,
    getAppStoreHydrationSnapshot,
  );
  const catalogSettled = useSyncExternalStore(
    subscribeToRootCatalogStatus,
    getRootCatalogSettledSnapshot,
  );
  const [catalogWaitExpired, setCatalogWaitExpired] = useState(false);
  useEffect(() => {
    if (catalogSettled) return;
    const timeout = window.setTimeout(() => setCatalogWaitExpired(true), CATALOG_SETTLE_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [catalogSettled]);
  // One-way latch. The overlay re-reads persisted preferences every time it is
  // shown, and that read reports the store as unhydrated while it runs. Loading
  // must not return once the overlay is up: it would unmount the overlay, which
  // restarts the read on its next mount, forever.
  const [ready, setReady] = useState(false);
  if (!ready && storeHydrated && (catalogSettled || catalogWaitExpired)) setReady(true);
  return { initialLoading: !ready };
}
