import { GitFork, TerminalSquare } from "lucide-react";
import { SidebarButton } from "../common";
import { GitBadge } from "./GitBadge";
import { PrBadge } from "./PrBadge";

export function WorktreeGroupHeader(props: {
  ref?: React.Ref<HTMLDivElement>;
  worktreePath: string;
  worktreeBranch: string;
  projectId: string;
  isCollapsed: boolean;
  hasTerminal: boolean;
  isActiveTerminal: boolean;
  onToggleCollapse: () => void;
  onOpenGitReview: () => void;
  onOpenTerminal: () => void;
  isDragging?: boolean;
}) {
  return (
    <SidebarButton
      {...(props.ref != null ? { ref: props.ref } : {})}
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
      {...(props.isDragging != null ? { isDragging: props.isDragging } : {})}
      suffix={
        <>
          <div
            role="button"
            tabIndex={0}
            aria-label={`Terminal for ${props.worktreeBranch}`}
            className={`shrink-0 cursor-default rounded p-0.5 transition-colors hover:bg-white/[0.04] hover:text-foreground ${
              props.isActiveTerminal
                ? "text-accent"
                : props.hasTerminal
                  ? "text-foreground"
                  : "text-muted/60 opacity-0 group-hover:opacity-100"
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
          <PrBadge worktreePath={props.worktreePath} />
          <GitBadge
            projectId={props.projectId}
            projectName={props.worktreeBranch}
            worktreePath={props.worktreePath}
            onPress={props.onOpenGitReview}
          />
        </>
      }
    />
  );
}
