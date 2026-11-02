import { useAuxiliaryThreadWindows } from "@/renderer/state/auxiliaryThreadWindows";
import type { Project } from "@/shared/contracts";
import {
  useCurrentThreadIds,
  useCurrentThreadIdsCount,
  useHasDraft,
  useIsCurrentProjectDraft,
  useLiveBackgroundThreadIds,
  useProjectThreads,
} from "@/renderer/hooks/uiSelectors";
import { useDragSource } from "@/renderer/dnd";
import { openNewThread, openNewThreadSideBySide } from "@/renderer/actions/threadActions";
import { useSidebarUiStore, useThreadListLimit } from "@/renderer/state/sidebarUiStore";
import { useWorkspaceThreadFilter } from "@/renderer/state/workspaceSelectors";
import { useExperimentCandidateOrder } from "@/renderer/state/experimentStore";
import { NewThreadButton } from "./NewThreadButton";
import { buildSidebarProjectRows } from "./sidebarProjectRows";
import type { ThreadSortMode } from "./sortMode";
import { SeeMoreThreadsButton, SidebarThreadRow } from "./SidebarThreadRow";
import { SidebarDoneRows } from "./SidebarDoneRows";

export function SidebarProjectThreadList(props: { project: Project; sortMode: ThreadSortMode }) {
  const { project, sortMode } = props;
  const isThreadVisible = useWorkspaceThreadFilter();
  const auxiliaryIds = useAuxiliaryThreadWindows((s) => s.hiddenThreadIds);
  // No-op for real projects; hides Home threads filed under other workspaces.
  const projectThreads = useProjectThreads(project.id).filter(
    (thread) => !auxiliaryIds.has(thread.id) && isThreadVisible(thread),
  );
  const experimentCandidateOrder = useExperimentCandidateOrder(project.id);
  const collapsedWorktrees = useSidebarUiStore((s) => s.collapsedWorktrees);
  const editingThreadId = useSidebarUiStore((s) => s.editingThreadId);
  const setEditingThreadId = useSidebarUiStore((s) => s.setEditingThreadId);
  const revealMoreThreads = useSidebarUiStore((s) => s.revealMoreThreads);
  const visibleLimit = useThreadListLimit(project.id);
  const hasDraft = useHasDraft(project.id);
  const currentThreadIds = useCurrentThreadIds();
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
    openThreadIds: new Set(currentThreadIds),
    ...(experimentCandidateOrder.size > 0 ? { experimentCandidateOrder } : {}),
  });
  const doneStart = rows.findIndex((row) => row.kind === "section-label");
  const renderRow = (row: (typeof rows)[number]) =>
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
    );

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
        {(doneStart === -1 ? rows : rows.slice(0, doneStart + 1)).map(renderRow)}
        {doneStart !== -1 ? (
          <SidebarDoneRows rows={rows.slice(doneStart + 1)} renderRow={renderRow} />
        ) : null}
      </div>
    </div>
  );
}
