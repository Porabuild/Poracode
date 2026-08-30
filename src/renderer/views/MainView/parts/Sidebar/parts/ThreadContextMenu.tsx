import {
  Archive,
  ArrowDownToLine,
  ArrowRightLeft,
  CircleCheck,
  Columns2,
  FileDiff,
  FlaskConical,
  GitFork,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Square,
  Star,
  Trash2,
  Workflow,
} from "lucide-react";
import type { ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import type { Project, Thread } from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { ContextMenu, type ContextMenuItem } from "@/renderer/components/common/ContextMenu";
import { readBridge } from "@/renderer/bridge";
import { resolveActionIcon } from "@/renderer/utils/actionIcons";
import { useWorktreeGitItems } from "@/renderer/views/MainView/parts/Sidebar/parts/useWorktreeActions";
import { gitMenuIcons } from "@/renderer/views/MainView/parts/Sidebar/parts/gitMenuIcons";
import {
  useCurrentThreadIdsCount,
  useIsCurrentThread,
  useRunningProjectActionIds,
  useThreadAgentStatuses,
} from "@/renderer/hooks/uiSelectors";
import { openGitReview } from "@/renderer/actions/panelActions";
import { moveThreadToWorktree } from "@/renderer/actions/moveThreadToWorktreeActions";
import {
  gitPull,
  gitPush,
  gitSync,
  gitPullFromSource,
  gitMergeToSource,
  gitMergeAndRemove,
} from "@/renderer/actions/gitActions";
import {
  archiveThread,
  unloadThread,
  toggleMarkThreadDone,
  toggleStarThread,
  requestDeleteThread,
  continueInProvider,
  openNewThreadInWorktree,
} from "@/renderer/actions/threadActions";
import { runProjectAction, stopProjectAction } from "@/renderer/actions/terminalActions";
import { resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";

/**
 * Right-click menu shared by every sidebar surface that shows a thread —
 * the expanded thread rows and the collapsed icon rail. `onRename` is
 * optional because icon-only surfaces have no inline rename affordance.
 */
export function ThreadContextMenu(props: {
  thread: Thread;
  project: Project;
  onRename?: () => void;
  /**
   * Flat cross-project rows only: add the project-level Git and Run submenus.
   * The grouped layout already offers them on the project header's own menu;
   * the flat list has no project headers, so main-branch threads carry them.
   */
  showProjectActions?: boolean;
  children: ReactNode;
}) {
  const { thread, project, onRename } = props;
  const { t } = useLingui();
  const experiment = useExperimentStore((state) =>
    thread.groupId ? state.experiments[thread.groupId] : undefined,
  );
  const isExperimentCandidate = experiment !== undefined;
  const isCurrentThread = useIsCurrentThread(thread.id);
  const currentThreadCount = useCurrentThreadIdsCount();
  // The continue-in gate reads the pane's own population — the local installed
  // list, or the host's installed statuses for a mirrored thread (see
  // `useThreadAgentStatuses`). An enabled entry here must always be able to
  // act once its pane mounts.
  const installedAgents = useThreadAgentStatuses({
    remoteServerId: thread.remoteServerId,
    projectLocation: project.location,
  });
  const hasOtherInstalledAgents =
    installedAgents.filter((a) => a.kind !== thread.agentKind).length > 0;
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
  // Home has no project menu even in the grouped layout (its sidebar section
  // is a plain header), so flat Home threads don't get project actions either.
  const showProjectActions = props.showProjectActions === true && !isHomeProject(project);
  const runningActionIds = useRunningProjectActionIds(project.id, thread.worktreePath);
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

  return (
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
        ...(!thread.worktreePath && !isExperimentCandidate
          ? [
              {
                type: "submenu" as const,
                id: "move-to-worktree",
                label: t`Move to Worktree`,
                icon: <GitFork className="size-3.5" />,
                items: [
                  {
                    id: "move-to-worktree-with-changes",
                    label: t`Bring Uncommitted Changes`,
                  },
                  {
                    id: "move-to-worktree-clean",
                    label: t`Clean Worktree`,
                  },
                ],
              },
              // Project-level git, running against the main checkout the
              // thread lives in (mirrors the project header's Git submenu).
              ...(showProjectActions
                ? [
                    {
                      type: "submenu" as const,
                      id: "git",
                      label: t`Git`,
                      icon: <GitFork className="size-3.5" />,
                      items: [
                        {
                          id: "git-review",
                          label: t`Review Changes`,
                          icon: <FileDiff className="size-3.5" />,
                        },
                        {
                          id: "github-actions",
                          label: t`GitHub Actions`,
                          icon: <Workflow className="size-3.5" />,
                        },
                        {
                          id: "git-sync",
                          label: t`Sync`,
                          icon: <RefreshCw className="size-3.5" />,
                        },
                      ],
                    },
                  ]
                : []),
            ]
          : []),
        ...((thread.worktreePath || (showProjectActions && !isExperimentCandidate)) &&
        project.scripts?.actions?.length
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
        ...(onRename
          ? [
              {
                id: "rename",
                label: t`Rename`,
                icon: <Pencil className="size-3.5" />,
              },
            ]
          : []),
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
                // No session-ref gate (matching the thread header): without one
                // the handoff falls back to the stored transcript, which is
                // precisely when continuing elsewhere is most useful. Remote
                // threads take the same flow — the switch/fork launches on
                // their host.
                isDisabled: !hasOtherInstalledAgents,
                ...(!hasOtherInstalledAgents
                  ? { disabledReason: t`No other agents installed` }
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
      onAction={(key, anchorPosition, returnFocusElement) => {
        if (key === "new-thread-in-worktree" && thread.worktreePath)
          openNewThreadInWorktree({
            projectId: thread.projectId,
            worktreePath: thread.worktreePath,
            worktreeBranch:
              resolveWorktreeBranch(thread.projectId, thread.worktreePath, thread.worktreeBranch) ??
              thread.worktreePath,
          });
        if (key === "move-to-worktree-with-changes") void moveThreadToWorktree(thread.id, true);
        if (key === "move-to-worktree-clean") void moveThreadToWorktree(thread.id, false);
        if (key === "git-review") openGitReview(thread.projectId, thread.worktreePath, thread.id);
        // Non-worktree flat rows offer project-level sync (no path argument).
        if (key === "git-sync") {
          if (thread.worktreePath) gitSync(thread.projectId, thread.worktreePath);
          else gitSync(thread.projectId);
        }
        if (key === "github-actions") useAppStore.getState().openGitHubActions(thread.projectId);
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
        if (key === "rename") onRename?.();
        if (key === "unload") unloadThread(thread.id);
        if (key === "mark-done") toggleMarkThreadDone(thread.id);
        if (key === "toggle-star") toggleStarThread(thread.id);
        if (key === "delete" && !isExperimentCandidate)
          requestDeleteThread(thread.id, thread.worktreePath, thread.projectId, {
            ...(anchorPosition ? { anchorPosition } : {}),
            ...(returnFocusElement ? { returnFocusElement } : {}),
          });
        if (key.startsWith("action:")) {
          runProjectAction(project.id, key.slice("action:".length), thread.worktreePath);
        }
        if (key.startsWith("stop-action:")) {
          stopProjectAction(project.id, key.slice("stop-action:".length), thread.worktreePath);
        }
      }}
    >
      {props.children}
    </ContextMenu>
  );
}
