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
import { openTerminal, openWorktreeTerminal } from "@/renderer/actions/terminalActions";
import { AnimatedTerminalIcon } from "@/renderer/components/common/AnimatedTerminalIcon";
import {
  useIsProjectFilesPanelActive,
  useIsProjectGitPanelActive,
  useIsProjectTerminalActive,
  useIsProjectTerminalBusy,
  useIsProjectTerminalOpen,
  useIsWorktreeFilesPanelActive,
  useIsWorktreeGitPanelActive,
  useIsWorktreeTerminalActive,
  useIsWorktreeTerminalBusy,
  useIsWorktreeTerminalOpen,
} from "@/renderer/hooks/uiSelectors";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";
import { SidebarPanelDragButton } from "../../SidebarPanelDragButton";

interface ThreadItemSuffixProps {
  thread: Thread;
  showWorktreeBadge: boolean;
  showWorktreeFilesButton: boolean;
  isExperimentCandidate: boolean;
  /**
   * Flat cross-project lists have no project header to carry project-scoped
   * chrome (files, terminal, git/sync badges), so a main-branch thread row
   * shows them inline. Off in grouped lists, where the header has them.
   */
  showProjectBadge?: boolean;
  /** Project display name for project-scoped controls' accessibility labels. */
  projectName: string;
}

const iconSizeClass = "size-3.5";
const buttonHeightClass = "h-[18px]";
const buttonVisibleClass = "w-[18px] p-0.5";
const hiddenPanelButtonClass =
  "w-0 -mr-[3px] overflow-hidden p-0 opacity-0 pointer-events-none group-hover:w-[18px] group-hover:mr-0 group-hover:p-0.5 group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:w-[18px] focus-visible:mr-0 focus-visible:p-0.5 focus-visible:opacity-100 focus-visible:pointer-events-auto";

function ProjectGitBadge(props: { projectId: string; projectName: string; threadId: string }) {
  const isActive = useIsProjectGitPanelActive(props.projectId);
  return (
    <GitBadge
      projectId={props.projectId}
      projectName={props.projectName}
      onPress={() => openGitReview(props.projectId, undefined, props.threadId)}
      isActive={isActive}
    />
  );
}

function ThreadItemPanelActions(props: ThreadItemSuffixProps) {
  const { thread, showWorktreeBadge, showWorktreeFilesButton, showProjectBadge, projectName } =
    props;
  const { t } = useLingui();
  const worktreePath = showWorktreeBadge ? thread.worktreePath : undefined;
  // Flat main-branch rows mirror the project header's files/terminal launchers
  // because there is no project header in the cross-project list.
  const showProjectPanelButtons = !thread.worktreePath && !!showProjectBadge;

  const isWorktreeFilesActive = useIsWorktreeFilesPanelActive(worktreePath);
  const isWorktreeTerminalActive = useIsWorktreeTerminalActive(worktreePath);
  const isWorktreeTerminalOpen = useIsWorktreeTerminalOpen(worktreePath);
  const isWorktreeTerminalBusy = useIsWorktreeTerminalBusy(worktreePath);
  const isProjectFilesActive = useIsProjectFilesPanelActive(thread.projectId);
  const isProjectTerminalActive = useIsProjectTerminalActive(thread.projectId);
  const isProjectTerminalOpen = useIsProjectTerminalOpen(thread.projectId);
  const isProjectTerminalBusy = useIsProjectTerminalBusy(thread.projectId);

  const showFiles = (worktreePath && showWorktreeFilesButton) || showProjectPanelButtons;
  const showTerminal = !!worktreePath || showProjectPanelButtons;
  const isFilesActive = worktreePath ? isWorktreeFilesActive : isProjectFilesActive;
  const isTerminalActive = worktreePath ? isWorktreeTerminalActive : isProjectTerminalActive;
  const isTerminalOpen = worktreePath ? isWorktreeTerminalOpen : isProjectTerminalOpen;
  const isTerminalBusy = worktreePath ? isWorktreeTerminalBusy : isProjectTerminalBusy;
  const isTerminalVisible = isTerminalActive || isTerminalOpen;
  const filesLabel = worktreePath
    ? t`Files for ${thread.worktreeBranch ?? thread.title}`
    : t`Files for ${projectName}`;
  const terminalLabel = worktreePath
    ? t`Terminal for ${thread.worktreeBranch}`
    : t`Terminal for ${projectName}`;

  return (
    <>
      {thread.starred ? (
        <Star className="size-3 shrink-0 fill-current" aria-label={t`Pinned`} />
      ) : null}
      {showFiles ? (
        <SidebarPanelDragButton
          panel="files"
          projectId={thread.projectId}
          {...(worktreePath ? { worktreePath } : {})}
          ariaLabel={filesLabel}
          className={`flex ${buttonHeightClass} shrink-0 cursor-grab items-center justify-center rounded transition-[opacity,color,background-color] hover:bg-[var(--row-hover)] hover:text-foreground active:cursor-grabbing ${
            isFilesActive
              ? `${buttonVisibleClass} text-accent`
              : `text-muted/60 ${hiddenPanelButtonClass}`
          }`}
          onPress={() =>
            worktreePath
              ? openFilesPanel(thread.projectId, worktreePath)
              : openFilesPanel(thread.projectId)
          }
        >
          <FolderOpen className={iconSizeClass} />
        </SidebarPanelDragButton>
      ) : null}
      {showTerminal ? (
        <SidebarPanelDragButton
          panel="terminal"
          projectId={thread.projectId}
          {...(worktreePath ? { worktreePath } : {})}
          ariaLabel={terminalLabel}
          className={`flex ${buttonHeightClass} shrink-0 cursor-grab items-center justify-center rounded transition-[opacity,color,background-color] hover:bg-[var(--row-hover)] hover:text-foreground active:cursor-grabbing ${
            isTerminalVisible
              ? `${buttonVisibleClass} ${isTerminalActive ? "text-accent" : "text-foreground"}`
              : `text-muted/60 ${hiddenPanelButtonClass}`
          }`}
          onPress={() =>
            worktreePath
              ? openWorktreeTerminal(thread.projectId, worktreePath)
              : openTerminal(thread.projectId)
          }
        >
          <AnimatedTerminalIcon className={iconSizeClass} isBusy={isTerminalBusy} />
        </SidebarPanelDragButton>
      ) : null}
    </>
  );
}

function ThreadItemStatusBadges(props: ThreadItemSuffixProps) {
  const { thread, showWorktreeBadge, isExperimentCandidate } = props;
  const { t } = useLingui();
  const worktreePath = showWorktreeBadge ? thread.worktreePath : undefined;
  const prState = usePrState(thread.worktreePath);
  const isGitActive = useIsWorktreeGitPanelActive(worktreePath);
  const showDoneButton =
    !isExperimentCandidate && !thread.done && !!thread.worktreePath && prState === "merged";

  return (
    <>
      {worktreePath ? (
        <SyncBadge projectId={thread.projectId} worktreePath={worktreePath} />
      ) : !thread.worktreePath && props.showProjectBadge ? (
        <SyncBadge projectId={thread.projectId} />
      ) : null}
      {showDoneButton ? (
        <div
          role="button"
          tabIndex={0}
          aria-label={t`Mark ${thread.title} done`}
          className={`flex ${buttonHeightClass} shrink-0 items-center justify-center rounded text-muted/60 transition-[opacity,color,background-color] hover:bg-[var(--row-hover)] hover:text-success ${hiddenPanelButtonClass}`}
          onClick={(event) => {
            event.stopPropagation();
            markThreadDone(thread.id);
          }}
          onKeyDown={(event) =>
            handleKeyActivate(event, () => markThreadDone(thread.id), { stopPropagation: true })
          }
        >
          <CircleCheck className={iconSizeClass} />
        </div>
      ) : null}
      {worktreePath ? (
        <GitBadge
          projectId={thread.projectId}
          projectName={thread.worktreeBranch ?? ""}
          worktreePath={worktreePath}
          onPress={() => openGitReview(thread.projectId, worktreePath, thread.id)}
          isActive={isGitActive}
          fallbackToWorktreeIcon
        />
      ) : !thread.worktreePath && props.showProjectBadge ? (
        <ProjectGitBadge
          projectId={thread.projectId}
          projectName={props.projectName}
          threadId={thread.id}
        />
      ) : null}
    </>
  );
}

function ThreadItemRemovalTime(
  props: Pick<ThreadItemSuffixProps, "thread" | "isExperimentCandidate"> & {
    compact?: boolean;
  },
) {
  const { thread, isExperimentCandidate, compact = false } = props;
  const { t } = useLingui();
  const threadRemoveAction = useSharedSettings((s) => s.threadRemoveAction);
  const removeThread = () => {
    if (threadRemoveAction === "archive") {
      archiveThread(thread.id);
    } else {
      deleteThread(thread.id, thread.worktreePath, thread.projectId);
    }
  };
  const removeLabel =
    threadRemoveAction === "archive" ? t`Archive ${thread.title}` : t`Delete ${thread.title}`;
  const removeIcon =
    threadRemoveAction === "archive" ? (
      <Archive className={iconSizeClass} />
    ) : (
      <Trash2 className={iconSizeClass} />
    );

  if (compact) {
    return (
      <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center">
        <RelativeTime
          iso={thread.updatedAt}
          className={`block font-mono text-[10px] leading-none tabular-nums text-muted ${isExperimentCandidate ? "" : "group-hover:invisible"}`}
        />
        {!isExperimentCandidate ? (
          <div
            role="button"
            tabIndex={0}
            aria-label={removeLabel}
            className={`absolute inset-0 flex items-center justify-center rounded text-muted/55 opacity-0 transition group-hover:opacity-100 ${threadRemoveAction === "archive" ? "hover:bg-[var(--row-hover)] hover:text-warning" : "hover:bg-[var(--row-hover)] hover:text-danger"}`}
            onClick={(event) => {
              event.stopPropagation();
              removeThread();
            }}
            onKeyDown={(event) => handleKeyActivate(event, removeThread, { stopPropagation: true })}
          >
            {removeIcon}
          </div>
        ) : null}
      </span>
    );
  }

  return (
    <span className="relative w-[2.4ch] shrink-0">
      <RelativeTime
        iso={thread.updatedAt}
        className={`block text-center font-mono text-[10px] tabular-nums text-muted ${isExperimentCandidate ? "" : "group-hover:invisible"}`}
      />
      {!isExperimentCandidate ? (
        <div
          role="button"
          tabIndex={0}
          aria-label={removeLabel}
          className={`absolute inset-0 flex items-center justify-center rounded text-muted/55 opacity-0 transition group-hover:opacity-100 ${threadRemoveAction === "archive" ? "hover:text-warning" : "hover:text-danger"}`}
          onClick={(event) => {
            event.stopPropagation();
            removeThread();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.stopPropagation();
              removeThread();
            }
          }}
        >
          {removeIcon}
        </div>
      ) : null}
    </span>
  );
}

export function ThreadItemTopSuffix(props: ThreadItemSuffixProps) {
  return (
    <>
      <ThreadItemPanelActions {...props} />
      <ThreadItemRemovalTime
        thread={props.thread}
        isExperimentCandidate={props.isExperimentCandidate}
        compact
      />
    </>
  );
}

export function ThreadItemBottomSuffix(props: ThreadItemSuffixProps) {
  return <ThreadItemStatusBadges {...props} />;
}

export function ThreadItemSuffix(props: ThreadItemSuffixProps) {
  return (
    <>
      <ThreadItemPanelActions {...props} />
      <ThreadItemStatusBadges {...props} />
      <ThreadItemRemovalTime
        thread={props.thread}
        isExperimentCandidate={props.isExperimentCandidate}
      />
    </>
  );
}
