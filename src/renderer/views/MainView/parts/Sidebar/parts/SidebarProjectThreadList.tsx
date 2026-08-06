import type { Project } from "@/shared/contracts";
import {
  useCurrentThreadIdsCount,
  useHasDraft,
  useIsCurrentProjectDraft,
  useLiveBackgroundThreadIds,
  useProjectThreads,
} from "@/renderer/hooks/uiSelectors";
import { useDragSource } from "@/renderer/dnd";
import { openNewThread, openNewThreadSideBySide } from "@/renderer/actions/threadActions";
import { useSidebarUiStore, useThreadListLimit } from "@/renderer/state/sidebarUiStore";
import { useExperimentCandidateOrder } from "@/renderer/state/experimentStore";
import { NewThreadButton } from "./NewThreadButton";
import { buildSidebarProjectRows } from "./sidebarProjectRows";
import type { ThreadSortMode } from "./sortMode";
import { SeeMoreThreadsButton, SidebarThreadRow } from "./SidebarThreadRow";

export function SidebarProjectThreadList(props: { project: Project; sortMode: ThreadSortMode }) {
  const { project, sortMode } = props;
  const projectThreads = useProjectThreads(project.id);
  const experimentCandidateOrder = useExperimentCandidateOrder(project.id);
  const collapsedWorktrees = useSidebarUiStore((s) => s.collapsedWorktrees);
  const editingThreadId = useSidebarUiStore((s) => s.editingThreadId);
  const setEditingThreadId = useSidebarUiStore((s) => s.setEditingThreadId);
  const revealMoreThreads = useSidebarUiStore((s) => s.revealMoreThreads);
  const visibleLimit = useThreadListLimit(project.id);
  const hasDraft = useHasDraft(project.id);
  const currentThreadCount = useCurrentThreadIdsCount();
  const isDraftActive = useIsCurrentProjectDraft(project.id);
  const source = useDragSource();
  const liveBackgroundThreadIds = useLiveBackgroundThreadIds(projectThreads);
  const rows = buildSidebarProjectRows({
    projectId: project.id,
    projectThreads,
    sortMode,
    collapsedWorktrees,
    visibleLimit,
    liveBackgroundThreadIds,
    ...(experimentCandidateOrder.size > 0 ? { experimentCandidateOrder } : {}),
  });

  return (
    <div className="space-y-0.5">
      <NewThreadButton
        projectId={project.id}
        hasDraft={hasDraft}
        isActive={isDraftActive}
        isDraggingAnything={!!source}
        canOpenAsPanel={currentThreadCount > 0 && currentThreadCount < 3}
        onPress={() => openNewThread(project.id)}
        onOpenAsPanel={() => openNewThreadSideBySide(project.id)}
      />

      <div>
        {rows.map((row) =>
          row.kind === "see-more" ? (
            <SeeMoreThreadsButton key={row.key} onPress={() => revealMoreThreads(project.id)} />
          ) : (
            <SidebarThreadRow
              key={row.key}
              row={row}
              project={project}
              editingThreadId={editingThreadId}
              setEditingThreadId={setEditingThreadId}
            />
          ),
        )}
      </div>
    </div>
  );
}
