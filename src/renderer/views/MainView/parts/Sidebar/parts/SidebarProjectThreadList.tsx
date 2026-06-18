import { useLingui } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import {
  useCurrentThreadIdsCount,
  useHasDraft,
  useIsCurrentProjectDraft,
  useProjectThreads,
} from "@/renderer/hooks/uiSelectors";
import { ChevronDown } from "lucide-react";
import { useDragSource } from "@/renderer/dnd";
import { openNewThread, openNewThreadSideBySide } from "@/renderer/actions/threadActions";
import { useSidebarUiStore, useThreadListLimit } from "@/renderer/state/sidebarUiStore";
import { SidebarButton } from "@/renderer/components/common";
import { NewThreadButton } from "./NewThreadButton";
import { buildSidebarProjectRows, type SidebarRow } from "./sidebarProjectRows";
import type { ThreadSortMode } from "./sortMode";
import { SidebarThreadGroup } from "./SidebarThreadGroup";
import { SidebarWorktreeGroup } from "./SidebarWorktreeGroup";
import { SortableThreadItem } from "./SortableThreadItem/SortableThreadItem";

export function SidebarProjectThreadList(props: { project: Project; sortMode: ThreadSortMode }) {
  const { project, sortMode } = props;
  const projectThreads = useProjectThreads(project.id);
  const collapsedWorktrees = useSidebarUiStore((s) => s.collapsedWorktrees);
  const editingThreadId = useSidebarUiStore((s) => s.editingThreadId);
  const setEditingThreadId = useSidebarUiStore((s) => s.setEditingThreadId);
  const revealMoreThreads = useSidebarUiStore((s) => s.revealMoreThreads);
  const visibleLimit = useThreadListLimit(project.id);
  const hasDraft = useHasDraft(project.id);
  const currentThreadCount = useCurrentThreadIdsCount();
  const isDraftActive = useIsCurrentProjectDraft(project.id);
  const source = useDragSource();

  const rows = buildSidebarProjectRows({
    projectId: project.id,
    projectThreads,
    sortMode,
    collapsedWorktrees,
    visibleLimit,
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

function SeeMoreThreadsButton(props: { onPress: () => void }) {
  const { t } = useLingui();
  return (
    <SidebarButton
      size="xs"
      icon={<ChevronDown className="size-3.5" />}
      label={t`See more`}
      onPress={props.onPress}
    />
  );
}

function SidebarThreadRow(props: {
  row: Exclude<SidebarRow, { kind: "see-more" }>;
  project: Project;
  editingThreadId: string | null;
  setEditingThreadId: (id: string | null) => void;
}) {
  const { row, project, editingThreadId, setEditingThreadId } = props;
  const { t } = useLingui();

  if (row.kind === "thread") {
    return (
      <SortableThreadItem
        thread={row.thread}
        threadIndex={row.threadIndex}
        project={project}
        showWorktreeBadge={row.showWorktreeBadge}
        {...(row.showWorktreeFilesButton !== undefined
          ? { showWorktreeFilesButton: row.showWorktreeFilesButton }
          : {})}
        editingThreadId={editingThreadId}
        setEditingThreadId={setEditingThreadId}
        group={row.group}
        {...(row.sortDisabled !== undefined ? { sortDisabled: row.sortDisabled } : {})}
      />
    );
  }

  return (
    <div className="w-full pb-0.5">
      {row.kind === "worktree-group" ? (
        <SidebarWorktreeGroup
          group={row.group}
          entryIndex={row.entryIndex}
          project={project}
          sortableGroup={row.sortableGroup}
          sortDisabled={row.sortDisabled}
        />
      ) : row.kind === "thread-group" ? (
        <SidebarThreadGroup
          entry={row.entry}
          project={project}
          editingThreadId={editingThreadId}
          setEditingThreadId={setEditingThreadId}
        />
      ) : row.kind === "section-label" ? (
        <div className="px-1.5 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted">
          {t(row.label)}
        </div>
      ) : (
        <div aria-hidden className="mx-1.5 my-1 h-px bg-[var(--hairline)]" />
      )}
    </div>
  );
}
