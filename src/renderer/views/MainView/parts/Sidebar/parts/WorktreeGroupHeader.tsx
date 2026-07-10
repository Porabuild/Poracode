import { Check, FolderOpen, GitFork, Trash2 } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { AnimatedTerminalIcon } from "@/renderer/components/common/AnimatedTerminalIcon";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";
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
  onDeleteWorktree: () => void;
  isDragging?: boolean;
  isDraggingAnything?: boolean;
  isDone?: boolean;
  updatedAt: string;
  onContextMenu?: React.MouseEventHandler | undefined;
}) {
  const { t } = useLingui();
  const hiddenPanelButtonClass =
    "w-0 -mr-[3px] overflow-hidden p-0 opacity-0 pointer-events-none group-hover:w-[18px] group-hover:mr-0 group-hover:p-0.5 group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:w-[18px] focus-visible:mr-0 focus-visible:p-0.5 focus-visible:opacity-100 focus-visible:pointer-events-auto";

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
      tooltip={t`Worktree: ${props.worktreeBranch}`}
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
          <SyncBadge projectId={props.projectId} worktreePath={props.worktreePath} />
          <GitBadge
            projectId={props.projectId}
            projectName={props.worktreeBranch}
            worktreePath={props.worktreePath}
            onPress={props.onOpenGitReview}
            isActive={props.isActiveGit}
          />
          <span className="relative w-[2.4ch] shrink-0">
            <RelativeTime
              iso={props.updatedAt}
              className="block text-center font-mono text-[10px] tabular-nums text-muted group-hover:invisible"
            />
            <div
              role="button"
              tabIndex={0}
              aria-label={t`Delete worktree ${props.worktreeBranch}`}
              className="absolute inset-0 flex items-center justify-center rounded text-muted/55 opacity-0 transition hover:text-danger group-hover:opacity-100"
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
          </span>
        </>
      }
    />
  );
}
