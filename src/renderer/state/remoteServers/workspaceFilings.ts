import type { Thread } from "@/shared/contracts";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";
import { useRemoteServersStore } from "../remoteServersStore";
import { getKnownWorkspaceIds } from "../workspaceStore";

interface ProjectWorkspaceFiling {
  readonly desktopId: string;
  readonly remoteId: string;
  readonly workspaceId: string | undefined;
}

/** Browser/desktop-local pins; null records an explicit unfiling. */
export function pinRemoteProjectWorkspaces(filings: readonly ProjectWorkspaceFiling[]): void {
  if (filings.length === 0) return;
  useRemoteServersStore.setState((state) => {
    let projectWorkspaceIds = state.projectWorkspaceIds;
    const copiedServers = new Map<string, Record<string, string | null>>();
    for (const filing of filings) {
      const workspaceId = filing.workspaceId ?? null;
      if (projectWorkspaceIds[filing.desktopId]?.[filing.remoteId] === workspaceId) continue;
      if (projectWorkspaceIds === state.projectWorkspaceIds) {
        projectWorkspaceIds = { ...projectWorkspaceIds };
      }
      let nextForServer = copiedServers.get(filing.desktopId);
      if (!nextForServer) {
        nextForServer = { ...projectWorkspaceIds[filing.desktopId] };
        projectWorkspaceIds[filing.desktopId] = nextForServer;
        copiedServers.set(filing.desktopId, nextForServer);
      }
      nextForServer[filing.remoteId] = workspaceId;
    }
    return projectWorkspaceIds === state.projectWorkspaceIds ? {} : { projectWorkspaceIds };
  });
}

const browserThreadWorkspaceRows = new WeakMap<
  Thread,
  { readonly workspaceId: string | undefined; readonly row: Thread }
>();

/** Apply the same client-owned filing to catalog and history snapshots. */
export function projectBrowserThreadWorkspace(projected: Thread, resident?: Thread): Thread {
  if (!isBrowserClientRuntime() || !projected.remoteServerId) return projected;
  const workspaceId =
    resident?.workspaceId && getKnownWorkspaceIds().has(resident.workspaceId)
      ? resident.workspaceId
      : undefined;
  const cached = browserThreadWorkspaceRows.get(projected);
  if (cached && cached.workspaceId === workspaceId) return cached.row;
  if (projected.workspaceId === workspaceId) return projected;
  const { workspaceId: _serverWorkspaceId, ...rest } = projected;
  const row = { ...rest, ...(workspaceId ? { workspaceId } : {}) };
  browserThreadWorkspaceRows.set(projected, { workspaceId, row });
  return row;
}
