import {
  isProjectInWorkspace,
  isThreadInWorkspace,
  type Project,
  type Thread,
} from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import { isCompactLayoutViewport } from "@/renderer/adaptiveLayout";
import { useAppStore } from "@/renderer/state/appStore";
import { useAuxiliaryThreadWindows } from "@/renderer/state/auxiliaryThreadWindows";
import { usePanelStore } from "@/renderer/state/panelStore";
import { getProjectGroupIndex } from "@/renderer/state/projectGroups/useProjectGroups";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import {
  getActiveWorkspaceId,
  getKnownWorkspaceIds,
  resolveCompactWorkspaceFilter,
  useWorkspaceStore,
} from "@/renderer/state/workspaceStore";
import { buildSidebarProjectRows, FLAT_THREAD_LIST_ID } from "./sidebarProjectRows";

interface WorkspaceScope {
  compact: boolean;
  projectInWorkspace: (project: Project) => boolean;
  threadInWorkspace: (thread: Thread) => boolean;
}

/**
 * Non-reactive twin of `useWorkspaceProjectFilter` / `useWorkspaceThreadFilter`.
 * The sidebar keeps a reactive model for rendering; keyboard navigation only
 * needs one snapshot, so it reads the same canonical membership rules here.
 * A compact client's "All workspaces" filter deliberately shows every project.
 */
function workspaceScope(): WorkspaceScope {
  const workspaces = useSharedSettings.getState().workspaces ?? [];
  const knownWorkspaceIds = getKnownWorkspaceIds();
  const compact = isCompactLayoutViewport();
  const activeWorkspaceId = getActiveWorkspaceId();
  const compactWorkspaceId = compact
    ? resolveCompactWorkspaceFilter(workspaces, useWorkspaceStore.getState().compactWorkspaceFilter)
    : null;
  return {
    compact,
    projectInWorkspace: (project) =>
      compact
        ? compactWorkspaceId === null ||
          isProjectInWorkspace(project, compactWorkspaceId, knownWorkspaceIds)
        : isProjectInWorkspace(project, activeWorkspaceId, knownWorkspaceIds),
    threadInWorkspace: (thread) =>
      compact
        ? compactWorkspaceId === null ||
          isThreadInWorkspace(thread, compactWorkspaceId, knownWorkspaceIds)
        : isThreadInWorkspace(thread, activeWorkspaceId, knownWorkspaceIds),
  };
}

/**
 * Projects the sidebar actually shows, in sidebar order: Home sections first
 * (grouped layout), then the active workspace's projects in store order.
 * Disabled, out-of-workspace, and desktop-offline remote projects are excluded,
 * matching `useFlatListProjectFilterModel`'s `visibleProjects`.
 */
function visibleProjectIds(scope: WorkspaceScope): string[] {
  const homeScopeEnabled = useSharedSettings.getState().homeScopeEnabled;
  const runtime = useRemoteServersStore.getState().runtime;
  const homeIds: string[] = [];
  const projectIds: string[] = [];
  for (const project of useAppStore.getState().projects) {
    if (isHomeProject(project)) {
      if (homeScopeEnabled) homeIds.push(project.id);
      continue;
    }
    if (!scope.projectInWorkspace(project) || project.disabled) continue;
    const status = project.remoteServerId ? runtime[project.remoteServerId]?.status : undefined;
    if (!scope.compact && project.remoteServerId && status !== "online" && status !== "connecting")
      continue;
    projectIds.push(project.id);
  }
  return [...homeIds, ...projectIds];
}

/**
 * The flat/compact list's active project filter, normalized the same way the
 * sidebar does: stale ids drop, a selection covers every machine in its logical
 * project group, and empty/complete selections mean "all projects". Grouped
 * sections have no such filter, so they return null.
 */
function flatProjectFilter(
  visibleIds: readonly string[],
  compact: boolean,
  flatLayout: boolean,
): ReadonlySet<string> | null {
  if (!compact && !flatLayout) return null;
  const stored = useSidebarUiStore.getState().flatListProjectFilter ?? [];
  const visible = new Set(visibleIds);
  const groupIndex = getProjectGroupIndex();
  const filtered = [
    ...new Set(
      stored
        .filter((id) => visible.has(id))
        .flatMap((id) =>
          (groupIndex.groupByProjectId.get(id)?.members.map((member) => member.id) ?? [id]).filter(
            (memberId) => visible.has(memberId),
          ),
        ),
    ),
  ];
  return filtered.length === 0 || filtered.length >= visibleIds.length ? null : new Set(filtered);
}

/**
 * Ordered ids of every navigable thread in the active workspace, in the
 * sidebar's selected sort/grouping/layout order. Read-only and non-reactive:
 * the workspace-scoped Next/Previous chat commands use it to cycle one flat
 * sequence, wrapping at the ends.
 *
 * Mirrors the project-local shortcuts: every worktree/provider group is
 * expanded and the "See more" cap is lifted, so collapsed and overflowed rows
 * are reachable. Archived, auxiliary, hidden-by-filter, disabled-project, and
 * out-of-workspace threads are excluded. With the flat/compact list selected,
 * the whole workspace is one cross-project list (`FLAT_THREAD_LIST_ID`); with
 * "Grouped by project" selected, each project section keeps its own rows and
 * sections follow project order.
 */
export function buildWorkspaceThreadOrder(): string[] {
  const scope = workspaceScope();
  const projectIds = visibleProjectIds(scope);
  const visible = new Set(projectIds);
  const layout = usePanelStore.getState().threadListLayout;
  const filter = flatProjectFilter(projectIds, scope.compact, layout === "flat");
  const auxiliaryIds = useAuxiliaryThreadWindows.getState().hiddenThreadIds;

  const threads = useAppStore
    .getState()
    .threads.filter(
      (thread) =>
        !auxiliaryIds.has(thread.id) &&
        !thread.archived &&
        visible.has(thread.projectId) &&
        (!filter || filter.has(thread.projectId)) &&
        scope.threadInWorkspace(thread),
    );

  const rowIds = (projectThreads: Thread[], projectId: string) =>
    buildSidebarProjectRows({
      projectId,
      projectThreads,
      sortMode: usePanelStore.getState().threadSortMode,
      collapsedWorktrees: {},
      expandAllGroups: true,
      visibleLimit: Number.MAX_SAFE_INTEGER,
    }).flatMap((row) => (row.kind === "thread" ? [row.thread.id] : []));

  if (layout === "flat" || scope.compact) return rowIds(threads, FLAT_THREAD_LIST_ID);

  const byProject = new Map<string, Thread[]>();
  for (const thread of threads) {
    const list = byProject.get(thread.projectId) ?? [];
    list.push(thread);
    byProject.set(thread.projectId, list);
  }
  return projectIds.flatMap((id) => {
    const list = byProject.get(id);
    return list ? rowIds(list, id) : [];
  });
}
