import { Check, FolderOpen, GitFork, Trash2 } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { AnimatedTerminalIcon } from "@/renderer/components/common/AnimatedTerminalIcon";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";
import type { StatusTone } from "@/renderer/components/providers/statusTone";
import { GitBadge } from "./GitBadge";
import { SidebarPanelDragButton } from "./SidebarPanelDragButton";
import { SyncBadge } from "./SyncBadge";

type WorktreeGroupStatusTone = Extract<StatusTone, "finished" | "working">;

export function getWorktreeGroupStatusTone(
  childTones: readonly StatusTone[],
): WorktreeGroupStatusTone | undefined {
  if (childTones.includes("finished")) return "finished";
  if (childTones.includes("working")) return "working";
  return undefined;
}

export function WorktreeGroupHeader(props: {
  ref?: React.Ref<HTMLDivElement>;
  worktreePath: string;
  worktreeBranch: string;
  projectId: string;
  isCollapsed: boolean;
  hasTerminal: boolean;
  isActiveTerminal: boolean;
  isBusyTerminal?: boolean;
  isActiveFiles?: boolean;
  isActiveGit: boolean;
  onToggleCollapse: () => void;
  onOpenFiles: () => void;
  onOpenGitReview: () => void;
  onOpenTerminal: () => void;
  onDeleteWorktree: () => void;
  isDragging?: boolean;
  isDraggingAnything?: boolean;
  isDone?: boolean;
  collapsedStatusTone?: WorktreeGroupStatusTone;
  updatedAt: string;
  onContextMenu?: React.MouseEventHandler | undefined;
  /** Trailing project label for cross-project (flat) lists. */
  projectTag?: React.ReactNode;
}) {
  const { t } = useLingui();
  const hiddenPanelButtonClass =
    "w-0 -mr-[3px] overflow-hidden p-0 opacity-0 pointer-events-none group-hover:w-[18px] group-hover:mr-0 group-hover:p-0.5 group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:w-[18px] focus-visible:mr-0 focus-visible:p-0.5 focus-visible:opacity-100 focus-visible:pointer-events-auto";
  // A project tag means this is a flat cross-project row, which stacks the tag
  // on a second line — same treatment as the plain thread rows around it.
  const stacked = props.projectTag != null;

  const branchLabel = (
    <span
      className={`min-w-0 flex-1 truncate font-medium ${props.isDone ? "opacity-50 line-through" : "text-foreground/80"}`}
    >
      {props.worktreeBranch}
    </span>
  );

  const panelButtons = (
    <>
      <SidebarPanelDragButton
        panel="files"
        projectId={props.projectId}
        worktreePath={props.worktreePath}
        ariaLabel={t`Files for ${props.worktreeBranch}`}
        className={`flex h-[18px] shrink-0 cursor-grab items-center justify-center rounded transition-[opacity,color,background-color] hover:bg-[var(--row-hover)] hover:text-foreground active:cursor-grabbing ${
          props.isActiveFiles
            ? "w-[18px] p-0.5 text-accent"
            : `text-muted/60 ${hiddenPanelButtonClass}`
        }`}
        onPress={props.onOpenFiles}
      >
        <FolderOpen className="size-3.5" />
      </SidebarPanelDragButton>
      <SidebarPanelDragButton
        panel="terminal"
        projectId={props.projectId}
        worktreePath={props.worktreePath}
        ariaLabel={t`Terminal for ${props.worktreeBranch}`}
        className={`flex h-[18px] shrink-0 cursor-grab items-center justify-center rounded transition-[opacity,color,background-color] hover:bg-[var(--row-hover)] hover:text-foreground active:cursor-grabbing ${
          props.isActiveTerminal
            ? "w-[18px] p-0.5 text-accent"
            : props.hasTerminal
              ? "w-[18px] p-0.5 text-foreground"
              : `text-muted/60 ${hiddenPanelButtonClass}`
        }`}
        onPress={props.onOpenTerminal}
      >
        <AnimatedTerminalIcon className="size-3.5" isBusy={props.isBusyTerminal} />
      </SidebarPanelDragButton>
    </>
  );

  const gitBadges = (
    <>
      <SyncBadge projectId={props.projectId} worktreePath={props.worktreePath} />
      <GitBadge
        projectId={props.projectId}
        projectName={props.worktreeBranch}
        worktreePath={props.worktreePath}
        onPress={props.onOpenGitReview}
        isActive={props.isActiveGit}
      />
    </>
  );

  const deleteButton = (
    <div
      role="button"
      tabIndex={0}
      aria-label={t`Delete worktree ${props.worktreeBranch}`}
      className={`absolute inset-0 flex items-center justify-center rounded text-muted/55 opacity-0 transition group-hover:opacity-100 ${stacked ? "hover:bg-[var(--row-hover)] hover:text-danger" : "hover:text-danger"}`}
      onClick={(event) => {
        event.stopPropagation();
        props.onDeleteWorktree();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.stopPropagation();
          props.onDeleteWorktree();
        }
      }}
    >
      <Trash2 className="size-3.5" />
    </div>
  );

  // Same square time slot the stacked thread rows use, so both rows' trailing
  // icon columns line up on the title line.
  const timeSlot = stacked ? (
    <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center">
      <RelativeTime
        iso={props.updatedAt}
        className="block font-mono text-[10px] leading-none tabular-nums text-muted group-hover:invisible"
      />
      {deleteButton}
    </span>
  ) : (
    <span className="relative w-[2.4ch] shrink-0">
      <RelativeTime
        iso={props.updatedAt}
        className="block text-center font-mono text-[10px] tabular-nums text-muted group-hover:invisible"
      />
      {deleteButton}
    </span>
  );

  return (
    <SidebarButton
      {...(props.ref != null ? { ref: props.ref } : {})}
      onContextMenu={props.onContextMenu}
      icon={
        !props.isCollapsed ? (
          <GitFork className="size-3 shrink-0 text-foreground transition-colors" />
        ) : props.isDone ? (
          <span className="relative size-3.5 shrink-0 text-muted">
            <GitFork className="size-3.5 opacity-40" />
            <Check
              className="absolute left-[15%] top-[15%] size-[70%] text-success"
              strokeWidth={4}
            />
          </span>
        ) : (
          <GitFork
            className={`size-3 shrink-0 transition-colors ${
              props.collapsedStatusTone === "finished"
                ? "text-[oklch(0.82_0.12_260)]"
                : props.collapsedStatusTone === "working"
                  ? "text-success"
                  : "text-muted/60"
            }`}
          />
        )
      }
      label={
        stacked ? (
          // Two-line flat-list header: the branch owns the title line with the
          // panel buttons and time, the project tag sits on the meta line with
          // the git badges — mirrors the stacked thread row's split so the
          // bottom badges never reserve width from the branch name.
          <span className="flex flex-col gap-0.5 pr-0.5">
            <span className="flex h-[18px] items-center gap-1.5">
              {branchLabel}
              <span className="flex shrink-0 items-center gap-[3px]">
                {panelButtons}
                {timeSlot}
              </span>
            </span>
            <span className="flex h-[18px] items-center gap-1.5">
              {props.projectTag}
              <span className="flex shrink-0 items-center gap-[3px]">{gitBadges}</span>
            </span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5">{branchLabel}</span>
        )
      }
      tooltip={t`Worktree: ${props.worktreeBranch}`}
      size="xs"
      liveText
      {...(stacked ? { density: "compact" as const } : { className: "h-8" })}
      onPress={props.onToggleCollapse}
      {...(props.isDragging != null ? { isDragging: props.isDragging } : {})}
      {...(props.isDraggingAnything != null
        ? { isDraggingAnything: props.isDraggingAnything }
        : {})}
      {...(stacked
        ? {}
        : {
            suffix: (
              <>
                {panelButtons}
                {gitBadges}
                {timeSlot}
              </>
            ),
          })}
    />
  );
}
