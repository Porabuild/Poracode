import {
  Archive,
  ArrowDownToLine,
  ArrowRightLeft,
  CircleCheck,
  Columns2,
  FlaskConical,
  GitFork,
  Pencil,
  Play,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { Project, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useSortable } from "@dnd-kit/react/sortable";
import { useIsDraggingThread, type DragSourceData } from "@/renderer/dnd";
import { ContextMenu } from "@/renderer/components/common/ContextMenu";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { getStatusTone } from "@/renderer/components/providers/statusTone";
import { ThreadProviderIcon } from "@/renderer/components/providers/ThreadProviderIcon";
import { readBridge } from "@/renderer/bridge";
import { resolveActionIcon } from "@/renderer/utils/actionIcons";
import { useWorktreeGitItems } from "@/renderer/views/MainView/parts/Sidebar/parts/useWorktreeActions";
import { gitMenuIcons } from "@/renderer/views/MainView/parts/Sidebar/parts/gitMenuIcons";
import { DraftIndicator } from "../DraftIndicator";
import { InlineRenameInput } from "../InlineRenameInput";
import {
  ThreadItemBottomSuffix,
  ThreadItemSuffix,
  ThreadItemTopSuffix,
} from "./parts/ThreadItemSuffix";
import {
  useCurrentThreadIdsCount,
  useIsCurrentThread,
  useProjectAgentStatuses,
  useThreadHasBackgroundActivity,
  useThreadHasDraft,
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
  const { t } = useLingui();
  const experiment = useExperimentStore((state) =>
    thread.groupId ? state.experiments[thread.groupId] : undefined,
  );
  const isExperimentCandidate = experiment !== undefined;
  const isCurrentThread = useIsCurrentThread(thread.id);
  const hasDraft = useThreadHasDraft(thread.id);
  const currentThreadCount = useCurrentThreadIdsCount();
  const projectAgents = useProjectAgentStatuses(project.location);
  const worktreeGitItems = useWorktreeGitItems(
    thread.projectId,
    thread.worktreePath ?? "",
    gitMenuIcons,
  );
  const unloadDisabledReason =
    thread.status === "inactive"
      ? t`Thread is already unloaded.`
      : thread.status === "launching"
        ? t`Wait for the thread to finish starting.`
        : undefined;

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

  const stacked = projectTag != null;
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
  };

  return (
    <div ref={ref} className="relative w-full pb-0.5">
      <ContextMenu
        items={[
          ...(thread.worktreePath && !isExperimentCandidate
            ? [
                {
                  id: "new-thread-in-worktree",
                  label: t`New Thread in Worktree`,
                  icon: <Plus className="size-3.5" />,
                },
                {
                  type: "submenu" as const,
                  id: "git",
                  label: t`Git`,
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
                  label: t`Run`,
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
            label: t`Rename`,
            icon: <Pencil className="size-3.5" />,
          },
          ...(experiment
            ? [
                {
                  id: "open-experiment",
                  label: t`Open experiment board`,
                  icon: <FlaskConical className="size-3.5" />,
                },
              ]
            : []),
          {
            id: "unload",
            label: t`Unload Thread`,
            icon: <ArrowDownToLine className="size-3.5" />,
            isDisabled: unloadDisabledReason !== undefined,
            ...(unloadDisabledReason ? { disabledReason: unloadDisabledReason } : {}),
          },
          ...(!isExperimentCandidate
            ? [
                {
                  id: "mark-done",
                  label: thread.done ? t`Unmark Done` : t`Mark Done`,
                  icon: <CircleCheck className="size-3.5" />,
                },
              ]
            : []),
          {
            id: "toggle-star",
            label: thread.starred ? t`Unpin` : t`Pin to top`,
            icon: <Star className="size-3.5" />,
          },
          ...(!isExperimentCandidate
            ? [
                {
                  id: "continue-in",
                  label: t`Continue in...`,
                  icon: <ArrowRightLeft className="size-3.5" />,
                  isDisabled:
                    !thread.sessionRef ||
                    projectAgents.filter((a) => a.kind !== thread.agentKind).length === 0,
                  ...(!thread.sessionRef ||
                  projectAgents.filter((a) => a.kind !== thread.agentKind).length === 0
                    ? {
                        disabledReason: !thread.sessionRef
                          ? t`No active session`
                          : t`No other agents installed`,
                      }
                    : {}),
                },
              ]
            : []),
          ...(thread.groupId && !isExperimentCandidate
            ? [
                {
                  id: "ungroup",
                  label: t`Remove from group`,
                },
              ]
            : []),
          ...(currentThreadCount >= 2 && isCurrentThread && !thread.groupId
            ? [
                {
                  id: "group-open-threads",
                  label: t`Group open threads`,
                  icon: <Columns2 className="size-3.5" />,
                },
              ]
            : []),
          ...(!isExperimentCandidate
            ? [
                { type: "separator" as const },
                {
                  id: "archive",
                  label: t`Archive Thread`,
                  icon: <Archive className="size-3.5" />,
                  variant: "warning" as const,
                },
                {
                  id: "delete",
                  label: t`Delete Thread`,
                  icon: <Trash2 className="size-3.5" />,
                  variant: "danger" as const,
                },
              ]
            : []),
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
          if (key === "git-review") openGitReview(thread.projectId, thread.worktreePath, thread.id);
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
          if (key === "create-pr") openGitReview(thread.projectId, thread.worktreePath, thread.id);
          if (key === "open-experiment" && experiment)
            useAppStore.getState().openExperiment(experiment.id, experiment.projectId);
          if (key === "continue-in" && !isExperimentCandidate) continueInProvider(thread.id);
          if (key === "group-open-threads") {
            const state = useAppStore.getState();
            if (state.view.kind !== "thread") return;
            const openThreads = state.threads.filter(
              (other) => state.view.kind === "thread" && state.view.panes.includes(other.id),
            );
            const projectId = openThreads[0]?.projectId;
            if (!projectId || !openThreads.every((other) => other.projectId === projectId)) return;
            const groupId = crypto.randomUUID();
            const groupName = thread.title;
            useAppStore.setState((s) => ({
              threads: s.threads.map((other) =>
                s.view.kind === "thread" && s.view.panes.includes(other.id)
                  ? { ...other, groupId, groupName }
                  : other,
              ),
              view: s.view.kind === "thread" ? { ...s.view, activeGroupId: groupId } : s.view,
            }));
          }
          if (key === "ungroup") {
            useAppStore.setState((state) => {
              let updatedThreads = state.threads.map((other) =>
                other.id === thread.id
                  ? { ...other, groupId: undefined, groupName: undefined }
                  : other,
              );
              const remaining = updatedThreads.filter((other) => other.groupId === thread.groupId);
              if (remaining.length === 1) {
                updatedThreads = updatedThreads.map((other) =>
                  other.id === remaining[0]!.id
                    ? { ...other, groupId: undefined, groupName: undefined }
                    : other,
                );
              }
              const view =
                state.view.kind === "thread" && state.view.activeGroupId === thread.groupId
                  ? { kind: "thread" as const, panes: [state.view.panes[0]] as [string] }
                  : state.view;
              return { threads: updatedThreads, view };
            });
          }
          if (key === "archive" && !isExperimentCandidate) archiveThread(thread.id);
          if (key === "rename") props.setEditingThreadId(thread.id);
          if (key === "unload") unloadThread(thread.id);
          if (key === "mark-done") toggleMarkThreadDone(thread.id);
          if (key === "toggle-star") toggleStarThread(thread.id);
          if (key === "delete" && !isExperimentCandidate)
            deleteThread(thread.id, thread.worktreePath, thread.projectId);
          if (key.startsWith("action:")) {
            runProjectAction(project.id, key.slice("action:".length), thread.worktreePath);
          }
        }}
      >
        <SidebarButton
          size="xs"
          density={stacked ? "compact" : "default"}
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
            ) : stacked ? (
              // Two-line flat-list row: each line owns its right-side cluster,
              // so the bottom badges never reserve width from the title line.
              // Line heights match the text (16px title, 14px meta).
              // pr-0.5 keeps the badges' hover background clear of the label's
              // overflow clip — SidebarButton wraps the label in a `truncate`
              // span, so anything flush with its right edge gets cut.
              <span className="flex flex-col gap-0.5 pr-0.5">
                <span className="flex h-[18px] items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate">{titleNode}</span>
                  {hasDraft && <DraftIndicator />}
                  {/* No padding here: the time slot carries the 2px inset that
                      matches the git badge's own p-0.5, so both rows' icon
                      columns share the same offset from the row's right edge. */}
                  <span className="flex shrink-0 items-center gap-[3px]">
                    <ThreadItemTopSuffix {...suffixProps} />
                  </span>
                </span>
                <span className="flex h-[18px] items-center gap-1.5">
                  {projectTag}
                  <span className="flex shrink-0 items-center gap-[3px]">
                    <ThreadItemBottomSuffix {...suffixProps} />
                  </span>
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="min-w-0 truncate">{titleNode}</span>
                {hasDraft && <DraftIndicator />}
              </span>
            )
          }
          tooltip={
            editingThreadId === thread.id
              ? undefined
              : stacked
                ? `${thread.title} — ${project.name}`
                : thread.title
          }
          isActive={isCurrentThread}
          onPress={() => openThread(thread.id)}
          onDoubleClick={() => props.setEditingThreadId(thread.id)}
          isDragging={isDragging}
          {...(stacked ? {} : { suffix: <ThreadItemSuffix {...suffixProps} /> })}
        />
      </ContextMenu>
    </div>
  );
}
