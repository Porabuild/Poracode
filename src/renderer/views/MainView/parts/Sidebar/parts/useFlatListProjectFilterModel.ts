import { useShallow } from "zustand/shallow";
import { isHomeProject } from "@/shared/homeScope";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { useProjectRemoteServerLookup } from "@/renderer/components/common/ProjectRemoteServer";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { useWorkspaceProjectIds } from "@/renderer/state/workspaceSelectors";

/**
 * One source of truth for the flat list and its project selector. Desktop
 * renders the selector above the list; compact web renders the same selector
 * from the mobile header, so both surfaces must agree about which projects are
 * visible, filterable, and selected.
 */
export function useFlatListProjectFilterModel() {
  const compactLayout = useCompactLayout();
  const workspaceProjectIds = useWorkspaceProjectIds();
  const homeScopeEnabled = useSharedSettings((state) => state.homeScopeEnabled);
  const projects = useAppStore(useShallow((state) => state.projects));
  const threads = useAppStore((state) => state.threads);
  const remoteServerFor = useProjectRemoteServerLookup();
  const flatListProjectFilter = useSidebarUiStore((state) => state.flatListProjectFilter);
  const setFlatListProjectFilter = useSidebarUiStore((state) => state.setFlatListProjectFilter);

  // Match the grouped sidebar's workspace/Home visibility. Compact clients
  // keep cached remote projects browseable while their machine is offline;
  // desktop has a machine header that carries that unavailable state instead.
  const includedIds = new Set(workspaceProjectIds);
  const workspaceProjects = projects.filter((project) => {
    if (isHomeProject(project)) return homeScopeEnabled;
    return includedIds.has(project.id);
  });
  const visibleProjects = workspaceProjects.filter((project) => {
    if (isHomeProject(project)) return true;
    if (project.disabled) return false;
    if (!project.remoteServerId) return true;
    return compactLayout || remoteServerFor(project).status === "online";
  });
  const actionableProjects = visibleProjects.filter(
    (project) => !project.remoteServerId || remoteServerFor(project).status === "online",
  );
  const projectsById = new Map(visibleProjects.map((project) => [project.id, project]));
  const filterableProjectIds = new Set(projectsById.keys());

  // Stale persisted ids cannot filter the current workspace. Empty and
  // complete selections normalize to the canonical "all projects" state.
  const filteredVisibleIds = flatListProjectFilter?.filter((id) => projectsById.has(id)) ?? [];
  const activeProjectFilter: ReadonlySet<string> | null =
    filteredVisibleIds.length === 0 || filteredVisibleIds.length >= visibleProjects.length
      ? null
      : new Set(filteredVisibleIds);

  const visibleThreads = threads.filter(
    (thread) => !thread.archived && projectsById.has(thread.projectId),
  );
  const threadCounts = new Map<string, number>();
  for (const thread of visibleThreads) {
    threadCounts.set(thread.projectId, (threadCounts.get(thread.projectId) ?? 0) + 1);
  }

  return {
    workspaceProjects,
    visibleProjects,
    actionableProjects,
    projectsById,
    filterableProjectIds,
    activeProjectFilter,
    visibleThreads,
    threadCounts,
    remoteServerFor,
    setFlatListProjectFilter,
  };
}
