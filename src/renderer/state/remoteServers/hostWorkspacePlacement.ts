import type { RemoteHostWorkspace } from "@/shared/remote";
import { useSharedSettings } from "../sharedSettingsStore";
import { useRemoteServersStore } from "../remoteServersStore";

function sameHostWorkspaces(
  a: readonly RemoteHostWorkspace[] | undefined,
  b: readonly RemoteHostWorkspace[] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((workspace, index) => {
    const other = b[index]!;
    return workspace.id === other.id && workspace.name === other.name;
  });
}

/**
 * Records the workspace names a connection's shell snapshot carried. An older
 * host sends none, which clears the record so its projects fall back to the
 * client's own filing. Returns whether the record changed.
 */
export function recordHostWorkspaces(
  connectionKey: string,
  workspaces: readonly RemoteHostWorkspace[] | undefined,
): boolean {
  const current = useRemoteServersStore.getState().hostWorkspaces[connectionKey];
  if (sameHostWorkspaces(current, workspaces)) return false;
  useRemoteServersStore.setState((state) => {
    const hostWorkspaces = { ...state.hostWorkspaces };
    if (workspaces) hostWorkspaces[connectionKey] = workspaces;
    else delete hostWorkspaces[connectionKey];
    return { hostWorkspaces };
  });
  return true;
}

function workspaceNameKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/**
 * The client workspace a host project belongs in: the one named like the
 * host's workspace, created when this client has none by that name. Two hosts
 * with a same-named workspace share one client workspace. Undefined when the
 * host sent no names, the id is unknown, or the client's own list is not
 * ready yet (first-run seeding would otherwise be skipped).
 */
export function clientWorkspaceForHostWorkspace(
  connectionKey: string,
  hostWorkspaceId: string | undefined,
): string | undefined {
  if (!hostWorkspaceId) return undefined;
  const hostWorkspace = useRemoteServersStore
    .getState()
    .hostWorkspaces[connectionKey]?.find((workspace) => workspace.id === hostWorkspaceId);
  if (!hostWorkspace) return undefined;
  const settings = useSharedSettings.getState();
  const workspaces = settings.workspaces ?? [];
  if (!settings.sharedSettingsHydrated || workspaces.length === 0) return undefined;
  const key = workspaceNameKey(hostWorkspace.name);
  const match = workspaces.find((workspace) => workspaceNameKey(workspace.name) === key);
  if (match) return match.id;
  const name = hostWorkspace.name.trim();
  return name ? settings.addWorkspace(name).id : undefined;
}
