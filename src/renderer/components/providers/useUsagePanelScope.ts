import { isRemoteSession } from "@/renderer/bridge";
import { useUsageScopeStore } from "@/renderer/state/usageScopeStore";
import {
  selectBrowserBridgeServer,
  useRemoteServersStore,
} from "@/renderer/state/remoteServersStore";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";

/** Preserve a removed selection until the user explicitly chooses another host. */
export function useUsagePanelScope() {
  const requestedId = useUsageScopeStore((state) => state.desktopId);
  const servers = useRemoteServersStore((state) => state.servers);
  const defaultServer = useRemoteServersStore(selectBrowserBridgeServer) ?? servers[0];
  const remoteSession = isRemoteSession();
  const effectiveId =
    requestedId ?? (remoteSession && defaultServer ? remoteConnectionKey(defaultServer) : null);
  const server = servers.find((candidate) => remoteConnectionKey(candidate) === effectiveId);
  return { effectiveId, server, remote: effectiveId !== null || remoteSession, remoteSession };
}
