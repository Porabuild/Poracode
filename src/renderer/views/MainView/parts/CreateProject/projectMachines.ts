import { useShallow } from "zustand/shallow";
import { desktopTitle } from "@/shared/remote/desktopLabel";
import { isRemoteProjectStatusUnreachable } from "@/renderer/state/remoteServers/reachability";
import {
  remoteConnectionKey,
  type RemoteServersState,
  type RemoteServerStatus,
} from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

/** A paired machine a new project can be added on right now. */
export interface ProjectMachine {
  readonly connectionKey: string;
  readonly label: string;
  readonly status: RemoteServerStatus;
}

/**
 * Runtime keys in the create and clone dialogs are "native", a WSL distro
 * name, or this prefix plus a paired connection key.
 */
export const MACHINE_RUNTIME_PREFIX = "machine:";

/** The paired connection a runtime key names; WSL distro names can't contain ":". */
export function machineConnectionKey(runtimeKey: string): string | undefined {
  return runtimeKey.startsWith(MACHINE_RUNTIME_PREFIX)
    ? runtimeKey.slice(MACHINE_RUNTIME_PREFIX.length)
    : undefined;
}

/** Status per paired connection, shallow-compared so catalog refreshes don't re-render. */
function selectConnectionStatuses(state: RemoteServersState): Record<string, RemoteServerStatus> {
  const statuses: Record<string, RemoteServerStatus> = {};
  for (const [connectionKey, runtime] of Object.entries(state.runtime)) {
    statuses[connectionKey] = runtime.status;
  }
  return statuses;
}

/**
 * Paired machines the add-project flows offer: the connection may manage
 * projects and the machine is reachable. Offline machines can't be browsed or
 * written to, so they are left out (the sidebar still shows them, dimmed).
 */
export function useProjectMachines(): ProjectMachine[] {
  const servers = useRemoteServersStore((state) => state.servers);
  const statuses = useRemoteServersStore(useShallow(selectConnectionStatuses));
  return servers.flatMap((server) => {
    if (!server.scopes.includes("projects:manage")) return [];
    const connectionKey = remoteConnectionKey(server);
    const status = statuses[connectionKey];
    if (!status || isRemoteProjectStatusUnreachable({ remoteServerId: connectionKey }, status)) {
      return [];
    }
    return [{ connectionKey, label: desktopTitle(server.label), status }];
  });
}

/**
 * A paired machine's name from its pairing record, so a chosen machine stays
 * named while it is briefly offline. Falls back to the connection key.
 */
export function useMachineName(connectionKey: string | undefined): string | undefined {
  const label = useRemoteServersStore((state) =>
    connectionKey
      ? state.servers.find((server) => remoteConnectionKey(server) === connectionKey)?.label
      : undefined,
  );
  if (!connectionKey) return undefined;
  return label ? desktopTitle(label) : connectionKey;
}

/** A paired machine's reported platform, absent on records paired before platforms were reported. */
export function useMachinePlatform(connectionKey: string | undefined): NodeJS.Platform | undefined {
  return useRemoteServersStore((state) =>
    connectionKey
      ? state.servers.find((server) => remoteConnectionKey(server) === connectionKey)?.platform
      : undefined,
  );
}
