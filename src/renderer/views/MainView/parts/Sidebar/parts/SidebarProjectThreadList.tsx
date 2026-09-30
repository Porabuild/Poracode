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
import { useWorkspaceThreadFilter } from "@/renderer/state/workspaceSelectors";
import { useExperimentCandidateOrder } from "@/renderer/state/experimentStore";
import { Download } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { importScopeForProject, useImportDialogStore } from "@/renderer/state/importDialogStore";
import { NewThreadButton } from "./NewThreadButton";
import { buildSidebarProjectRows } from "./sidebarProjectRows";
import type { ThreadSortMode } from "./sortMode";
import { SeeMoreThreadsButton, SidebarThreadRow } from "./SidebarThreadRow";

export function SidebarProjectThreadList(props: { project: Project; sortMode: ThreadSortMode }) {
  const { project, sortMode } = props;
  const isThreadVisible = useWorkspaceThreadFilter();
  // No-op for real projects; hides Home threads filed under other workspaces.
  const projectThreads = useProjectThreads(project.id).filter(isThreadVisible);
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
      <div className="group flex items-center gap-0.5">
        <div className="min-w-0 flex-1">
          <NewThreadButton
            projectId={project.id}
            hasDraft={hasDraft}
            isActive={isDraftActive}
            isDraggingAnything={!!source}
            canOpenAsPanel={currentThreadCount > 0 && currentThreadCount < 3}
            onPress={() => openNewThread(project.id)}
            onOpenAsPanel={() => openNewThreadSideBySide(project.id)}
          />
        </div>
        <ImportSessionButton project={project} />
      </div>

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

/**
 * Opens the import dialog scoped to this project: only its folder's sessions
 * are listed, and the imported threads land here.
 */
function ImportSessionButton(props: { project: Project }) {
  const { t } = useLingui();
  const openFor = useImportDialogStore((state) => state.openFor);
  return (
    <SidebarButton
      iconOnly
      size="xs"
      icon={<Download className="size-3.5" />}
      label={t`Import session`}
      onPress={() => openFor(importScopeForProject(props.project))}
    />
  );
}
