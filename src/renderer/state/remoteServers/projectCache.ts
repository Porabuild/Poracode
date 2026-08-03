import type { Project } from "@/shared/contracts";
import type { RemoteServersState } from "./types";

function sidebarProject(project: Project): Project {
  return {
    id: project.id,
    name: project.name,
    location: project.location,
    ...(project.disabled !== undefined ? { disabled: project.disabled } : {}),
    createdAt: project.createdAt,
  };
}

export function replaceCachedProjects(
  current: RemoteServersState["lastKnownProjects"],
  desktopId: string,
  projects: readonly Project[],
): RemoteServersState["lastKnownProjects"] {
  const next = projects.map(sidebarProject);
  const previous = current[desktopId];
  if (previous && JSON.stringify(previous) === JSON.stringify(next)) return current;
  return { ...current, [desktopId]: next };
}

export function removeCachedProjects(
  current: RemoteServersState["lastKnownProjects"],
  desktopId: string,
): RemoteServersState["lastKnownProjects"] {
  if (!(desktopId in current)) return current;
  const { [desktopId]: _removed, ...remaining } = current;
  return remaining;
}

export function persistedRemoteServersState(state: RemoteServersState) {
  return {
    servers: state.servers,
    excludedProjectIds: state.excludedProjectIds,
    projectWorkspaceIds: state.projectWorkspaceIds,
    projectNameOverrides: state.projectNameOverrides,
    lastKnownProjects: state.lastKnownProjects,
  };
}
