import type { Project } from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import { ProjectIcon } from "@/renderer/components/common/ProjectIcon";
import { TuxIcon } from "@/renderer/components/common/TuxIcon";
import {
  ProjectRemoteServerChip,
  ProjectSelectorIcon,
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
import { useExperimentCandidateOrder } from "@/renderer/state/experimentStore";
import { useSidebarUiStore, useThreadListLimit } from "@/renderer/state/sidebarUiStore";
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
import { useFlatListProjectFilterModel } from "./useFlatListProjectFilterModel";

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
  const {
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
  } = useFlatListProjectFilterModel();
  const experimentCandidateOrder = useExperimentCandidateOrder();
  const collapsedWorktrees = useSidebarUiStore((s) => s.collapsedWorktrees);
  const editingThreadId = useSidebarUiStore((s) => s.editingThreadId);
  const setEditingThreadId = useSidebarUiStore((s) => s.setEditingThreadId);
  const revealMoreThreads = useSidebarUiStore((s) => s.revealMoreThreads);
  const visibleLimit = useThreadListLimit(FLAT_LIST_SCOPE, SIDEBAR_FLAT_THREAD_LIST_PAGE_SIZE);
  const currentThreadCount = useCurrentThreadIdsCount();
  const source = useDragSource();
  // Own scroll container (the grouped/empty bodies use Sidebar's): the
  // filter/new-thread head above it stays pinned while the rows scroll.
  const { setScrollContainer, scrollFadeStyle } = useScrollFade<HTMLDivElement>({
    maxFadePx: 10,
  });

  // Offline machines remain browseable on mobile, but they are not valid
  // composer targets until their connection comes back.
  const newThreadProjects = [...actionableProjects].sort((a, b) => {
    const rank = (project: Project) =>
      isHomeProject(project) ? 0 : project.remoteServerId ? 2 : 1;
    return rank(a) - rank(b);
  });
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
  const actionableProjectIds = new Set(actionableProjects.map((project) => project.id));
  for (const thread of threads) {
    if (!actionableProjectIds.has(thread.projectId)) continue;
    if (thread.updatedAt > latestUpdatedAt) {
      latestUpdatedAt = thread.updatedAt;
      latestProjectId = thread.projectId;
    }
  }
  latestProjectId ??= activeProjectFilter
    ? actionableProjects.find((project) => activeProjectFilter.has(project.id))?.id
    : actionableProjects[0]?.id;
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
      {!compactLayout &&
      (visibleProjects.length > 1 || workspaceProjects.length > visibleProjects.length) ? (
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
      ) : compactLayout ? null : (
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
                          {/* Sized to the tag, not the 16px menu default, so a
                              custom icon reads as part of the 10px label. */}
                          <ProjectIcon project={project} className="size-3 text-muted/70" />
                          <span className="truncate">{project.name}</span>
                          <ProjectRemoteServerChip info={remote} size="xs" />
                          {/* Mirrors the grouped header's trailing WSL marker. */}
                          {project.location.kind === "wsl" ? (
                            <TuxIcon className="h-2.5 w-auto shrink-0 text-muted/60" />
                          ) : null}
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
