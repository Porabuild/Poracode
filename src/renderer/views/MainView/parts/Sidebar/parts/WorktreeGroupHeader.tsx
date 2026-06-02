import { Check, FolderOpen, GitFork } from "lucide-react";
import { SidebarButton } from "@/renderer/components/common";
import { AnimatedTerminalIcon } from "@/renderer/components/common/AnimatedTerminalIcon";
import { GitBadge } from "./GitBadge";
import { SidebarPanelDragButton } from "./SidebarPanelDragButton";
import { SyncBadge } from "./SyncBadge";

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
  isDragging?: boolean;
  isDraggingAnything?: boolean;
  isDone?: boolean;
  onContextMenu?: React.MouseEventHandler | undefined;
}) {
  return (
    <SidebarButton
      {...(props.ref != null ? { ref: props.ref } : {})}
      onContextMenu={props.onContextMenu}
      icon={
        props.isDone ? (
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
              props.isCollapsed ? "text-muted/60" : "text-foreground"
            }`}
          />
        )
      }
      label={
        <span
          className={`font-medium ${props.isDone ? "opacity-50 line-through" : "text-foreground/80"}`}
        >
          {props.worktreeBranch}
        </span>
      }
      tooltip={`Worktree: ${props.worktreeBranch}`}
      size="xs"
      liveText
      className="h-8"
      onPress={props.onToggleCollapse}
      {...(props.isDragging != null ? { isDragging: props.isDragging } : {})}
      {...(props.isDraggingAnything != null
        ? { isDraggingAnything: props.isDraggingAnything }
        : {})}
      suffix={
        <>
          <SidebarPanelDragButton
            panel="files"
            projectId={props.projectId}
            worktreePath={props.worktreePath}
            ariaLabel={`Files for ${props.worktreeBranch}`}
            className={`shrink-0 cursor-grab rounded p-0.5 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground active:cursor-grabbing ${
              props.isActiveFiles
                ? "text-accent"
                : "text-muted/60 opacity-0 group-hover:opacity-100"
            }`}
            onPress={props.onOpenFiles}
          >
            <FolderOpen className="size-3.5" />
          </SidebarPanelDragButton>
          <SidebarPanelDragButton
            panel="terminal"
            projectId={props.projectId}
            worktreePath={props.worktreePath}
            ariaLabel={`Terminal for ${props.worktreeBranch}`}
            className={`shrink-0 cursor-grab rounded p-0.5 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground active:cursor-grabbing ${
              props.isActiveTerminal
                ? "text-accent"
                : props.hasTerminal
                  ? "text-foreground"
                  : "text-muted/60 opacity-0 group-hover:opacity-100"
            }`}
            onPress={props.onOpenTerminal}
          >
            <AnimatedTerminalIcon className="size-3.5" isBusy={props.isBusyTerminal} />
          </SidebarPanelDragButton>
          <SyncBadge projectId={props.projectId} worktreePath={props.worktreePath} />
          <GitBadge
            projectId={props.projectId}
            projectName={props.worktreeBranch}
            worktreePath={props.worktreePath}
            onPress={props.onOpenGitReview}
            isActive={props.isActiveGit}
          />
        </>
      }
    />
  );
}
