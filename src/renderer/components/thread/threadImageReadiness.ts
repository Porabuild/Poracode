import { isRemoteSession } from "@/renderer/bridge";
import {
  getRemoteBridgeClient,
  getRemoteBridgeImageReadiness,
} from "@/renderer/browser/remoteBridge";
import {
  readManagedLoopbackImageSession,
  type ManagedLoopbackImageSession,
} from "@/renderer/state/managedLoopbackImages";
import { managedRootOwner } from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import {
  environmentImageReadinessFor,
  type RemoteImageReadiness,
} from "@/renderer/state/remoteServers/environmentSessions";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

/**
 * Whether a remote client (browser or attached) resolves this thread's images
 * through its bound bridge host. The bridge keeps one image cache for the host
 * it talks to; a thread owned by any other paired host uses that connection's
 * own image session, as the desktop does, so its images are never requested
 * from the wrong machine. Owner-less rows and rows whose connection record is
 * absent keep the bridge.
 */
export function usesBridgeThreadImages(remoteServerId: string | undefined): boolean {
  if (!isRemoteSession()) return false;
  if (remoteServerId === undefined) return true;
  const owner = useRemoteServersStore
    .getState()
    .servers.find((server) => remoteConnectionKey(server) === remoteServerId);
  return owner === undefined || getRemoteBridgeClient()?.endpoint === owner.endpoint;
}

/** Select the live image owner while keeping absent or malformed owners closed. */
export function threadImageReadinessFor(
  thread: { id: string; remoteServerId?: string | undefined } | undefined,
  managedSession: ManagedLoopbackImageSession | null = readManagedLoopbackImageSession(),
  browserReadiness: RemoteImageReadiness | undefined = getRemoteBridgeImageReadiness(),
): RemoteImageReadiness | undefined {
  if (!thread) return undefined;
  const remoteServerId = thread.remoteServerId;
  if (remoteServerId !== undefined && (typeof remoteServerId !== "string" || !remoteServerId))
    return undefined;
  if (usesBridgeThreadImages(remoteServerId))
    return remoteServerId
      ? (environmentImageReadinessFor(remoteServerId) ?? browserReadiness)
      : browserReadiness;
  if (remoteServerId !== undefined) {
    const state = useRemoteServersStore.getState();
    return state.servers.some((server) => remoteConnectionKey(server) === remoteServerId)
      ? state.imageReadinessFor(remoteServerId)
      : undefined;
  }
  return managedRootOwner(thread) ? managedSession?.readiness : undefined;
}
