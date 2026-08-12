import { useShallow } from "zustand/shallow";
import type { Project } from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import {
  ProjectRemoteServerChip,
  ProjectSelectorIcon,
  useProjectRemoteServerLookup,
} from "@/renderer/components/common/ProjectRemoteServer";
import { openNewThread, openNewThreadSideBySide } from "@/renderer/actions/threadActions";
import { useDragSource } from "@/renderer/dnd";
import {
  useCurrentThreadIdsCount,
  useHasDraft,
  useIsCurrentProjectDraft,
  useLiveBackgroundThreadIds,
} from "@/renderer/hooks/uiSelectors";
import { useScrollFade } from "@/renderer/hooks/useScrollFade";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentCandidateOrder } from "@/renderer/state/experimentStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useSidebarUiStore, useThreadListLimit } from "@/renderer/state/sidebarUiStore";
import { useWorkspaceProjectIds } from "@/renderer/state/workspaceSelectors";
import { sidebarBodyScrollClass } from "@/renderer/components/layout/sidebarChrome";
import { NewThreadButton } from "./NewThreadButton";
import { SidebarProjectFilter } from "./SidebarProjectFilter";
import {
  buildSidebarProjectRows,
  SIDEBAR_FLAT_THREAD_LIST_PAGE_SIZE,
  type SidebarRow,
} from "./sidebarProjectRows";
import type { ThreadSortMode } from "./sortMode";
import { SeeMoreThreadsButton, SidebarThreadRow } from "./SidebarThreadRow";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { MobileQuickCompose } from "./MobileQuickCompose";

/**
 * `threadListLimits`/`revealMoreThreads` scope key for the flat list's single
 * "See more" pager. Not a real project id.
 */
const FLAT_LIST_SCOPE = "__flat__";

/** The project a row belongs to: a thread's own, or its group's first member's. */
function rowProjectId(row: Exclude<SidebarRow, { kind: "see-more" }>): string | undefined {
  if (row.kind === "thread") return row.thread.projectId;
  if (row.kind === "worktree-group") return row.group.threads[0]?.projectId;
  if (row.kind === "thread-group") return row.entry.group.threads[0]?.projectId;
  return undefined;
}

/**
 * One cross-project thread list (the PWA layout): no project sections, each
 * row labelled with its project instead. Worktree and provider groups keep
 * grouping; their headers carry the project tag for their children. The single
 * "New thread" row targets the most recently active project. Sorting follows
 * the shared sort mode, except per-project manual order, which has no meaning
 * across projects and falls back to last-updated.
 */
export function SidebarFlatThreadList(props: { sortMode: ThreadSortMode }) {
  const compactLayout = useCompactLayout();
  const workspaceProjectIds = useWorkspaceProjectIds();
  const homeScopeEnabled = useSharedSettings((s) => s.homeScopeEnabled);
  const projects = useAppStore(useShallow((s) => s.projects));
  const remoteServerFor = useProjectRemoteServerLookup();
  const experimentCandidateOrder = useExperimentCandidateOrder();
  const collapsedWorktrees = useSidebarUiStore((s) => s.collapsedWorktrees);
  const editingThreadId = useSidebarUiStore((s) => s.editingThreadId);
  const setEditingThreadId = useSidebarUiStore((s) => s.setEditingThreadId);
  const revealMoreThreads = useSidebarUiStore((s) => s.revealMoreThreads);
  const flatListProjectFilter = useSidebarUiStore((s) => s.flatListProjectFilter);
  const setFlatListProjectFilter = useSidebarUiStore((s) => s.setFlatListProjectFilter);
  const visibleLimit = useThreadListLimit(FLAT_LIST_SCOPE, SIDEBAR_FLAT_THREAD_LIST_PAGE_SIZE);
  const currentThreadCount = useCurrentThreadIdsCount();
  const source = useDragSource();
  // Own scroll container (the grouped/empty bodies use Sidebar's): the
  // filter/new-thread head above it stays pinned while the rows scroll.
  const { setScrollContainer, scrollFadeStyle } = useScrollFade<HTMLDivElement>({
    maxFadePx: 10,
  });

  // Same visibility rules as the grouped sidebar — workspace projects plus Home
  // (when enabled), minus disabled projects — except remote mirrors, which are
  // stricter here: the grouped view keeps an errored-but-reachable server's
  // section visible because its header carries the status, but flat rows have
  // no header to explain a dead server (e.g. a relay answering for a powered-off
  // machine reports `error`, not `offline`), so only online servers' threads
  // mix into the list.
  const includedIds = new Set(workspaceProjectIds);
  const workspaceProjects = projects.filter((project) => {
    // Home is a synthetic row persisted with `disabled: true` by design — the
    // home-scope setting alone decides whether it shows (mirrors the grouped
    // sidebar's dedicated Home section).
    if (isHomeProject(project)) return homeScopeEnabled;
    return includedIds.has(project.id);
  });
  const visibleProjects = workspaceProjects.filter((project) => {
    if (isHomeProject(project)) return true;
    if (project.disabled) return false;
    if (!project.remoteServerId) return true;
    return remoteServerFor(project).status === "online";
  });
  const newThreadProjects = [...visibleProjects].sort((a, b) => {
    const rank = (project: Project) =>
      isHomeProject(project) ? 0 : project.remoteServerId ? 2 : 1;
    return rank(a) - rank(b);
  });
  const projectsById = new Map(visibleProjects.map((project) => [project.id, project]));
  const filterableProjectIds = new Set(projectsById.keys());

  // The persisted filter can name projects that are gone or currently hidden
  // (workspace switch, home scope off, dead remote server); only ids
  // intersecting the visible set can match, and a selection covering every
  // visible project reads — and behaves — the same as no filter.
  const filteredVisibleIds = flatListProjectFilter?.filter((id) => projectsById.has(id)) ?? [];
  const activeProjectFilter: ReadonlySet<string> | null =
    filteredVisibleIds.length === 0 || filteredVisibleIds.length >= visibleProjects.length
      ? null
      : new Set(filteredVisibleIds);

  const allThreads = useAppStore((s) => s.threads);
  const visibleThreads = allThreads.filter(
    (thread) => !thread.archived && projectsById.has(thread.projectId),
  );
  const threadCounts = new Map<string, number>();
  for (const thread of visibleThreads) {
    threadCounts.set(thread.projectId, (threadCounts.get(thread.projectId) ?? 0) + 1);
  }
  const threads =
    activeProjectFilter === null
      ? visibleThreads
      : visibleThreads.filter((thread) => activeProjectFilter.has(thread.projectId));
  const liveBackgroundThreadIds = useLiveBackgroundThreadIds(threads);

  // "New thread" targets the most recently active project (latest thread
  // update), falling back to the first project in the filter — or the first
  // visible project when unfiltered — on a fresh workspace.
  let latestProjectId: string | undefined;
  let latestUpdatedAt = "";
  for (const thread of threads) {
    if (thread.updatedAt > latestUpdatedAt) {
      latestUpdatedAt = thread.updatedAt;
      latestProjectId = thread.projectId;
    }
  }
  latestProjectId ??= activeProjectFilter
    ? visibleProjects.find((project) => activeProjectFilter.has(project.id))?.id
    : visibleProjects[0]?.id;
  const hasDraft = useHasDraft(latestProjectId ?? "");
  const isDraftActive = useIsCurrentProjectDraft(latestProjectId ?? "");

  const rows = buildSidebarProjectRows({
    projectId: FLAT_LIST_SCOPE,
    projectThreads: threads,
    sortMode: props.sortMode === "created" ? "created" : "updated",
    collapsedWorktrees,
    visibleLimit,
    liveBackgroundThreadIds,
    ...(experimentCandidateOrder.size > 0 ? { experimentCandidateOrder } : {}),
  });

  const renderNewThreadButton = (inline: boolean) =>
    latestProjectId && !compactLayout ? (
      <NewThreadButton
        {...(inline ? { inline: true } : {})}
        projectId={latestProjectId}
        hasDraft={hasDraft}
        isActive={isDraftActive}
        isDraggingAnything={!!source}
        canOpenAsPanel={currentThreadCount > 0 && currentThreadCount < 3}
        projectOptions={newThreadProjects.map((project) => {
          const remote = remoteServerFor(project);
          return {
            id: project.id,
            name: project.name,
            icon: <ProjectSelectorIcon project={project} remote={remote} />,
            ...(remote.serverName ? { description: remote.serverName } : {}),
          };
        })}
        onPress={() => openNewThread(latestProjectId)}
        onSelectProject={openNewThread}
        onOpenAsPanel={() => openNewThreadSideBySide(latestProjectId)}
      />
    ) : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {visibleProjects.length > 1 || workspaceProjects.length > visibleProjects.length ? (
        // Filter and new-thread share one head row; the new-thread control
        // collapses to an icon button (tooltip) when the row is narrow.
        <div className="poracode-flat-list-head flex shrink-0 items-center gap-1 pb-0.5">
          <div className="min-w-0 flex-1">
            <SidebarProjectFilter
              projects={workspaceProjects}
              filterableProjectIds={filterableProjectIds}
              threadCounts={threadCounts}
              value={activeProjectFilter}
              onChange={setFlatListProjectFilter}
            />
          </div>
          {renderNewThreadButton(true)}
        </div>
      ) : (
        <div className="shrink-0 pb-0.5">{renderNewThreadButton(false)}</div>
      )}

      <div
        ref={setScrollContainer}
        className={`poracode-flat-thread-scroll ${sidebarBodyScrollClass()}`}
        style={scrollFadeStyle}
      >
        <div>
          {rows.map((row) => {
            if (row.kind === "see-more") {
              return (
                <SeeMoreThreadsButton
                  key={row.key}
                  onPress={() =>
                    revealMoreThreads(FLAT_LIST_SCOPE, SIDEBAR_FLAT_THREAD_LIST_PAGE_SIZE)
                  }
                />
              );
            }
            const projectId = rowProjectId(row);
            const project: Project | undefined = projectId
              ? projectsById.get(projectId)
              : visibleProjects[0];
            if (!project) return null;
            // Children under a group header omit the tag — the header carries it.
            const tagged = !(row.kind === "thread" && row.inGroup) && row.kind !== "section-label";
            // Thread rows and worktree headers stack the tag on a second line;
            // provider/experiment group headers keep the inline trailing form.
            const stackedTag = row.kind === "thread" || row.kind === "worktree-group";
            // Remote mirrors carry the machine name so their rows read as
            // non-local; mirrors the grouped project header's server chip.
            const remote = remoteServerFor(project);
            return (
              <SidebarThreadRow
                key={row.key}
                row={row}
                project={project}
                editingThreadId={editingThreadId}
                setEditingThreadId={setEditingThreadId}
                {...(tagged
                  ? {
                      projectTag: (
                        <span
                          className={`${stackedTag ? "min-w-0 flex-1" : "ml-auto max-w-[9rem] shrink-0 pl-1"} flex items-center gap-1 text-[10px] leading-4 text-muted/70`}
                        >
                          <span className="truncate">{project.name}</span>
                          <ProjectRemoteServerChip info={remote} size="xs" />
                        </span>
                      ),
                    }
                  : {})}
              />
            );
          })}
        </div>
      </div>
      {compactLayout && latestProjectId ? <MobileQuickCompose projectId={latestProjectId} /> : null}
    </div>
  );
}
