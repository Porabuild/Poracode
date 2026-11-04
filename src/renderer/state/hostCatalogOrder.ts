import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import { hostSupportsFlatThreadReorder } from "@/shared/remote/protocol";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { hostSupportsCatalogMutationsForConnection } from "./remote/catalogMutationsCapability";
import { resyncManagedRootCatalogOrder } from "./managedRootCatalog/rootCatalogAdapter";
import { MANAGED_ROOT_CATALOG_KEY } from "./managedRootCatalog/managedRootOrderFence";
import { managedRootSupportsFlatThreadReorder } from "./managedRootCatalog/rootLaunchMetadataCapability";
import type { CatalogKind } from "./remoteServers/catalog/boundedCatalogAlgorithm";
import { requestManualPaintRefresh } from "./remoteServers/catalog/boundedCatalogController";

/**
 * The host-specific pieces of a catalog order intent (thread/project reorder).
 * The control flow lives once in `hostCatalogReorder.ts`; each host supplies
 * only what genuinely differs: which order fence its catalog uses, whether it
 * can persist the intent, and how its catalog converges after the command
 * settles or fails.
 */
export interface HostCatalogOrder {
  /** Key of this host's per-kind order fence (see `catalogOrderFence.ts`). */
  readonly fenceKey: string;
  /**
   * Whether the host persists catalog order intents. The desktop's own host is
   * always current; a paired host that did not advertise `catalogMutations`
   * could not honor the command, so its project-scope move stays local-only.
   */
  persistsOrder(): boolean;
  /** `flatThreadReorder` (v1): a thread move in the host's complete catalog. */
  supportsFlatThreadReorder(): Promise<boolean>;
  /** The localized refusal shown when a flat move is refused; silent when absent. */
  flatRefusal(): Error | undefined;
  /** The command settled: let the host's authoritative order converge (beyond the command's own catch-up pass). */
  confirmOrder(kind: CatalogKind): void;
  /** The command failed: restore the host's authoritative order. */
  recoverOrder(kind: CatalogKind): void;
}

export const managedCatalogOrder: HostCatalogOrder = {
  fenceKey: MANAGED_ROOT_CATALOG_KEY,
  persistsOrder: () => true,
  supportsFlatThreadReorder: managedRootSupportsFlatThreadReorder,
  flatRefusal: () => new Error(i18n._(msg`The desktop's own server refused the change.`)),
  // The host command's own catch-up pass (`EntityHost.sendThreadCommand`) is
  // the managed catalog's convergence; nothing more to request.
  confirmOrder: () => {},
  // Walks the complete bounded manual order, falling back to one paint refresh.
  recoverOrder: (kind) => void resyncManagedRootCatalogOrder(kind),
};

interface FlatVerdict {
  readonly generation: number;
  readonly verdict: Promise<boolean>;
}

// One descriptor read per connection incarnation; a reconnect re-proves it.
const flatVerdicts = new Map<string, FlatVerdict>();

export function pairedCatalogOrder(
  connectionKey: string,
  generation: number,
  withClient: <Result>(run: (client: RemoteDesktopClient) => Promise<Result>) => Promise<Result>,
): HostCatalogOrder {
  return {
    fenceKey: connectionKey,
    persistsOrder: () => hostSupportsCatalogMutationsForConnection(connectionKey),
    supportsFlatThreadReorder: () => {
      const known = flatVerdicts.get(connectionKey);
      if (known?.generation === generation) return known.verdict;
      // Any failure of the optional descriptor read resolves to "unsupported".
      const verdict = withClient((client) => client.environment()).then(
        (descriptor) => hostSupportsFlatThreadReorder(descriptor.capabilities?.flatThreadReorder),
        () => false,
      );
      flatVerdicts.set(connectionKey, { generation, verdict });
      return verdict;
    },
    // No paired-specific refusal string exists; the move simply does not apply.
    flatRefusal: () => undefined,
    confirmOrder: (kind) => requestManualPaintRefresh(connectionKey, kind),
    recoverOrder: (kind) => requestManualPaintRefresh(connectionKey, kind),
  };
}

/** Test-only: drop the cached descriptor verdicts. */
export function __resetHostCatalogOrderForTest(): void {
  flatVerdicts.clear();
}
