import { Inbox } from "lucide-react";
import { Trans } from "@lingui/react/macro";
import { useLiveBackgroundThreadIds } from "@/renderer/hooks/uiSelectors";
import { useSidebarUiStore, useThreadListLimit } from "@/renderer/state/sidebarUiStore";
import { FlatListProjectTag } from "./FlatListProjectTag";
import { orderCompactHomeThreads } from "./compactHomeThreads";
import { MobileQuickCompose } from "./MobileQuickCompose";
import { pickNewThreadProjectId } from "./newThreadTargetProject";
import {
  FLAT_THREAD_LIST_ID,
  FLAT_THREAD_LIST_SORT_GROUP,
  selectVisible,
  SIDEBAR_FLAT_THREAD_LIST_PAGE_SIZE,
  threadIsProtected,
} from "./sidebarProjectRows";
import { SeeMoreThreadsButton, SidebarThreadRow } from "./SidebarThreadRow";
import type { ThreadSortMode } from "./sortMode";
import { useFlatListProjectFilterModel } from "./useFlatListProjectFilterModel";

/** "See more" pager scope of the compact Done view; Active uses the flat list's scope. */
const COMPACT_DONE_SCOPE = `${FLAT_THREAD_LIST_ID}:compact-done`;

function CompactHomeEmptyState(props: {
  showDone: boolean;
  filtered: boolean;
  hasDoneThreads: boolean;
}) {
  const { showDone, filtered, hasDoneThreads } = props;
  // Active view: a user whose threads are all done is pointed at Done instead
  // of being told they have no conversations.
  return (
    <div className="m-empty" role="status">
      <span className="m-empty__icon" aria-hidden="true">
        <Inbox className="size-4" />
      </span>
      <strong>
        {showDone ? (
          <Trans>No done threads</Trans>
        ) : filtered ? (
          <Trans>No matching threads</Trans>
        ) : hasDoneThreads ? (
          <Trans>No active threads</Trans>
        ) : (
          <Trans>No conversations yet</Trans>
        )}
      </strong>
      {showDone && !filtered ? null : (
        <p>
          {filtered ? (
            <Trans>Adjust your project filter.</Trans>
          ) : hasDoneThreads ? (
            <Trans>Select Done in the filter to see finished threads.</Trans>
          ) : (
            <Trans>Conversations from all paired desktops will appear here.</Trans>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * The compact (PWA) home list: one flat, cross-project run of active threads
 * (done threads only when the filter sheet selects Done). The scroller fills
 * the page edge to edge; the header and the floating compose dock sit over it
 * as transparent layers, so rows scroll underneath. The "New thread" target
 * is the quick composer, which follows the most recently active project.
 */
export function CompactHomeThreadList(props: { sortMode: ThreadSortMode }) {
  const {
    actionableProjects,
    projectsById,
    activeProjectFilter,
    visibleThreads,
    listableThreads,
    showDone,
    doneThreadCount,
    remoteServerFor,
  } = useFlatListProjectFilterModel();
  const editingThreadId = useSidebarUiStore((s) => s.editingThreadId);
  const setEditingThreadId = useSidebarUiStore((s) => s.setEditingThreadId);
  const revealMoreThreads = useSidebarUiStore((s) => s.revealMoreThreads);
  const scope = showDone ? COMPACT_DONE_SCOPE : FLAT_THREAD_LIST_ID;
  const visibleLimit = useThreadListLimit(scope, SIDEBAR_FLAT_THREAD_LIST_PAGE_SIZE);

  const inFilter = (projectId: string) =>
    activeProjectFilter === null || activeProjectFilter.has(projectId);
  const threads = visibleThreads.filter((thread) => inFilter(thread.projectId));
  const liveBackgroundThreadIds = useLiveBackgroundThreadIds(threads);
  const ordered = orderCompactHomeThreads(threads, props.sortMode, showDone);
  const { visible, hiddenCount } = selectVisible(ordered, visibleLimit, (thread) =>
    threadIsProtected(thread, liveBackgroundThreadIds),
  );

  // The quick composer targets the most recently active project, active or
  // done, whichever view is showing.
  const latestProjectId = pickNewThreadProjectId(
    listableThreads,
    actionableProjects,
    activeProjectFilter,
  );

  const tagByProjectId = new Map(
    Array.from(projectsById.values(), (project) => [
      project.id,
      <FlatListProjectTag
        key={project.id}
        project={project}
        remote={remoteServerFor(project)}
        stacked
      />,
    ]),
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="m-home-scroll">
        {ordered.length === 0 ? (
          <CompactHomeEmptyState
            showDone={showDone}
            filtered={activeProjectFilter !== null}
            hasDoneThreads={doneThreadCount > 0}
          />
        ) : (
          <>
            {ordered.map((thread, threadIndex) => {
              if (!visible.has(thread)) return null;
              const project = projectsById.get(thread.projectId);
              if (!project) return null;
              return (
                <SidebarThreadRow
                  key={thread.id}
                  row={{
                    kind: "thread",
                    key: `thread:${thread.id}`,
                    thread,
                    threadIndex,
                    group: FLAT_THREAD_LIST_SORT_GROUP,
                    showWorktreeBadge: true,
                    showWorktreeFilesButton: !!thread.worktreePath,
                    sortDisabled: true,
                  }}
                  project={project}
                  editingThreadId={editingThreadId}
                  setEditingThreadId={setEditingThreadId}
                  projectTag={tagByProjectId.get(project.id)}
                />
              );
            })}
            {hiddenCount > 0 ? (
              <SeeMoreThreadsButton
                onPress={() => revealMoreThreads(scope, SIDEBAR_FLAT_THREAD_LIST_PAGE_SIZE)}
              />
            ) : null}
          </>
        )}
      </div>
      {latestProjectId ? <MobileQuickCompose projectId={latestProjectId} /> : null}
    </div>
  );
}
