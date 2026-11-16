import type { Project } from "@/shared/contracts";
import {
  ProjectEnvironmentIndicator,
  useProjectEnvironmentMachineLookup,
} from "@/renderer/components/common/ProjectEnvironment";
import { ProjectSelectorIcon } from "@/renderer/components/common/ProjectRemoteServer";
import { openNewThread, openNewThreadSideBySide } from "@/renderer/actions/threadActions";
import { useDragSource } from "@/renderer/dnd";
import {
  useCurrentThreadIds,
  useCurrentThreadIdsCount,
  useHasDraft,
  useIsCurrentProjectDraft,
  useLiveBackgroundThreadIds,
} from "@/renderer/hooks/uiSelectors";
import { useScrollFade } from "@/renderer/hooks/useScrollFade";
import { useExperimentCandidateOrder } from "@/renderer/state/experimentStore";
import { useSidebarUiStore, useThreadListLimit } from "@/renderer/state/sidebarUiStore";
import { sidebarBodyScrollClass } from "@/renderer/components/layout/sidebarChrome";
import { FlatListProjectTag } from "./FlatListProjectTag";
import { NewThreadButton } from "./NewThreadButton";
import { pickNewThreadProjectId } from "./newThreadTargetProject";
import { SidebarProjectFilter } from "./SidebarProjectFilter";
import {
  buildSidebarProjectRows,
  FLAT_THREAD_LIST_ID,
  SIDEBAR_FLAT_THREAD_LIST_PAGE_SIZE,
  type SidebarRow,
} from "./sidebarProjectRows";
import type { ThreadSortMode } from "./sortMode";
import { SeeMoreThreadsButton, SidebarThreadRow } from "./SidebarThreadRow";
import { SidebarDoneRows } from "./SidebarDoneRows";
import { DONE_SECTION_MAX_HEIGHT_PERCENT, useDoneViewportReveal } from "./useDoneViewportReveal";
import { useFlatListProjectFilterModel } from "./useFlatListProjectFilterModel";
import { useProjectSwitchEntries } from "@/renderer/components/thread/projectSwitchGroups";
import { pickGroupMember } from "@/renderer/state/projectGroups/useProjectGroups";
import { useProjectGroupStore } from "@/renderer/state/projectGroups/projectGroupStore";

/** Scope key for the pinned Done section's own "See more" pager. */
const FLAT_DONE_SCOPE = `${FLAT_THREAD_LIST_ID}:done`;

/** The project a row belongs to: a thread's own, or its group's first member's. */
function rowProjectId(row: Exclude<SidebarRow, { kind: "see-more" }>): string | undefined {
  if (row.kind === "thread") return row.thread.projectId;
  if (row.kind === "worktree-group") return row.group.threads[0]?.projectId;
  if (row.kind === "thread-group") return row.entry.group.threads[0]?.projectId;
  return undefined;
}

/**
 * One cross-project thread list (desktop's flat layout): no project sections, each
 * row labelled with its project instead. Worktree and provider groups keep
 * grouping; their headers carry the project tag for their children. The single
 * "New thread" row targets the most recently active project. Sorting follows
 * the shared sort mode. Manual order is the global thread order, which spans
 * projects, so local rows can be dragged past other projects' threads.
 */
export function SidebarFlatThreadList(props: { sortMode: ThreadSortMode }) {
  const newThreadEntries = useProjectSwitchEntries();
  const machineFor = useProjectEnvironmentMachineLookup();
  const lastUsedAt = useProjectGroupStore((state) => state.lastUsedAt);
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
  const visibleLimit = useThreadListLimit(FLAT_THREAD_LIST_ID, SIDEBAR_FLAT_THREAD_LIST_PAGE_SIZE);
  const doneVisibleLimit = useThreadListLimit(FLAT_DONE_SCOPE, SIDEBAR_FLAT_THREAD_LIST_PAGE_SIZE);
  const currentThreadIds = useCurrentThreadIds();
  const currentThreadCount = useCurrentThreadIdsCount();
  const source = useDragSource();
  // Own scroll container (the grouped/empty bodies use Sidebar's): the
  // filter/new-thread head above it stays pinned while the rows scroll.
  const { setScrollContainer, scrollFadeStyle } = useScrollFade<HTMLDivElement>({
    maxFadePx: 10,
  });

  const threads =
    activeProjectFilter === null
      ? visibleThreads
      : visibleThreads.filter((thread) => activeProjectFilter.has(thread.projectId));
  const liveBackgroundThreadIds = useLiveBackgroundThreadIds(threads);

  // "New thread" targets the most recently active project.
  const latestProjectId = pickNewThreadProjectId(threads, actionableProjects, activeProjectFilter);
  const hasDraft = useHasDraft(latestProjectId ?? "");
  const isDraftActive = useIsCurrentProjectDraft(latestProjectId ?? "");

  const rows = buildSidebarProjectRows({
    projectId: FLAT_THREAD_LIST_ID,
    projectThreads: threads,
    sortMode: props.sortMode,
    collapsedWorktrees,
    visibleLimit,
    liveBackgroundThreadIds,
    openThreadIds: new Set(currentThreadIds),
    doneVisibleLimit,
    ...(experimentCandidateOrder.size > 0 ? { experimentCandidateOrder } : {}),
  });
  // The Done section is pinned below the scrolling rows: its header stays put
  // and the done rows under it scroll on their own. Done is the only section
  // label the builder emits, and every row after it belongs to Done.
  const doneStart = rows.findIndex((row) => row.kind === "section-label");
  const listRows = doneStart === -1 ? rows : rows.slice(0, doneStart);
  const doneHeader = doneStart === -1 ? undefined : rows[doneStart];
  const doneRows = doneStart === -1 ? [] : rows.slice(doneStart + 1);
  const doneViewportRef = useDoneViewportReveal(
    doneHeader?.kind !== "section-label" || doneHeader.collapsed,
  );

  const renderNewThreadButton = (inline: boolean) =>
    latestProjectId ? (
      <NewThreadButton
        {...(inline ? { inline: true } : {})}
        projectId={latestProjectId}
        hasDraft={hasDraft}
        isActive={isDraftActive}
        isDraggingAnything={!!source}
        canOpenAsPanel={currentThreadCount > 0 && currentThreadCount < 3}
        projectOptions={newThreadEntries.map((entry) => {
          const project = entry.members[0]!;
          const target = pickGroupMember(entry.members, () => true, lastUsedAt)!;
          const remote = remoteServerFor(project);
          return {
            id: target.id,
            name: project.name,
            icon: <ProjectSelectorIcon project={project} remote={remote} showEnvironment={false} />,
            trailingContent: (
              <ProjectEnvironmentIndicator members={entry.environments} machineFor={machineFor} />
            ),
          };
        })}
        onPress={() => openNewThread(latestProjectId)}
        onSelectProject={(projectId) => {
          useProjectGroupStore.getState().markProjectUsed(projectId);
          openNewThread(projectId);
        }}
        onOpenAsPanel={() => openNewThreadSideBySide(latestProjectId)}
      />
    ) : null;

  const stackedTagByProjectId = new Map(
    visibleProjects.map((project) => [
      project.id,
      <FlatListProjectTag
        key={project.id}
        project={project}
        remote={remoteServerFor(project)}
        stacked
      />,
    ]),
  );
  const inlineTagByProjectId = new Map(
    visibleProjects.map((project) => [
      project.id,
      <FlatListProjectTag
        key={project.id}
        project={project}
        remote={remoteServerFor(project)}
        stacked={false}
      />,
    ]),
  );

  const renderRow = (row: SidebarRow) => {
    if (row.kind === "see-more") {
      const scope = row.section === "done" ? FLAT_DONE_SCOPE : FLAT_THREAD_LIST_ID;
      return (
        <SeeMoreThreadsButton
          key={row.key}
          onPress={() => revealMoreThreads(scope, SIDEBAR_FLAT_THREAD_LIST_PAGE_SIZE)}
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
    const projectTag = tagged
      ? (stackedTag ? stackedTagByProjectId : inlineTagByProjectId).get(project.id)
      : undefined;
    return (
      <SidebarThreadRow
        key={row.key}
        row={row}
        project={project}
        editingThreadId={editingThreadId}
        setEditingThreadId={setEditingThreadId}
        {...(projectTag !== undefined ? { projectTag } : {})}
      />
    );
  };

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

      <div ref={setScrollContainer} className={sidebarBodyScrollClass()} style={scrollFadeStyle}>
        <div>{listRows.map(renderRow)}</div>
      </div>

      {doneHeader ? (
        // Sized to its rows up to half the column; past that the rows scroll.
        <div
          className="flex shrink-0 flex-col"
          style={{ maxHeight: `${DONE_SECTION_MAX_HEIGHT_PERCENT}%` }}
        >
          {renderRow(doneHeader)}
          <div ref={doneViewportRef} className={sidebarBodyScrollClass()}>
            <SidebarDoneRows rows={doneRows} renderRow={renderRow} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
