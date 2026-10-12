import { CircleCheck, GitFork, Loader2, Play, Plus, Square, Trash2 } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { useSortable } from "@dnd-kit/react/sortable";
import type { Project } from "@/shared/contracts";
import type { ContextMenuItem } from "@/renderer/components/common/ContextMenu";
import { ResponsiveContextMenu } from "@/renderer/components/common/ResponsiveContextMenu";
import { useDragSource, useIsDraggingWorktreeGroup, type DragSourceData } from "@/renderer/dnd";
import {
  useIsWorktreeFilesPanelActive,
  useIsWorktreeGitPanelActive,
  useIsWorktreeTerminalActive,
  useIsWorktreeTerminalBusy,
  useIsWorktreeTerminalOpen,
  useRunningProjectActionIds,
} from "@/renderer/hooks/uiSelectors";
import { getStatusTone } from "@/renderer/components/providers/statusTone";
import {
  gitMergeAndRemove,
  gitMergeToSource,
  gitPull,
  gitPullFromSource,
  gitPush,
  gitSync,
} from "@/renderer/actions/gitActions";
import { openFilesPanel, openGitReview } from "@/renderer/actions/panelActions";
import {
  openWorktreeTerminal,
  runProjectAction,
  stopProjectAction,
} from "@/renderer/actions/terminalActions";
import { deleteWorktreeGroup } from "@/renderer/actions/worktreeActions";
import {
  markThreadDone,
  openNewThreadInWorktree,
  openThread,
} from "@/renderer/actions/threadActions";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useIsWorktreeCollapsed, useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { resolveActionIcon } from "@/renderer/utils/actionIcons";
import { resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { gitMenuIcons } from "./gitMenuIcons";
import type { WorktreeThreadGroup } from "./groupThreads";
import { useWorktreeGitItems } from "./useWorktreeActions";
import { getWorktreeGroupStatusTone, WorktreeGroupHeader } from "./WorktreeGroupHeader";

export function SidebarWorktreeGroup(props: {
  group: WorktreeThreadGroup;
  entryIndex: number;
  project: Project;
  sortableGroup: string;
  sortDisabled?: boolean;
  liveBackgroundThreadIds: ReadonlySet<string>;
  /** Trailing project label for cross-project (flat) lists. */
  projectTag?: React.ReactNode;
}) {
  const { group, project, sortDisabled = false } = props;
  const { t } = useLingui();
  const compactLayout = useCompactLayout();
  const isGroupCollapsed = useIsWorktreeCollapsed(group.worktreePath);
  const toggleWorktreeCollapsed = useSidebarUiStore((s) => s.toggleWorktreeCollapsed);
  const worktreeGitItems = useWorktreeGitItems(project.id, group.worktreePath, gitMenuIcons);
  const hasTerminal = useIsWorktreeTerminalOpen(group.worktreePath);
  const isActiveTerminal = useIsWorktreeTerminalActive(group.worktreePath);
  const isBusyTerminal = useIsWorktreeTerminalBusy(group.worktreePath);
  const isActiveFiles = useIsWorktreeFilesPanelActive(group.worktreePath);
  const isActiveGit = useIsWorktreeGitPanelActive(group.worktreePath);
  const collapsedStatusTone = getWorktreeGroupStatusTone(
    group.threads.map((thread) =>
      getStatusTone(thread, {
        hasBackgroundActivity: props.liveBackgroundThreadIds.has(thread.id),
      }),
    ),
  );
  const runningActionIds = useRunningProjectActionIds(project.id, group.worktreePath);
  const runActionItems: ContextMenuItem[] = [];
  for (const action of project.scripts?.actions ?? []) {
    const isRunning = runningActionIds.includes(action.id);
    runActionItems.push({
      id: `action:${action.id}`,
      label: action.name,
      icon: isRunning ? (
        <Loader2 className="size-3.5 animate-spin text-accent" aria-hidden />
      ) : (
        resolveActionIcon(action.icon)
      ),
      ...(isRunning
        ? {
            endAction: {
              id: `stop-action:${action.id}`,
              label: t`Stop ${action.name}`,
              icon: <Square className="size-3 fill-current" aria-hidden />,
            },
          }
        : {}),
    });
  }
  const groupThreadIds = group.threads.map((thread) => thread.id);
  const activeThreads = group.threads.filter((thread) => !thread.done);
  const isDone = group.threads.every((thread) => thread.done);
  const latestThreadUpdatedAt = group.threads.reduce(
    (latest, thread) => (thread.updatedAt > latest ? thread.updatedAt : latest),
    group.threads[0]!.updatedAt,
  );

  const { ref } = useSortable({
    id: `wt:${group.worktreePath}`,
    index: props.entryIndex,
    type: "worktree-group",
    accept: compactLayout || sortDisabled ? [] : "worktree-group",
    group: props.sortableGroup,
    data: {
      type: "worktree-group",
      worktreePath: group.worktreePath,
      projectId: project.id,
      threadIds: group.threads.map((thread) => thread.id),
    } satisfies DragSourceData,
  });

  const source = useDragSource();
  const isDragging = useIsDraggingWorktreeGroup(group.worktreePath);
  const revealCompactProjectPanel = () => {
    if (!compactLayout) return;
    const app = useAppStore.getState();
    const targetThread =
      group.threads.find((thread) => thread.id === app.focusedPaneId) ?? group.threads[0];
    if (targetThread) openThread(targetThread.id, { focusComposer: false });
  };
  const openWorktreeFiles = () => {
    openFilesPanel(project.id, group.worktreePath);
    revealCompactProjectPanel();
  };
  const openWorktreeGit = () => {
    openGitReview(project.id, group.worktreePath);
    revealCompactProjectPanel();
  };

  return (
    <div ref={ref} className={`relative space-y-0.5 ${isDragging ? "opacity-60" : ""}`}>
      <ResponsiveContextMenu
        label={group.worktreeBranch}
        items={[
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
          {
            id: "mark-all-done",
            label: t`Mark All Done`,
            icon: <CircleCheck className="size-3.5" />,
            isDisabled: activeThreads.length === 0,
          },
          ...(project.scripts?.actions?.length
            ? [
                {
                  type: "submenu" as const,
                  id: "run-action",
                  label: t`Run`,
                  icon: <Play className="size-3.5" />,
                  items: runActionItems,
                },
              ]
            : []),
          {
            id: "delete-worktree",
            label: t`Delete Worktree`,
            icon: <Trash2 className="size-3.5" />,
            variant: "danger" as const,
          },
        ]}
        onAction={(key) => {
          if (key === "new-thread-in-worktree")
            openNewThreadInWorktree({
              projectId: project.id,
              worktreePath: group.worktreePath,
              worktreeBranch:
                resolveWorktreeBranch(project.id, group.worktreePath, group.worktreeBranch) ??
                group.worktreeBranch,
            });
          if (key === "git-review") openWorktreeGit();
          if (key === "github-actions") useAppStore.getState().openGitHubActions(project.id);
          if (key === "delete-worktree")
            deleteWorktreeGroup(project.id, group.worktreePath, groupThreadIds);
          if (key === "mark-all-done") {
            for (const thread of group.threads) {
              markThreadDone(thread.id);
            }
          }
          if (key === "git-sync") gitSync(project.id, group.worktreePath);
          if (key === "git-push") gitPush(project.id, group.worktreePath);
          if (key === "git-pull") gitPull(project.id, group.worktreePath);
          if (key === "git-pull-from-source") gitPullFromSource(project.id, group.worktreePath);
          if (key === "git-merge-to-source") gitMergeToSource(project.id, group.worktreePath);
          if (key === "git-merge-and-remove") gitMergeAndRemove(project.id, group.worktreePath);
          if (key === "open-pr") {
            const pr = useGitStore.getState().prData[group.worktreePath];
            if (pr?.url) void readBridge().openExternal(pr.url);
          }
          if (key === "create-pr") openWorktreeGit();
          if (key.startsWith("action:")) {
            runProjectAction(project.id, key.slice("action:".length), group.worktreePath);
          }
          if (key.startsWith("stop-action:")) {
            stopProjectAction(project.id, key.slice("stop-action:".length), group.worktreePath);
          }
        }}
      >
        <WorktreeGroupHeader
          worktreePath={group.worktreePath}
          worktreeBranch={group.worktreeBranch}
          projectId={project.id}
          isCollapsed={isGroupCollapsed}
          hasTerminal={hasTerminal}
          isActiveTerminal={isActiveTerminal}
          isBusyTerminal={isBusyTerminal}
          isActiveFiles={isActiveFiles}
          isActiveGit={isActiveGit}
          onToggleCollapse={() => toggleWorktreeCollapsed(group.worktreePath)}
          onOpenFiles={openWorktreeFiles}
          onOpenGitReview={openWorktreeGit}
          onOpenTerminal={() => openWorktreeTerminal(project.id, group.worktreePath)}
          onDeleteWorktree={() =>
            deleteWorktreeGroup(project.id, group.worktreePath, groupThreadIds)
          }
          isDragging={isDragging}
          isDraggingAnything={!!source}
          isDone={isDone}
          updatedAt={latestThreadUpdatedAt}
          {...(collapsedStatusTone !== undefined ? { collapsedStatusTone } : {})}
          {...(props.projectTag !== undefined ? { projectTag: props.projectTag } : {})}
        />
      </ResponsiveContextMenu>
    </div>
  );
}
