import { GitFork, TerminalSquare } from "lucide-react";
import type { DragEventHandler } from "react";
import { SidebarButton } from "../common";
import { PrBadge } from "./PrBadge";
import { WorktreeGitMenu } from "./WorktreeGitMenu";

export function WorktreeGroupHeader(props: {
  worktreePath: string;
  worktreeBranch: string;
  projectId: string;
  isCollapsed: boolean;
  hasTerminal: boolean;
  isActiveTerminal: boolean;
  onToggleCollapse: () => void;
  onOpenGitReview: () => void;
  onGitSync: () => void;
  onGitPush: () => void;
  onGitPull: () => void;
  onGitPullFromSource: () => void;
  onGitMergeToSource: () => void;
  onGitMergeAndRemove: () => void;
  onDeleteWorktree: () => void;
  onOpenTerminal: () => void;
  isDragging: boolean;
  onDragStart: DragEventHandler<HTMLDivElement>;
  onDragEnd: DragEventHandler<HTMLDivElement>;
  onDragOver: DragEventHandler<HTMLButtonElement>;
  onDrop: DragEventHandler<HTMLButtonElement>;
}) {
  return (
    <SidebarButton
      icon={
        <GitFork
          className={`size-3 shrink-0 transition-colors ${
            props.isCollapsed ? "text-muted/60" : "text-foreground"
          }`}
        />
      }
      label={<span className="text-xs font-medium text-foreground/80">{props.worktreeBranch}</span>}
      tooltip={`Worktree: ${props.worktreeBranch}`}
      className={props.isDragging ? "opacity-60" : ""}
      onPress={props.onToggleCollapse}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
      isDragging={props.isDragging}
      dragLabel={`Reorder ${props.worktreeBranch}`}
      suffix={
        <>
          <PrBadge worktreePath={props.worktreePath} />
          <WorktreeGitMenu
            projectId={props.projectId}
            worktreePath={props.worktreePath}
            worktreeBranch={props.worktreeBranch}
            onOpenGitReview={props.onOpenGitReview}
            onGitSync={props.onGitSync}
            onGitPush={props.onGitPush}
            onGitPull={props.onGitPull}
            onGitPullFromSource={props.onGitPullFromSource}
            onGitMergeToSource={props.onGitMergeToSource}
            onGitMergeAndRemove={props.onGitMergeAndRemove}
            onDeleteWorktree={props.onDeleteWorktree}
          />
          <div
            role="button"
            tabIndex={0}
            aria-label={`Terminal for ${props.worktreeBranch}`}
            className={`shrink-0 cursor-default rounded p-0.5 transition-colors hover:bg-white/[0.04] hover:text-foreground ${
              props.isActiveTerminal
                ? "text-accent"
                : props.hasTerminal
                  ? "text-foreground"
                  : "text-muted/60"
            }`}
            onClick={(event) => {
              event.stopPropagation();
              props.onOpenTerminal();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.stopPropagation();
                props.onOpenTerminal();
              }
            }}
          >
            <TerminalSquare className="size-3.5" />
          </div>
        </>
      }
    />
  );
}
