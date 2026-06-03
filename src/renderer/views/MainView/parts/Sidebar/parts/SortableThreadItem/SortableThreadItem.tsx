import {
  Archive,
  ArrowDownToLine,
  ArrowRightLeft,
  CircleCheck,
  Columns2,
  GitFork,
  Pencil,
  Play,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import type { Project, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useSortable } from "@dnd-kit/react/sortable";
import { useIsDraggingThread, type DragSourceData } from "@/renderer/dnd";
import { ContextMenu, SidebarButton } from "@/renderer/components/common";
import { ThreadProviderIcon, getStatusTone } from "@/renderer/components/providers";
import { readBridge } from "@/renderer/bridge";
import { resolveActionIcon } from "@/renderer/utils/actionIcons";
import { useWorktreeGitItems } from "@/renderer/views/MainView/parts/Sidebar/parts/useWorktreeActions";
import { gitMenuIcons } from "@/renderer/views/MainView/parts/Sidebar/parts/gitMenuIcons";
import { InlineRenameInput } from "../InlineRenameInput";
import { ThreadItemSuffix } from "./parts/ThreadItemSuffix";
import {
  useCurrentThreadIdsCount,
  useIsCurrentThread,
  useProjectAgentStatuses,
} from "@/renderer/hooks/uiSelectors";
import { openGitReview } from "@/renderer/actions/panelActions";
import {
  gitPull,
  gitPush,
  gitSync,
  gitPullFromSource,
  gitMergeToSource,
  gitMergeAndRemove,
} from "@/renderer/actions/gitActions";
import {
  openThread,
  archiveThread,
  unloadThread,
  toggleMarkThreadDone,
  toggleStarThread,
  deleteThread,
  renameThread,
  continueInProvider,
  openNewThreadInWorktree,
} from "@/renderer/actions/threadActions";
import { runProjectAction } from "@/renderer/actions/terminalActions";
import { resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";

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
  const isCurrentThread = useIsCurrentThread(thread.id);
  const currentThreadCount = useCurrentThreadIdsCount();
  const projectAgents = useProjectAgentStatuses(project.location);
  const worktreeGitItems = useWorktreeGitItems(
    thread.projectId,
    thread.worktreePath ?? "",
    gitMenuIcons,
  );
  const unloadDisabledReason =
    thread.status === "inactive"
      ? "Thread is already unloaded."
      : thread.status === "launching"
        ? "Wait for the thread to finish starting."
        : undefined;

  const { ref } = useSortable({
    id: `thread:${thread.id}`,
    index: props.threadIndex,
    type: "thread",
    accept: sortDisabled ? [] : ["thread", "worktree-group"],
    group: props.group,
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

  const statusTone = getStatusTone(thread);

  return (
    <div ref={ref} className="relative w-full pb-0.5">
      <ContextMenu
        items={[
          ...(thread.worktreePath
            ? [
                {
                  id: "new-thread-in-worktree",
                  label: "New Thread in Worktree",
                  icon: <Plus className="size-3.5" />,
                },
                {
                  type: "submenu" as const,
                  id: "git",
                  label: "Git",
                  icon: <GitFork className="size-3.5" />,
                  items: worktreeGitItems,
                },
              ]
            : []),
          ...(thread.worktreePath && project.scripts?.actions?.length
            ? [
                {
                  type: "submenu" as const,
                  id: "run-action",
                  label: "Run",
                  icon: <Play className="size-3.5" />,
                  items: project.scripts.actions.map((action) => ({
                    id: `action:${action.id}`,
                    label: action.name,
                    icon: resolveActionIcon(action.icon),
                  })),
                },
              ]
            : []),
          {
            id: "rename",
            label: "Rename",
            icon: <Pencil className="size-3.5" />,
          },
          {
            id: "unload",
            label: "Unload Thread",
            icon: <ArrowDownToLine className="size-3.5" />,
            isDisabled: unloadDisabledReason !== undefined,
            ...(unloadDisabledReason ? { disabledReason: unloadDisabledReason } : {}),
          },
          {
            id: "mark-done",
            label: thread.done ? "Unmark Done" : "Mark Done",
            icon: <CircleCheck className="size-3.5" />,
          },
          {
            id: "toggle-star",
            label: thread.starred ? "Unpin" : "Pin to top",
            icon: <Star className="size-3.5" />,
          },
          {
            id: "continue-in",
            label: "Continue in...",
            icon: <ArrowRightLeft className="size-3.5" />,
            isDisabled:
              !thread.sessionRef ||
              projectAgents.filter((a) => a.kind !== thread.agentKind).length === 0,
            ...(!thread.sessionRef ||
            projectAgents.filter((a) => a.kind !== thread.agentKind).length === 0
              ? {
                  disabledReason: !thread.sessionRef
                    ? "No active session"
                    : "No other agents installed",
                }
              : {}),
          },
          ...(thread.groupId
            ? [
                {
                  id: "ungroup",
                  label: "Remove from group",
                },
              ]
            : []),
          ...(currentThreadCount >= 2 && isCurrentThread && !thread.groupId
            ? [
                {
                  id: "group-open-threads",
                  label: "Group open threads",
                  icon: <Columns2 className="size-3.5" />,
                },
              ]
            : []),
          { type: "separator" as const },
          {
            id: "archive",
            label: "Archive Thread",
            icon: <Archive className="size-3.5" />,
            variant: "warning",
          },
          {
            id: "delete",
            label: "Delete Thread",
            icon: <Trash2 className="size-3.5" />,
            variant: "danger",
          },
        ]}
        onAction={(key) => {
          if (key === "new-thread-in-worktree" && thread.worktreePath)
            openNewThreadInWorktree({
              projectId: thread.projectId,
              worktreePath: thread.worktreePath,
              worktreeBranch:
                resolveWorktreeBranch(
                  thread.projectId,
                  thread.worktreePath,
                  thread.worktreeBranch,
                ) ?? thread.worktreePath,
            });
          if (key === "git-review") openGitReview(thread.projectId, thread.worktreePath);
          if (key === "git-sync" && thread.worktreePath)
            gitSync(thread.projectId, thread.worktreePath);
          if (key === "git-push" && thread.worktreePath)
            gitPush(thread.projectId, thread.worktreePath);
          if (key === "git-pull" && thread.worktreePath)
            gitPull(thread.projectId, thread.worktreePath);
          if (key === "git-pull-from-source" && thread.worktreePath)
            gitPullFromSource(thread.projectId, thread.worktreePath);
          if (key === "git-merge-to-source" && thread.worktreePath)
            gitMergeToSource(thread.projectId, thread.worktreePath);
          if (key === "git-merge-and-remove" && thread.worktreePath)
            gitMergeAndRemove(thread.projectId, thread.worktreePath);
          if (key === "open-pr" && thread.worktreePath) {
            const pr = useGitStore.getState().prData[thread.worktreePath];
            if (pr?.url) void readBridge().openExternal(pr.url);
          }
          if (key === "create-pr") openGitReview(thread.projectId, thread.worktreePath);
          if (key === "continue-in") continueInProvider(thread.id);
          if (key === "group-open-threads") {
            const state = useAppStore.getState();
            if (state.view.kind !== "thread") return;
            const openThreads = state.threads.filter(
              (t) => state.view.kind === "thread" && state.view.panes.includes(t.id),
            );
            const projectId = openThreads[0]?.projectId;
            if (!projectId || !openThreads.every((t) => t.projectId === projectId)) return;
            const groupId = crypto.randomUUID();
            const groupName = thread.title;
            useAppStore.setState((s) => ({
              threads: s.threads.map((t) =>
                s.view.kind === "thread" && s.view.panes.includes(t.id)
                  ? { ...t, groupId, groupName }
                  : t,
              ),
              view: s.view.kind === "thread" ? { ...s.view, activeGroupId: groupId } : s.view,
            }));
          }
          if (key === "ungroup") {
            useAppStore.setState((state) => {
              let updatedThreads = state.threads.map((t) =>
                t.id === thread.id ? { ...t, groupId: undefined, groupName: undefined } : t,
              );
              const remaining = updatedThreads.filter((t) => t.groupId === thread.groupId);
              if (remaining.length === 1) {
                updatedThreads = updatedThreads.map((t) =>
                  t.id === remaining[0]!.id
                    ? { ...t, groupId: undefined, groupName: undefined }
                    : t,
                );
              }
              const view =
                state.view.kind === "thread" && state.view.activeGroupId === thread.groupId
                  ? { kind: "thread" as const, panes: [state.view.panes[0]] as [string] }
                  : state.view;
              return { threads: updatedThreads, view };
            });
          }
          if (key === "archive") archiveThread(thread.id);
          if (key === "rename") props.setEditingThreadId(thread.id);
          if (key === "unload") unloadThread(thread.id);
          if (key === "mark-done") toggleMarkThreadDone(thread.id);
          if (key === "toggle-star") toggleStarThread(thread.id);
          if (key === "delete") deleteThread(thread.id, thread.worktreePath, thread.projectId);
          if (key.startsWith("action:")) {
            runProjectAction(project.id, key.slice("action:".length), thread.worktreePath);
          }
        }}
      >
        <SidebarButton
          size="xs"
          statusTone={statusTone}
          icon={<ThreadProviderIcon thread={thread} className="size-3.5 shrink-0" />}
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
            ) : thread.done ? (
              <span className="opacity-50 line-through">{thread.title}</span>
            ) : (
              thread.title
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
            />
          }
        />
      </ContextMenu>
    </div>
  );
}
