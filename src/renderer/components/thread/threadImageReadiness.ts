import { isRemoteSession } from "@/renderer/bridge";
import { getRemoteBridgeImageReadiness } from "@/renderer/browser/remoteBridge";
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
  if (isRemoteSession())
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
