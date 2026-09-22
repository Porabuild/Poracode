import type { CatalogKind } from "@/renderer/state/remoteServers/catalog/boundedCatalogAlgorithm";
import {
  beginCatalogOrderIntentFor,
  bumpCatalogOrderGenerationFor,
  bumpCatalogOrderGenerations,
  catalogOrderGenerationFor,
  catalogOrderIntentInFlightFor,
  forgetCatalogOrderFence,
} from "@/renderer/state/remoteServers/catalog/catalogOrderFence";

/**
 * Managed-root manual-order fence: the desktop's own catalog key over the
 * shared per-connection, per-kind order fence (see `catalogOrderFence.ts` for
 * the semantics). The key lives here because this module is the managed root's
 * order-fence facade; the paired/remote consumer uses the shared fence with
 * its own connection key, so neither consumer can reset the other's
 * generation.
 */
export const MANAGED_ROOT_CATALOG_KEY = "managed-root";

export function managedRootOrderGenerationFor(kind: CatalogKind): number {
  return catalogOrderGenerationFor(MANAGED_ROOT_CATALOG_KEY, kind);
}

export function bumpManagedRootOrderGenerationFor(kind: CatalogKind): number {
  return bumpCatalogOrderGenerationFor(MANAGED_ROOT_CATALOG_KEY, kind);
}

export function beginManagedRootOrderIntentFor(kind: CatalogKind): () => void {
  return beginCatalogOrderIntentFor(MANAGED_ROOT_CATALOG_KEY, kind);
}

export function managedRootOrderIntentInFlightFor(kind: CatalogKind): boolean {
  return catalogOrderIntentInFlightFor(MANAGED_ROOT_CATALOG_KEY, kind);
}

/** An activation replacement invalidates every in-flight order walk. */
export function bumpManagedRootOrderGenerations(): void {
  bumpCatalogOrderGenerations(MANAGED_ROOT_CATALOG_KEY);
}

/** Test-only: reset the managed root's fence to its boot state. */
export function __resetManagedRootOrderFenceForTest(): void {
  forgetCatalogOrderFence(MANAGED_ROOT_CATALOG_KEY);
}
