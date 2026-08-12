import type { Project, Thread } from "@/shared/contracts";
import { Star } from "lucide-react";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { useSortable } from "@dnd-kit/react/sortable";
import { useIsDraggingThread, type DragSourceData } from "@/renderer/dnd";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { getStatusTone } from "@/renderer/components/providers/statusTone";
import { ThreadProviderIcon } from "@/renderer/components/providers/ThreadProviderIcon";
import { ThreadContextMenu } from "@/renderer/views/MainView/parts/Sidebar/parts/ThreadContextMenu";
import { DraftIndicator } from "../DraftIndicator";
import { InlineRenameInput } from "../InlineRenameInput";
import {
  ThreadItemBottomSuffix,
  ThreadItemSuffix,
  ThreadItemTopSuffix,
} from "./parts/ThreadItemSuffix";
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
  /** Trailing project label for cross-project (flat) lists. */
  projectTag?: React.ReactNode;
}) {
  const {
    thread,
    project,
    showWorktreeBadge,
    showWorktreeFilesButton = false,
    editingThreadId,
    sortDisabled = false,
    projectTag,
  } = props;
  const isExperimentCandidate = useExperimentStore(
    (state) => thread.groupId !== undefined && state.experiments[thread.groupId] !== undefined,
  );
  const isCurrentThread = useIsCurrentThread(thread.id);
  const hasDraft = useThreadHasDraft(thread.id);
  const compactLayout = useCompactLayout();

  const { ref } = useSortable({
    id: `thread:${thread.id}`,
    index: props.threadIndex,
    type: "thread",
    accept:
      compactLayout || sortDisabled || isExperimentCandidate ? [] : ["thread", "worktree-group"],
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

  const stacked = projectTag != null;
  const isEditing = editingThreadId === thread.id;
  const titleNode = thread.done ? (
    <span className="opacity-50 line-through">{thread.title}</span>
  ) : (
    thread.title
  );
  const suffixProps = {
    thread,
    showWorktreeBadge,
    showWorktreeFilesButton,
    isExperimentCandidate,
    // Stacked rows are flat cross-project list rows: no project header carries
    // the main branch's git state, so a main-branch thread shows it inline.
    showProjectBadge: stacked,
    projectName: project.name,
  };
  const titleContent = isEditing ? (
    <InlineRenameInput
      initialValue={thread.title}
      onCommit={(newTitle) => {
        renameThread(thread.id, newTitle);
        props.setEditingThreadId(null);
      }}
      onCancel={() => props.setEditingThreadId(null)}
    />
  ) : (
    titleNode
  );

  return (
    <div ref={ref} className="relative w-full pb-0.5">
      <ThreadContextMenu
        thread={thread}
        project={project}
        onRename={() => props.setEditingThreadId(thread.id)}
        showProjectActions={stacked}
      >
        <SidebarButton
          className="poracode-sidebar-thread-row"
          size="xs"
          density={stacked ? "compact" : "default"}
          statusTone={statusTone}
          icon={
            <ThreadProviderIcon thread={thread} tone={statusTone} className="size-3.5 shrink-0" />
          }
          label={
            stacked ? (
              // Two-line flat-list row: each line owns its right-side cluster,
              // so the bottom badges never reserve width from the title line.
              // Line heights match the text (16px title, 14px meta).
              // pr-0.5 keeps the badges' hover background clear of the label's
              // overflow clip — SidebarButton wraps the label in a `truncate`
              // span, so anything flush with its right edge gets cut.
              <span className="flex flex-col gap-0.5 pr-0.5">
                <span className="flex h-[18px] items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate">{titleContent}</span>
                  {hasDraft && <DraftIndicator />}
                  {/* No padding here: the time slot carries the 2px inset that
                      matches the git badge's own p-0.5, so both rows' icon
                      columns share the same offset from the row's right edge. */}
                  <span className="flex shrink-0 items-center gap-1 text-muted">
                    {compactLayout && thread.starred ? (
                      <Star className="size-3 fill-current" aria-hidden />
                    ) : null}
                    {compactLayout ? (
                      <RelativeTime
                        iso={thread.updatedAt}
                        className="block font-mono text-[10px] leading-none tabular-nums"
                      />
                    ) : (
                      <ThreadItemTopSuffix {...suffixProps} />
                    )}
                  </span>
                </span>
                <span className="flex h-[18px] items-center gap-1.5">
                  {projectTag}
                  {compactLayout ? null : (
                    <span className="flex shrink-0 items-center gap-[3px]">
                      <ThreadItemBottomSuffix {...suffixProps} />
                    </span>
                  )}
                </span>
              </span>
            ) : isEditing ? (
              titleContent
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="min-w-0 truncate">{titleNode}</span>
                {hasDraft && <DraftIndicator />}
              </span>
            )
          }
          tooltip={
            isEditing ? undefined : stacked ? `${thread.title} — ${project.name}` : thread.title
          }
          isActive={isCurrentThread}
          onPress={() => openThread(thread.id)}
          onDoubleClick={() => props.setEditingThreadId(thread.id)}
          isDragging={isDragging}
          {...(stacked || compactLayout ? {} : { suffix: <ThreadItemSuffix {...suffixProps} /> })}
        />
      </ThreadContextMenu>
    </div>
  );
}
