import { Archive, CircleCheck, FolderOpen, Star, Trash2 } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { Thread } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { usePrState } from "@/renderer/state/gitSelectors";
import { handleKeyActivate } from "@/renderer/utils/a11y";
import { GitBadge } from "@/renderer/views/MainView/parts/Sidebar/parts/GitBadge";
import { SyncBadge } from "@/renderer/views/MainView/parts/Sidebar/parts/SyncBadge";
import { archiveThread, deleteThread, markThreadDone } from "@/renderer/actions/threadActions";
import { openFilesPanel, openGitReview } from "@/renderer/actions/panelActions";
import { openWorktreeTerminal } from "@/renderer/actions/terminalActions";
import { AnimatedTerminalIcon } from "@/renderer/components/common/AnimatedTerminalIcon";
import {
  useIsWorktreeFilesPanelActive,
  useIsWorktreeGitPanelActive,
  useIsWorktreeTerminalActive,
  useIsWorktreeTerminalBusy,
  useIsWorktreeTerminalOpen,
} from "@/renderer/hooks/uiSelectors";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";
import { SidebarPanelDragButton } from "../../SidebarPanelDragButton";

export function ThreadItemSuffix(props: {
  thread: Thread;
  showWorktreeBadge: boolean;
  showWorktreeFilesButton: boolean;
  isExperimentCandidate: boolean;
}) {
  const { thread, showWorktreeBadge, showWorktreeFilesButton, isExperimentCandidate } = props;
  const { t } = useLingui();
  const threadRemoveAction = useSharedSettings((s) => s.threadRemoveAction);
  const prState = usePrState(thread.worktreePath);
  // A merged PR means the work landed, so the row offers Done inline instead of
  // sending the user through the context menu.
  const showDoneButton =
    !isExperimentCandidate && !thread.done && !!thread.worktreePath && prState === "merged";
  const isFilesActive = useIsWorktreeFilesPanelActive(thread.worktreePath);
  const isGitActive = useIsWorktreeGitPanelActive(thread.worktreePath);
  const isTerminalActive = useIsWorktreeTerminalActive(thread.worktreePath);
  const isTerminalOpen = useIsWorktreeTerminalOpen(thread.worktreePath);
  const isTerminalBusy = useIsWorktreeTerminalBusy(thread.worktreePath);
  const isTerminalVisible = isTerminalActive || isTerminalOpen;
  const hiddenPanelButtonClass =
    "w-0 -mr-[3px] overflow-hidden p-0 opacity-0 pointer-events-none group-hover:w-[18px] group-hover:mr-0 group-hover:p-0.5 group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:w-[18px] focus-visible:mr-0 focus-visible:p-0.5 focus-visible:opacity-100 focus-visible:pointer-events-auto";

  // Sits left of the git badge so the PR glyph keeps its slot next to the
  // timestamp whether or not the row is hovered.
  const doneButton = showDoneButton ? (
    <div
      role="button"
      tabIndex={0}
      aria-label={t`Mark ${thread.title} done`}
      className={`flex h-[18px] shrink-0 items-center justify-center rounded text-muted/60 transition-[opacity,color,background-color] hover:bg-[var(--row-hover)] hover:text-success ${hiddenPanelButtonClass}`}
      onClick={(event) => {
        event.stopPropagation();
        markThreadDone(thread.id);
      }}
      onKeyDown={(event) =>
        handleKeyActivate(event, () => markThreadDone(thread.id), { stopPropagation: true })
      }
    >
      <CircleCheck className="size-3.5" />
    </div>
  ) : null;

  return (
    <>
      {thread.starred && <Star className="size-3 shrink-0 fill-current" aria-label={t`Pinned`} />}
      {showWorktreeBadge && thread.worktreePath && (
        <>
          {showWorktreeFilesButton ? (
            <SidebarPanelDragButton
              panel="files"
              projectId={thread.projectId}
              worktreePath={thread.worktreePath}
              ariaLabel={t`Files for ${thread.worktreeBranch ?? thread.title}`}
              className={`flex h-[18px] shrink-0 cursor-grab items-center justify-center rounded transition-[opacity,color,background-color] hover:bg-[var(--row-hover)] hover:text-foreground active:cursor-grabbing ${
                isFilesActive
                  ? "w-[18px] p-0.5 text-accent"
                  : `text-muted/60 ${hiddenPanelButtonClass}`
              }`}
              onPress={() => openFilesPanel(thread.projectId, thread.worktreePath)}
            >
              <FolderOpen className="size-3.5" />
            </SidebarPanelDragButton>
          ) : null}
          <SidebarPanelDragButton
            panel="terminal"
            projectId={thread.projectId}
            worktreePath={thread.worktreePath}
            ariaLabel={t`Terminal for ${thread.worktreeBranch}`}
            className={`flex h-[18px] shrink-0 cursor-grab items-center justify-center rounded transition-[opacity,color,background-color] hover:bg-[var(--row-hover)] hover:text-foreground active:cursor-grabbing ${
              isTerminalVisible
                ? `w-[18px] p-0.5 ${isTerminalActive ? "text-accent" : "text-foreground"}`
                : `text-muted/60 ${hiddenPanelButtonClass}`
            }`}
            onPress={() => openWorktreeTerminal(thread.projectId, thread.worktreePath!)}
          >
            <AnimatedTerminalIcon className="size-3.5" isBusy={isTerminalBusy} />
          </SidebarPanelDragButton>
          <SyncBadge projectId={thread.projectId} worktreePath={thread.worktreePath} />
          {doneButton}
          <GitBadge
            projectId={thread.projectId}
            projectName={thread.worktreeBranch ?? ""}
            worktreePath={thread.worktreePath}
            onPress={() => openGitReview(thread.projectId, thread.worktreePath)}
            isActive={isGitActive}
            fallbackToWorktreeIcon
          />
        </>
      )}
      {/* Rows inside a worktree group hide the badge cluster — keep the button. */}
      {!showWorktreeBadge || !thread.worktreePath ? doneButton : null}
      <span className="relative w-[2.4ch] shrink-0">
        <RelativeTime
          iso={thread.updatedAt}
          className={`block text-center font-mono text-[10px] tabular-nums text-muted ${isExperimentCandidate ? "" : "group-hover:invisible"}`}
        />
        {!isExperimentCandidate ? (
          <div
            role="button"
            tabIndex={0}
            aria-label={
              threadRemoveAction === "archive"
                ? t`Archive ${thread.title}`
                : t`Delete ${thread.title}`
            }
            className={`absolute inset-0 flex items-center justify-center rounded text-muted/55 opacity-0 transition group-hover:opacity-100 ${threadRemoveAction === "archive" ? "hover:text-warning" : "hover:text-danger"}`}
            onClick={(event) => {
              event.stopPropagation();
              if (threadRemoveAction === "archive") {
                archiveThread(thread.id);
              } else {
                deleteThread(thread.id, thread.worktreePath, thread.projectId);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.stopPropagation();
                if (threadRemoveAction === "archive") {
                  archiveThread(thread.id);
                } else {
                  deleteThread(thread.id, thread.worktreePath, thread.projectId);
                }
              }
            }}
          >
            {threadRemoveAction === "archive" ? (
              <Archive className="size-3.5" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
          </div>
        ) : null}
      </span>
    </>
  );
}
