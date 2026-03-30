import { GitFork, TerminalSquare } from "lucide-react";
import type { DragEventHandler } from "react";
import { SidebarButton } from "../common";
import { GitBadge } from "./GitBadge";

export function WorktreeGroupHeader(props: {
  worktreePath: string;
  worktreeBranch: string;
  projectId: string;
  isCollapsed: boolean;
  hasTerminal: boolean;
  isActiveTerminal: boolean;
  onToggleCollapse: () => void;
  onOpenGitReview: () => void;
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
          <GitBadge
            projectId={props.projectId}
            projectName={props.worktreeBranch}
            worktreePath={props.worktreePath}
            onPress={props.onOpenGitReview}
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
