import type { Project, Thread } from "@/shared/contracts";
import { useAppStore } from "../appStore";
import { useRemoteServersStore } from "../remoteServersStore";
import { projectRemoteProject, projectRemoteThread } from "../remoteProjection";
import { refreshGitProject } from "../gitRefresh";
import { useGitStore } from "../gitStore";
import { filterSyncedRemoteProjects } from "./projectSync";

let remoteProjectRowsSyncDepth = 0;

function withRemoteProjectRowsSync<T>(fn: () => T): T {
  remoteProjectRowsSyncDepth += 1;
  try {
    return fn();
  } finally {
    remoteProjectRowsSyncDepth -= 1;
  }
}

/**
 * Workspace filings of unique local project names. An unfiled remote mirror
 * defaults to its local counterpart's workspace — one repo should not sit in
 * two workspaces just because it is mirrored from another machine. Ambiguous
 * names are left unfiled rather than assigned to an arbitrary project.
 */
function localWorkspaceByName(projects: readonly Project[]): Map<string, string> {
  const byName = new Map<string, string>();
  const ambiguousNames = new Set<string>();
  for (const project of projects) {
    if (project.remoteServerId !== undefined || ambiguousNames.has(project.name)) continue;
    if (byName.has(project.name)) {
      byName.delete(project.name);
      ambiguousNames.add(project.name);
      continue;
    }
    if (project.workspaceId === undefined) {
      ambiguousNames.add(project.name);
      continue;
    }
    byName.set(project.name, project.workspaceId);
  }
  return byName;
}

function withoutWorkspace(project: Project): Project {
  const next: Project = { ...project };
  delete next.workspaceId;
  return next;
}

/**
 * Mirror a server's snapshot into the app store, restricted to the projects the
 * user syncs. Threads of an unsynced project are dropped too — without their
 * project row they would be orphans in the sidebar.
 */
export function syncRemoteAppRows(
  desktopId: string,
  allProjects?: readonly Project[],
  allThreads?: readonly Thread[],
): void {
  const remoteState = useRemoteServersStore.getState();
  const excluded = remoteState.excludedProjectIds[desktopId];
  const projects = allProjects ? filterSyncedRemoteProjects(allProjects, excluded) : undefined;
  // A threads-only update has no project list to scope against, so fall back to
  // the cached snapshot — always written before rows are synced.
  const cachedProjects = remoteState.runtime[desktopId]?.projects ?? [];
  const syncedProjectIds = allThreads
    ? new Set(
        (projects ?? filterSyncedRemoteProjects(cachedProjects, excluded)).map(
          (project) => project.id,
        ),
      )
    : undefined;
  const threads = allThreads?.filter((thread) => syncedProjectIds?.has(thread.projectId));
  const currentProjects = projects
    ? new Map(
        useAppStore
          .getState()
          .projects.filter((project) => project.remoteServerId === desktopId)
          .map((project) => [project.remoteId, project]),
      )
    : null;
  const counterpartWorkspace = localWorkspaceByName(useAppStore.getState().projects);
  const projectedProjects = projects?.map((project) => {
    const projected = projectRemoteProject(desktopId, project);
    const current = currentProjects?.get(project.id);
    const { workspaceId: remoteWorkspaceId, ...projectWithoutWorkspace } = projected;
    const name = remoteState.projectNameOverrides[desktopId]?.[project.id] ?? projected.name;
    const workspaceOverride = remoteState.projectWorkspaceIds[desktopId]?.[project.id];
    const workspaceId =
      workspaceOverride !== undefined
        ? (workspaceOverride ?? undefined)
        : (counterpartWorkspace.get(name) ??
          (current?.workspaceId !== remoteWorkspaceId ? current?.workspaceId : undefined));
    return {
      ...projectWithoutWorkspace,
      name,
      ...(workspaceId ? { workspaceId } : {}),
      ...(current?.mcpServers ? { mcpServers: current.mcpServers } : {}),
    };
  });
  const projectedThreads = threads?.map((thread) => projectRemoteThread(desktopId, thread));
  const appState = useAppStore.getState();
  const projectedThreadIds = new Set(projectedThreads?.map((thread) => thread.id) ?? []);
  if (projectedProjects) {
    const projectedProjectIds = new Set(projectedProjects.map((project) => project.id));
    for (const project of useAppStore.getState().projects) {
      if (project.remoteServerId === desktopId && !projectedProjectIds.has(project.id)) {
        useAppStore.getState().deleteProject(project.id);
      }
    }
  }
  if (projectedThreads) {
    for (const thread of appState.threads) {
      if (
        thread.remoteServerId === desktopId &&
        !projectedThreadIds.has(thread.id) &&
        appState.provisioningWorktreeThreadIds[thread.id] !== true
      ) {
        useAppStore.getState().deleteThread(thread.id);
      }
    }
  }
  withRemoteProjectRowsSync(() =>
    useAppStore.setState((state) => {
      const provisioningThreads = projectedThreads
        ? state.threads.filter(
            (thread) =>
              thread.remoteServerId === desktopId &&
              state.provisioningWorktreeThreadIds[thread.id] === true &&
              !projectedThreadIds.has(thread.id) &&
              state.projects.some((project) => project.id === thread.projectId),
          )
        : [];
      return {
        ...(projectedProjects
          ? {
              projects: [
                ...state.projects.filter((project) => project.remoteServerId !== desktopId),
                ...projectedProjects,
              ],
            }
          : {}),
        ...(projectedThreads
          ? {
              threads: [
                ...state.threads.filter((thread) => thread.remoteServerId !== desktopId),
                ...provisioningThreads,
                ...projectedThreads,
              ],
            }
          : {}),
      };
    }),
  );
  if (!projectedProjects) return;
  if (useRemoteServersStore.getState().runtime[desktopId]?.status !== "online") return;
  const gitStatuses = useGitStore.getState().statuses;
  for (const project of projectedProjects) {
    if (gitStatuses[project.id]) continue;
    void refreshGitProject(project, "manual", "full").catch(() => undefined);
  }
}

export function removeRemoteAppRows(desktopId: string): void {
  syncRemoteAppRows(desktopId, [], []);
}

/**
 * Mirror local project workspace assignments back into the remote state so the
 * sync layer keeps a stable record across reloads and server reconnects, and
 * keep unpinned mirrors filed where their same-named local counterpart is
 * filed (see `localWorkspaceByName`).
 *
 * Installed from `app.tsx` (like `installRemoteGitSummaryPublisher`): the
 * module-scope equivalent would touch `useAppStore` during its own
 * initialization, which hits the `appStore` ⇄ `remoteServersStore` import
 * cycle's TDZ before `useAppStore` is defined.
 */
export function installRemoteProjectWorkspaceSync(): () => void {
  let applyingDerivedProjects = false;
  return useAppStore.subscribe((state, previousState) => {
    if (state.projects === previousState.projects) return;
    if (remoteProjectRowsSyncDepth > 0 || applyingDerivedProjects) return;
    const previousProjects = new Map(
      previousState.projects.map((project) => [project.id, project]),
    );
    const counterpartWorkspace = localWorkspaceByName(state.projects);
    // Mirrors whose filing changed in this very update were edited (or
    // projected) deliberately — re-deriving them here would overwrite that.
    const changedIds = new Set<string>();
    for (const project of state.projects) {
      const previous = previousProjects.get(project.id);
      if (previous && previous.workspaceId !== project.workspaceId) changedIds.add(project.id);
    }
    // Unpinned mirrors follow their local counterpart's filing live, not only
    // on the next remote snapshot that happens to change the project rows.
    const pinned = useRemoteServersStore.getState().projectWorkspaceIds;
    const derivedProjectIds = new Set<string>();
    const rederived = state.projects.map((project) => {
      if (!project.remoteServerId || !project.remoteId) return project;
      if (changedIds.has(project.id)) return project;
      if (pinned[project.remoteServerId]?.[project.remoteId] !== undefined) return project;
      const inherited = counterpartWorkspace.get(project.name);
      if (project.workspaceId === inherited) return project;
      const next =
        inherited === undefined
          ? withoutWorkspace(project)
          : { ...project, workspaceId: inherited };
      derivedProjectIds.add(project.id);
      return next;
    });
    const rederivedChanged = rederived.some((project, index) => project !== state.projects[index]);
    if (rederivedChanged) {
      applyingDerivedProjects = true;
      try {
        useAppStore.setState({ projects: rederived });
      } finally {
        applyingDerivedProjects = false;
      }
    }
    const finalProjects = rederivedChanged ? rederived : state.projects;
    const changes: Array<{
      desktopId: string;
      remoteId: string;
      workspaceId: string | undefined;
    }> = [];
    for (const project of finalProjects) {
      if (!project.remoteServerId || !project.remoteId) continue;
      if (derivedProjectIds.has(project.id)) continue;
      const previous = previousProjects.get(project.id);
      if (!previous || previous.workspaceId === project.workspaceId) continue;
      changes.push({
        desktopId: project.remoteServerId,
        remoteId: project.remoteId,
        workspaceId: project.workspaceId,
      });
    }
    if (changes.length === 0) return;

    useRemoteServersStore.setState((remoteState) => {
      let projectWorkspaceIds = remoteState.projectWorkspaceIds;
      for (const change of changes) {
        const currentForServer = projectWorkspaceIds[change.desktopId] ?? {};
        const currentWorkspaceId = currentForServer[change.remoteId];
        const nextWorkspaceId = change.workspaceId ?? null;
        if (currentWorkspaceId === nextWorkspaceId) continue;
        const nextForServer = { ...currentForServer };
        nextForServer[change.remoteId] = nextWorkspaceId;
        projectWorkspaceIds = {
          ...projectWorkspaceIds,
          [change.desktopId]: nextForServer,
        };
      }
      return projectWorkspaceIds === remoteState.projectWorkspaceIds ? {} : { projectWorkspaceIds };
    });
  });
}
