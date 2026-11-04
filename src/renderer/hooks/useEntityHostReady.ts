import { useSyncExternalStore } from "react";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import {
  getManagedRootCatalogStatus,
  subscribeManagedRootCatalogStatus,
} from "@/renderer/state/managedRootCatalog/rootCatalogStore";

/**
 * Whether the host that owns a row is connected and serving reads, whichever
 * host that is: a paired host's connection is online, or the desktop's own
 * host has its catalog ready.
 */
export function useEntityHostReady(entity: {
  readonly remoteServerId?: string | undefined;
  readonly remoteId?: string | undefined;
}): boolean {
  const pairedKey = remoteOwner(entity)?.desktopId;
  const pairedOnline = useRemoteServersStore((state) =>
    pairedKey ? state.runtime[pairedKey]?.status === "online" : false,
  );
  const managedReady = useSyncExternalStore(
    subscribeManagedRootCatalogStatus,
    () => getManagedRootCatalogStatus().status === "ready",
  );
  return pairedKey ? pairedOnline : managedReady;
}

/**
 * Whether the host that owns a row has lost its connection (not merely still
 * connecting), whichever host that is: its view of the row may lag the host.
 */
export function useEntityHostOffline(entity: {
  readonly remoteServerId?: string | undefined;
  readonly remoteId?: string | undefined;
}): boolean {
  const pairedKey = remoteOwner(entity)?.desktopId;
  const pairedOffline = useRemoteServersStore((state) => {
    if (!pairedKey) return false;
    const status = state.runtime[pairedKey]?.status;
    return status === "offline" || status === "error";
  });
  const managedFailed = useSyncExternalStore(
    subscribeManagedRootCatalogStatus,
    () => getManagedRootCatalogStatus().status === "failed",
  );
  return pairedKey ? pairedOffline : managedFailed;
}
