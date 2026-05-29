import { useVirtualizer } from "@tanstack/react-virtual";
import type { Project } from "@/shared/contracts";
import {
  useCurrentThreadIdsCount,
  useHasDraft,
  useIsCurrentProjectDraft,
  useProjectThreads,
} from "@/renderer/hooks/uiSelectors";
import { useScrollFade } from "@/renderer/hooks/useScrollFade";
import { useDragSource } from "@/renderer/dnd";
import { openNewThread, openNewThreadSideBySide } from "@/renderer/actions/threadActions";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { NewThreadButton } from "./NewThreadButton";
import { resolveProjectThreadListMaxHeight } from "./sidebarGrowLayout";
import {
  buildSidebarProjectRows,
  estimateSidebarRowSize,
  type SidebarVirtualRow,
} from "./sidebarProjectRows";
import type { ThreadSortMode } from "./sortMode";
import { SidebarThreadGroup } from "./SidebarThreadGroup";
import { SidebarWorktreeGroup } from "./SidebarWorktreeGroup";
import { SortableThreadItem } from "./SortableThreadItem/SortableThreadItem";

const VIRTUAL_OVERSCAN = 12;

export function SidebarProjectThreadList(props: {
  project: Project;
  sortMode: ThreadSortMode;
  growableProjectId: string | null;
}) {
  const { project, sortMode, growableProjectId } = props;
  const { setScrollContainer, scrollRef, scrollFadeStyle } = useScrollFade<HTMLDivElement>({
    maxFadePx: 10,
  });
  const projectThreads = useProjectThreads(project.id);
  const collapsedWorktrees = useSidebarUiStore((s) => s.collapsedWorktrees);
  const editingThreadId = useSidebarUiStore((s) => s.editingThreadId);
  const setEditingThreadId = useSidebarUiStore((s) => s.setEditingThreadId);
  const hasDraft = useHasDraft(project.id);
  const currentThreadCount = useCurrentThreadIdsCount();
  const isDraftActive = useIsCurrentProjectDraft(project.id);
  const source = useDragSource();

  const rows = buildSidebarProjectRows({
    projectId: project.id,
    projectThreads,
    sortMode,
    collapsedWorktrees,
  });
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateSidebarRowSize(rows[index]),
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: VIRTUAL_OVERSCAN,
    useFlushSync: false,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const firstVisibleStart = virtualItems[0]?.start ?? 0;
  const maxHeight = resolveProjectThreadListMaxHeight({
    growableProjectId,
    projectId: project.id,
    itemContentHeightPx: totalSize,
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

      <div
        ref={setScrollContainer}
        className="overflow-y-auto"
        style={{
          ...scrollFadeStyle,
          ...(maxHeight ? { maxHeight } : {}),
        }}
      >
        <div className="relative w-full" style={{ height: totalSize }}>
          <div
            className="absolute top-0 left-0 w-full"
            style={{ transform: `translateY(${firstVisibleStart}px)` }}
          >
            {virtualItems.map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;
              return (
                <SidebarVirtualThreadRow
                  key={virtualRow.key}
                  row={row}
                  index={virtualRow.index}
                  project={project}
                  editingThreadId={editingThreadId}
                  setEditingThreadId={setEditingThreadId}
                  measureElement={virtualizer.measureElement}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarVirtualThreadRow(props: {
  row: SidebarVirtualRow;
  index: number;
  project: Project;
  editingThreadId: string | null;
  setEditingThreadId: (id: string | null) => void;
  measureElement: (element: Element | null) => void;
}) {
  const { row, project, editingThreadId, setEditingThreadId } = props;

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
        virtualIndex={props.index}
        measureElement={props.measureElement}
      />
    );
  }

  return (
    <div ref={props.measureElement} data-index={props.index} className="w-full pb-0.5">
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
          {row.label}
        </div>
      ) : (
        <div aria-hidden className="mx-1.5 my-1 h-px bg-white/6" />
      )}
    </div>
  );
}
