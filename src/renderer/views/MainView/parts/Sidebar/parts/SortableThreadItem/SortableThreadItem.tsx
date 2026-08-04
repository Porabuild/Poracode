import type { Project, Thread } from "@/shared/contracts";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { useSortable } from "@dnd-kit/react/sortable";
import { useIsDraggingThread, type DragSourceData } from "@/renderer/dnd";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { getStatusTone } from "@/renderer/components/providers/statusTone";
import { ThreadProviderIcon } from "@/renderer/components/providers/ThreadProviderIcon";
import { ThreadContextMenu } from "@/renderer/views/MainView/parts/Sidebar/parts/ThreadContextMenu";
import { DraftIndicator } from "../DraftIndicator";
import { InlineRenameInput } from "../InlineRenameInput";
import { ThreadItemSuffix } from "./parts/ThreadItemSuffix";
import {
  useIsCurrentThread,
  useThreadHasBackgroundActivity,
  useThreadHasDraft,
} from "@/renderer/hooks/uiSelectors";
import { openThread, renameThread } from "@/renderer/actions/threadActions";

export function SortableThreadItem(props: {
  thread: Thread;
  threadIndex: number;
  project: Project;
  showWorktreeBadge: boolean;
  showWorktreeFilesButton?: boolean;
  editingThreadId: string | null;
  setEditingThreadId: (id: string | null) => void;
  group: string;
  sortDisabled?: boolean;
}) {
  const {
    thread,
    project,
    showWorktreeBadge,
    showWorktreeFilesButton = false,
    editingThreadId,
    sortDisabled = false,
  } = props;
  const isExperimentCandidate = useExperimentStore(
    (state) => thread.groupId !== undefined && state.experiments[thread.groupId] !== undefined,
  );
  const isCurrentThread = useIsCurrentThread(thread.id);
  const hasDraft = useThreadHasDraft(thread.id);

  const { ref } = useSortable({
    id: `thread:${thread.id}`,
    index: props.threadIndex,
    type: "thread",
    accept: sortDisabled || isExperimentCandidate ? [] : ["thread", "worktree-group"],
    group: props.group,
    // Automatic sort modes only disable reordering within the sidebar. Keep
    // ordinary threads draggable so they can still be dropped onto a pane.
    disabled: isExperimentCandidate,
    data: {
      type: "thread",
      threadId: thread.id,
      projectId: thread.projectId,
      ...(thread.worktreePath != null ? { worktreePath: thread.worktreePath } : {}),
      sortGroup: props.group,
      sortIndex: props.threadIndex,
    } satisfies DragSourceData,
  });

  const isDragging = useIsDraggingThread(thread.id);

  const hasBackgroundActivity = useThreadHasBackgroundActivity(thread.id);
  const statusTone = getStatusTone(thread, { hasBackgroundActivity });

  return (
    <div ref={ref} className="relative w-full pb-0.5">
      <ThreadContextMenu
        thread={thread}
        project={project}
        onRename={() => props.setEditingThreadId(thread.id)}
      >
        <SidebarButton
          size="xs"
          statusTone={statusTone}
          icon={
            <ThreadProviderIcon thread={thread} tone={statusTone} className="size-3.5 shrink-0" />
          }
          label={
            editingThreadId === thread.id ? (
              <InlineRenameInput
                initialValue={thread.title}
                onCommit={(newTitle) => {
                  renameThread(thread.id, newTitle);
                  props.setEditingThreadId(null);
                }}
                onCancel={() => props.setEditingThreadId(null)}
              />
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="min-w-0 truncate">
                  {thread.done ? (
                    <span className="opacity-50 line-through">{thread.title}</span>
                  ) : (
                    thread.title
                  )}
                </span>
                {hasDraft && <DraftIndicator />}
              </span>
            )
          }
          tooltip={editingThreadId === thread.id ? undefined : thread.title}
          isActive={isCurrentThread}
          onPress={() => openThread(thread.id)}
          onDoubleClick={() => props.setEditingThreadId(thread.id)}
          isDragging={isDragging}
          suffix={
            <ThreadItemSuffix
              thread={thread}
              showWorktreeBadge={showWorktreeBadge}
              showWorktreeFilesButton={showWorktreeFilesButton}
              isExperimentCandidate={isExperimentCandidate}
            />
          }
        />
      </ThreadContextMenu>
    </div>
  );
}
