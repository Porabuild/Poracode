import { useAuxiliaryThreadWindows } from "@/renderer/state/auxiliaryThreadWindows";
import { useShallow } from "zustand/shallow";
import type { Thread } from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { useProjectRemoteServerLookup } from "@/renderer/components/common/ProjectRemoteServer";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { useProjectGroupIndex } from "@/renderer/state/projectGroups/useProjectGroups";
import {
  useWorkspaceProjectIds,
  useWorkspaceThreadFilter,
} from "@/renderer/state/workspaceSelectors";

const FLAT_LIST_THREAD_FIELDS = [
  "id",
  "projectId",
  "workspaceId",
  "title",
  "status",
  "attention",
  "archived",
  "done",
  "starred",
  "groupId",
  "groupName",
  "worktreePath",
  "worktreeBranch",
  "createdAt",
  "updatedAt",
] as const satisfies readonly (keyof Thread)[];

let lastSourceThreads: readonly Thread[] | undefined;
let lastFlatListThreads: readonly Thread[] = [];

// Containers need list structure and group-header state; individual thread rows
// subscribe to their live records instead of rendering these retained snapshots.
function selectFlatListThreads(threads: readonly Thread[]): readonly Thread[] {
  if (threads === lastSourceThreads) return lastFlatListThreads;
  if (
    threads.length !== lastFlatListThreads.length ||
    threads.some((thread, index) => {
      const previous = lastFlatListThreads[index]!;
      return FLAT_LIST_THREAD_FIELDS.some((field) => thread[field] !== previous[field]);
    })
  ) {
    lastFlatListThreads = threads;
  }
  lastSourceThreads = threads;
  return lastFlatListThreads;
}

/**
 * One source of truth for the flat list and its project selector. Desktop
 * renders the selector above the list; compact web renders the same selector
 * from the mobile header, so both surfaces must agree about which projects are
 * visible, filterable, and selected.
 */
export function useFlatListProjectFilterModel() {
  const compactLayout = useCompactLayout();
  const workspaceProjectIds = useWorkspaceProjectIds();
  const isThreadInActiveWorkspace = useWorkspaceThreadFilter();
  const homeScopeEnabled = useSharedSettings((state) => state.homeScopeEnabled);
  const projects = useAppStore(useShallow((state) => state.projects));
  const threads = useAppStore((state) => selectFlatListThreads(state.threads));
  const auxiliaryIds = useAuxiliaryThreadWindows((s) => s.hiddenThreadIds);
  const remoteServerFor = useProjectRemoteServerLookup();
  const flatListProjectFilter = useSidebarUiStore((state) => state.flatListProjectFilter);
  const setFlatListProjectFilter = useSidebarUiStore((state) => state.setFlatListProjectFilter);
  const flatListShowDone = useSidebarUiStore((state) => state.flatListShowDone);
  const setFlatListShowDone = useSidebarUiStore((state) => state.setFlatListShowDone);
  const groupIndex = useProjectGroupIndex();

  // Match the grouped sidebar's workspace/Home visibility. Compact clients
  // keep cached remote projects browseable while their machine is offline;
  // desktop has a machine header that carries that unavailable state instead.
  // A reconnecting machine keeps its cached rows on both: hiding them would
  // blank the host's whole list on every brief event-socket reconnect.
  const includedIds = new Set(workspaceProjectIds);
  const workspaceProjects = projects.filter((project) => {
    if (isHomeProject(project)) return homeScopeEnabled;
    return includedIds.has(project.id);
  });
  const visibleProjects = workspaceProjects.filter((project) => {
    if (isHomeProject(project)) return true;
    if (project.disabled) return false;
    if (!project.remoteServerId) return true;
    const status = remoteServerFor(project).status;
    return compactLayout || status === "online" || status === "connecting";
  });
  const actionableProjects = visibleProjects.filter(
    (project) => !project.remoteServerId || remoteServerFor(project).status === "online",
  );
  const projectsById = new Map(visibleProjects.map((project) => [project.id, project]));
  const filterableProjectIds = new Set(projectsById.keys());

  // Stale persisted ids cannot filter the current workspace. Empty and
  // complete selections normalize to the canonical "all projects" state.
  // A selected project covers every listed environment of it: the filter menu
  // toggles them together, and a filter saved before a machine joined the
  // project (or before grouping) must show that machine's threads too. Only a
  // selection that is itself visible here expands; a stale id from another
  // workspace still drops out instead of selecting its siblings.
  const filteredVisibleIds = [
    ...new Set(
      (flatListProjectFilter ?? [])
        .filter((id) => projectsById.has(id))
        .flatMap((id) =>
          (groupIndex.groupByProjectId.get(id)?.members.map((member) => member.id) ?? [id]).filter(
            (memberId) => projectsById.has(memberId),
          ),
        ),
    ),
  ];
  const activeProjectFilter: ReadonlySet<string> | null =
    filteredVisibleIds.length === 0 || filteredVisibleIds.length >= visibleProjects.length
      ? null
      : new Set(filteredVisibleIds);

  const listableThreads = threads.filter(
    (thread) =>
      !auxiliaryIds.has(thread.id) &&
      !thread.archived &&
      projectsById.has(thread.projectId) &&
      isThreadInActiveWorkspace(thread),
  );
  // The compact home list is one flat view of either active or done threads;
  // desktop's flat list renders both, with Done as its own section.
  const showDone = compactLayout && flatListShowDone;
  const visibleThreads = compactLayout
    ? listableThreads.filter((thread) => thread.done === showDone)
    : listableThreads;
  // The sheet's Done count follows the project filter, like its project rows.
  const doneThreadCount = compactLayout
    ? listableThreads.filter(
        (thread) =>
          thread.done &&
          (activeProjectFilter === null || activeProjectFilter.has(thread.projectId)),
      ).length
    : 0;
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
    // Every listable thread, before the compact active/done view narrows it.
    listableThreads,
    threadCounts,
    showDone,
    doneThreadCount,
    remoteServerFor,
    setFlatListProjectFilter,
    setFlatListShowDone,
  };
}
