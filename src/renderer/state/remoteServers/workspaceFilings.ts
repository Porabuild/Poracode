import type { Thread } from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";
import { useRemoteServersStore } from "../remoteServersStore";
import { getKnownWorkspaceIds } from "../workspaceStore";

interface ProjectWorkspaceFiling {
  readonly desktopId: string;
  readonly remoteId: string;
  readonly workspaceId: string | undefined;
}

/**
 * Browser/desktop-local pins; null records an explicit unfiling. `explicit`
 * marks a filing the user made by moving the project, which a browser client
 * keeps even when the host files the project elsewhere.
 */
export function pinRemoteProjectWorkspaces(
  filings: readonly ProjectWorkspaceFiling[],
  options: { readonly explicit?: boolean } = {},
): void {
  if (filings.length === 0) return;
  useRemoteServersStore.setState((state) => {
    let projectWorkspaceIds = state.projectWorkspaceIds;
    let explicitProjectWorkspaceIds = state.explicitProjectWorkspaceIds;
    const copiedServers = new Map<string, Record<string, string | null>>();
    for (const filing of filings) {
      const workspaceId = filing.workspaceId ?? null;
      if (projectWorkspaceIds[filing.desktopId]?.[filing.remoteId] === workspaceId) continue;
      if (
        options.explicit &&
        explicitProjectWorkspaceIds[filing.desktopId]?.[filing.remoteId] !== true
      ) {
        explicitProjectWorkspaceIds = {
          ...explicitProjectWorkspaceIds,
          [filing.desktopId]: {
            ...explicitProjectWorkspaceIds[filing.desktopId],
            [filing.remoteId]: true,
          },
        };
      }
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
    if (projectWorkspaceIds === state.projectWorkspaceIds) return {};
    return explicitProjectWorkspaceIds === state.explicitProjectWorkspaceIds
      ? { projectWorkspaceIds }
      : { projectWorkspaceIds, explicitProjectWorkspaceIds };
  });
}

/**
 * Pin a paired remote Home thread's client-owned workspace by its full mirrored
 * thread id. Host create omits the client workspace and desktop clients do not
 * persist mirrored rows, so this local preference is what a cold restart
 * projects back. `null` records an explicit unfiling; unpaired and non-Home
 * threads stay host/project-owned. Flat entries let secure storage's per-entry
 * field patches merge different threads from different windows.
 */
export function pinRemoteHomeThreadWorkspace(
  thread: Pick<Thread, "id" | "projectId" | "remoteServerId">,
  workspaceId: string | undefined,
): void {
  if (!thread.remoteServerId || !isHomeProjectId(thread.projectId)) return;
  const pinnedWorkspaceId = workspaceId ?? null;
  useRemoteServersStore.setState((state) => {
    const pins = state.homeThreadWorkspaceIds ?? {};
    if (pins[thread.id] === pinnedWorkspaceId) return {};
    return { homeThreadWorkspaceIds: { ...pins, [thread.id]: pinnedWorkspaceId } };
  });
}

const browserThreadWorkspaceRows = new WeakMap<
  Thread,
  { readonly workspaceId: string | undefined; readonly row: Thread }
>();

/**
 * Apply the same client-owned filing to catalog and history snapshots. Browser
 * clients file every mirrored thread locally; a desktop-only client does the
 * same for remote Home threads, whose workspace is client-owned rather than a
 * real project's filing. Other desktop mirror rows keep their host filing. A
 * paired Home thread's stored pin outranks the resident row, host workspace and
 * history; `null` keeps it explicitly unfiled.
 */
export function projectBrowserThreadWorkspace(projected: Thread, resident?: Thread): Thread {
  if (!projected.remoteServerId) return projected;
  const homeThread = isHomeProjectId(projected.projectId);
  if (!isBrowserClientRuntime() && !homeThread) return projected;
  const pins = homeThread ? useRemoteServersStore.getState().homeThreadWorkspaceIds : undefined;
  const hasPin = pins !== undefined && Object.hasOwn(pins, projected.id);
  const pinnedWorkspaceId = hasPin ? pins?.[projected.id] : undefined;
  const knownWorkspaceIds = getKnownWorkspaceIds();
  const residentWorkspaceId =
    resident?.workspaceId && knownWorkspaceIds.has(resident.workspaceId)
      ? resident.workspaceId
      : undefined;
  const workspaceId = hasPin
    ? pinnedWorkspaceId && knownWorkspaceIds.has(pinnedWorkspaceId)
      ? pinnedWorkspaceId
      : undefined
    : residentWorkspaceId;
  const cached = browserThreadWorkspaceRows.get(projected);
  if (cached && cached.workspaceId === workspaceId) return cached.row;
  if (projected.workspaceId === workspaceId) return projected;
  const { workspaceId: _serverWorkspaceId, ...rest } = projected;
  const row = { ...rest, ...(workspaceId ? { workspaceId } : {}) };
  browserThreadWorkspaceRows.set(projected, { workspaceId, row });
  return row;
}
