import { __resetThreadLaunchIntentsForTest } from "../threadLaunchIntents";

/**
 * Managed-root catalog readiness (B4 S3/D2).
 *
 * The root desktop's catalog is a bounded projection of the co-located
 * server's DB. Persisted hydration is preferences-only and releases at once;
 * this store is the ONLY readiness surface for the catalog, so the shell paints
 * immediately and shows a truthful starting/failed state with retry instead of
 * gating on the loopback leg. It is process-local and never persisted.
 */
export type ManagedRootCatalogStatus =
  | { readonly status: "starting"; readonly message?: undefined }
  | { readonly status: "ready"; readonly message?: undefined }
  | { readonly status: "failed"; readonly message: string; readonly retrying: boolean };

let status: ManagedRootCatalogStatus = { status: "starting" };
const listeners = new Set<() => void>();

export function getManagedRootCatalogStatus(): ManagedRootCatalogStatus {
  return status;
}

export function subscribeManagedRootCatalogStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setManagedRootCatalogStatus(next: ManagedRootCatalogStatus): void {
  if (
    status.status === next.status &&
    status.message === next.message &&
    (status.status !== "failed" || next.status !== "failed" || status.retrying === next.retrying)
  ) {
    return;
  }
  status = next;
  for (const listener of [...listeners]) listener();
}

/** Test-only: drop the readiness value, launch intents, and every listener. */
export function __resetManagedRootCatalogStoreForTest(): void {
  status = { status: "starting" };
  listeners.clear();
  __resetThreadLaunchIntentsForTest();
}
