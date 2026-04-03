import { Tooltip } from "@heroui/react";
import {
  ChevronRight,
  Columns2,
  Download,
  FileDiff,
  GitFork,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { TuxIcon } from "../common/TuxIcon";
import { useEffect, useRef, useState, type DragEvent } from "react";
import type { Project, Thread } from "../../../shared/contracts";
import { useAppStore } from "../../state/appStore";
import { isReorderNoOp, type ReorderPlacement } from "../../state/reorder";
import { ContextMenu, SidebarButton } from "../common";
import { useSidebar } from "../layout/AppShell";
import { isWindows, readBridge } from "../../bridge";
import { useUpdateStore } from "../../state/updateStore";
import { ProviderIcon, getStatusTone } from "../providers";
import { GitBadge } from "./GitBadge";
import { groupThreadsByWorktree } from "./groupThreadsByWorktree";
import { WorktreeGroupHeader } from "./WorktreeGroupHeader";

type SidebarDragItem =
  | { type: "project"; id: string }
  | { type: "thread"; id: string; projectId: string }
  | { type: "worktree-group"; worktreePath: string; projectId: string; threadIds: string[] };

type SidebarDropIndicator =
  | { type: "project"; id: string; placement: ReorderPlacement }
  | { type: "thread"; id: string; projectId: string; placement: ReorderPlacement }
  | {
      type: "worktree-group";
      worktreePath: string;
      projectId: string;
      placement: ReorderPlacement;
    };

function formatProjectLocation(project: Project): string {
  if (project.location.kind === "wsl")
    return `${project.location.distro}:${project.location.linuxPath}`;
  return project.location.path;
}

function formatRelativeTime(iso: string): string {
  const deltaMinutes = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));

  if (deltaMinutes < 60) {
    return `${deltaMinutes}m`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h`;
  }

  return `${Math.floor(deltaHours / 24)}d`;
}

function InlineRenameInput(props: {
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(props.initialValue);
  const committedRef = useRef(false);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  function commit() {
    if (committedRef.current) return;
    committedRef.current = true;
    const trimmed = value.trim();
    if (trimmed && trimmed !== props.initialValue) {
      props.onCommit(trimmed);
    } else {
      props.onCancel();
    }
  }

  return (
    <input
      ref={inputRef}
      aria-label="Rename thread"
      className="block w-full bg-transparent text-[inherit] leading-[inherit] outline-none"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          committedRef.current = true;
          props.onCancel();
        }
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function getDropPlacement(event: DragEvent<HTMLElement>): ReorderPlacement {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function renderDropIndicator(position: ReorderPlacement) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-accent ${
        position === "before" ? "top-0" : "bottom-0"
      }`}
    />
  );
}

function UpdateButtons(props: { iconOnly?: boolean }) {
  const { iconOnly = false } = props;
  const updatePhase = useUpdateStore((s) => s.phase);
  const updateVersion = useUpdateStore((s) => s.version);
  const downloadPercent = useUpdateStore((s) => s.downloadPercent);

  if (
    updatePhase !== "available" &&
    updatePhase !== "downloading" &&
    updatePhase !== "downloaded"
  ) {
    return null;
  }

  if (updatePhase === "available") {
    return (
      <SidebarButton
        iconOnly={iconOnly}
        icon={<Download className="size-4 text-accent" />}
        label={`Update to v${updateVersion}`}
        onPress={() => void readBridge().startUpdateDownload()}
      />
    );
  }

  if (updatePhase === "downloading") {
    if (iconOnly) {
      return (
        <Tooltip delay={150}>
          <Tooltip.Trigger>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center">
              <Download className="size-4 animate-pulse text-accent" />
            </div>
          </Tooltip.Trigger>
          <Tooltip.Content placement="right">
            Downloading {Math.round(downloadPercent)}%
          </Tooltip.Content>
        </Tooltip>
      );
    }

    return (
      <div className="flex w-full items-center gap-2 rounded-3xl px-3 py-1.5 text-sm text-muted">
        <Download className="size-4 shrink-0 animate-pulse text-accent" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate">Downloading update…</span>
          <div className="h-1 w-full rounded-full bg-white/10">
            <div
              className="h-1 rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${Math.round(downloadPercent)}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // downloaded
  return (
    <SidebarButton
      iconOnly={iconOnly}
      icon={<RefreshCw className="size-4 text-accent" />}
      label="Restart to update"
      onPress={() => void readBridge().installUpdate()}
    />
  );
}

function ThreadIcon(props: { thread: Thread }) {
  return (
    <ProviderIcon
      kind={props.thread.agentKind}
      tone={getStatusTone(props.thread)}
      className="size-3.5"
    />
  );
}

export function Sidebar(props: {
  projects: Project[];
  currentProjectId: string | undefined;
  currentThreadIds: string[];
  onOpenNewThread: (projectId?: string) => void;
  onOpenThread: (threadId: string) => void;
  onOpenThreadSideBySide: (threadId: string) => void;
  onReplaceSecondPane: (threadId: string) => void;
  onRenameThread: (threadId: string, title: string) => void;
  onDeleteThread: (threadId: string, worktreePath?: string, projectId?: string) => void;
  onDeleteProject: (projectId: string) => void;
  onDeleteWorktreeGroup: (projectId: string, worktreePath: string, threadIds: string[]) => void;
  onOpenSettings: () => void;
  onOpenTerminal: (projectId: string) => void;
  onOpenWorktreeTerminal: (projectId: string, worktreePath: string) => void;
  onOpenGitReview: (projectId: string, worktreePath?: string) => void;
  terminalProjectIds: string[];
  activeTerminalProjectId: string | null;
  activeWorktreeTerminalPaths: string[];
  activeWorktreeTerminalPath: string | null;
  onReorderProjects: (
    sourceProjectId: string,
    targetProjectId: string,
    placement: ReorderPlacement,
  ) => void;
  onReorderThreads: (
    sourceThreadId: string,
    targetThreadId: string,
    placement: ReorderPlacement,
  ) => void;
  onReorderThreadBlock: (blockIds: string[], targetId: string, placement: ReorderPlacement) => void;
}) {
  const threads = useAppStore((state) => state.threads);
  const {
    projects,
    currentProjectId,
    currentThreadIds,
    onOpenNewThread,
    onOpenThread,
    onOpenThreadSideBySide,
    onReplaceSecondPane,
    onRenameThread,
    onDeleteThread,
    onDeleteProject,
    onDeleteWorktreeGroup,
    onOpenSettings,
    onOpenTerminal,
    onOpenWorktreeTerminal,
    onOpenGitReview,
    terminalProjectIds,
    activeTerminalProjectId,
    activeWorktreeTerminalPaths,
    activeWorktreeTerminalPath,
    onReorderProjects,
    onReorderThreads,
    onReorderThreadBlock,
  } = props;

  const { isCollapsed, collapse, expand } = useSidebar();
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [collapsedWorktrees, setCollapsedWorktrees] = useState<Record<string, boolean>>({});
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<SidebarDragItem>();
  const [dropIndicator, setDropIndicator] = useState<SidebarDropIndicator>();
  const projectIds = projects.map((project) => project.id);

  useEffect(() => {
    if (!currentProjectId) {
      return;
    }

    setCollapsedProjects((current) => {
      if (!current[currentProjectId]) {
        return current;
      }

      return {
        ...current,
        [currentProjectId]: false,
      };
    });
  }, [currentProjectId]);

  // Auto-expand worktree group when a thread inside it becomes selected
  useEffect(() => {
    for (const threadId of currentThreadIds) {
      const thread = threads.find((t) => t.id === threadId);
      if (thread?.worktreePath) {
        setCollapsedWorktrees((prev) =>
          prev[thread.worktreePath!] ? { ...prev, [thread.worktreePath!]: false } : prev,
        );
        break;
      }
    }
    // Intentionally omitting collapsedWorktrees — only react to selection changes,
    // not manual collapse actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentThreadIds, threads]);

  const activeThreads = threads.filter((thread) => thread.status !== "inactive");

  return (
    <div className="relative h-full">
      {/* Collapsed icon rail overlay — width 48px, icons centered at 24px (pl-2 + w-8/2) */}
      {isCollapsed && (
        <div className="absolute inset-0 z-10 flex h-full min-h-0 flex-col items-start gap-3 pl-2 pb-1 pt-0">
          {/* Thread icons — only active threads */}
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {activeThreads.map((thread) => (
              <SidebarButton
                key={thread.id}
                iconOnly
                icon={<ThreadIcon thread={thread} />}
                label={thread.title}
                isActive={currentThreadIds.includes(thread.id)}
                onPress={() => onOpenThread(thread.id)}
              />
            ))}
          </div>

          {/* Footer icons */}
          <div className="space-y-1 border-t border-white/6 pt-2 pr-2">
            <UpdateButtons iconOnly />
            <SidebarButton
              iconOnly
              icon={<Settings2 className="size-4" />}
              label="Settings"
              onPress={onOpenSettings}
            />
            <SidebarButton
              iconOnly
              icon={<PanelLeft className="size-4" />}
              label="Show sidebar"
              onPress={expand}
            />
          </div>
        </div>
      )}

      {/* Full expanded sidebar — icons centered at 24px (branding px-3 + w-6/2, buttons px-4 + w-4/2) */}
      <div
        className={`flex h-full min-h-0 flex-col gap-3 px-3 pb-1 pt-0 transition-opacity duration-150 ${isCollapsed ? "invisible opacity-0" : "opacity-100 delay-100"}`}
      >
        <div
          className={`min-h-0 flex-1 overflow-y-auto px-0 -mr-3 [scrollbar-gutter:stable] ${!isWindows() ? "pr-3" : ""}`}
        >
          {projects.length === 0 ? (
            <div className="pt-4">
              <p className="text-center text-sm text-muted">Add a project to start</p>
            </div>
          ) : (
            <div className="space-y-4">
              {projects.map((project) => {
                const projectThreads = threads.filter((thread) => thread.projectId === project.id);
                const isProjectCollapsed = collapsedProjects[project.id] ?? false;
                const isDraggedProject = dragItem?.type === "project" && dragItem.id === project.id;
                const projectIndicator =
                  dropIndicator?.type === "project" && dropIndicator.id === project.id
                    ? dropIndicator
                    : undefined;
                const projectLocation = formatProjectLocation(project);

                return (
                  <section
                    key={project.id}
                    className={`relative space-y-0.5 ${isDraggedProject ? "opacity-60" : ""}`}
                  >
                    {projectIndicator ? renderDropIndicator(projectIndicator.placement) : null}

                    <ContextMenu
                      items={[
                        {
                          id: "remove-project",
                          label: "Remove Project",
                          icon: <Trash2 className="size-3.5" />,
                          variant: "danger",
                        },
                      ]}
                      onAction={(key) => {
                        if (key === "remove-project") onDeleteProject(project.id);
                      }}
                    >
                      <SidebarButton
                        icon={
                          <ChevronRight
                            className={`size-3.5 shrink-0 text-muted transition-transform ${
                              isProjectCollapsed ? "" : "rotate-90"
                            }`}
                          />
                        }
                        label={
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-semibold text-foreground">
                              {project.name}
                            </span>
                            {project.location.kind === "wsl" && (
                              <TuxIcon className="h-3 w-auto shrink-0 text-muted/60" />
                            )}
                          </span>
                        }
                        tooltip={projectLocation}
                        className={isDraggedProject ? "opacity-60" : ""}
                        onPress={() =>
                          setCollapsedProjects((current) => ({
                            ...current,
                            [project.id]: !isProjectCollapsed,
                          }))
                        }
                        onDragOver={(event) => {
                          if (
                            !dragItem ||
                            dragItem.type !== "project" ||
                            dragItem.id === project.id
                          ) {
                            return;
                          }

                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          const placement = getDropPlacement(event);

                          if (isReorderNoOp(projectIds, dragItem.id, project.id, placement)) {
                            setDropIndicator(undefined);
                            return;
                          }

                          setDropIndicator({
                            type: "project",
                            id: project.id,
                            placement,
                          });
                        }}
                        onDrop={(event) => {
                          if (
                            !dragItem ||
                            dragItem.type !== "project" ||
                            dragItem.id === project.id
                          ) {
                            return;
                          }

                          event.preventDefault();
                          const placement = getDropPlacement(event);

                          if (isReorderNoOp(projectIds, dragItem.id, project.id, placement)) {
                            setDragItem(undefined);
                            setDropIndicator(undefined);
                            return;
                          }

                          onReorderProjects(dragItem.id, project.id, placement);
                          setDragItem(undefined);
                          setDropIndicator(undefined);
                        }}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", project.id);
                          setDragItem({ type: "project", id: project.id });
                          setDropIndicator(undefined);
                        }}
                        onDragEnd={() => {
                          setDragItem(undefined);
                          setDropIndicator(undefined);
                        }}
                        isDragging={isDraggedProject}
                        dragLabel={`Reorder ${project.name}`}
                        suffix={
                          <>
                            <GitBadge
                              projectId={project.id}
                              projectName={project.name}
                              onPress={() => onOpenGitReview(project.id)}
                            />
                            <div
                              role="button"
                              tabIndex={0}
                              aria-label={`Terminal for ${project.name}`}
                              className={`shrink-0 cursor-default rounded p-0.5 transition-colors hover:bg-white/[0.04] hover:text-foreground ${
                                activeTerminalProjectId === project.id
                                  ? "text-accent"
                                  : terminalProjectIds.includes(project.id)
                                    ? "text-foreground"
                                    : "text-muted/60"
                              }`}
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpenTerminal(project.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.stopPropagation();
                                  onOpenTerminal(project.id);
                                }
                              }}
                            >
                              <TerminalSquare className="size-3.5" />
                            </div>
                          </>
                        }
                      />
                    </ContextMenu>

                    {!isProjectCollapsed ? (
                      <div className="space-y-0.5 pl-3">
                        <SidebarButton
                          icon={<Plus className="size-4" />}
                          label="New thread"
                          isActive={
                            currentProjectId === project.id && currentThreadIds.length === 0
                          }
                          onPress={() => onOpenNewThread(project.id)}
                        />

                        {(() => {
                          const entries = groupThreadsByWorktree(projectThreads);
                          const allThreadIds = projectThreads.map((t) => t.id);

                          function handleThreadDragOver(
                            thread: Thread,
                            event: DragEvent<HTMLButtonElement>,
                          ) {
                            if (!dragItem || dragItem.type === "project") return;
                            if (dragItem.projectId !== project.id) return;

                            if (dragItem.type === "thread") {
                              if (dragItem.id === thread.id) return;
                              // Reject cross-worktree thread drag
                              const sourceThread = threads.find((t) => t.id === dragItem.id);
                              if (sourceThread?.worktreePath !== thread.worktreePath) return;

                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                              const placement = getDropPlacement(event);
                              if (isReorderNoOp(allThreadIds, dragItem.id, thread.id, placement)) {
                                setDropIndicator(undefined);
                                return;
                              }
                              setDropIndicator({
                                type: "thread",
                                id: thread.id,
                                projectId: project.id,
                                placement,
                              });
                            } else if (dragItem.type === "worktree-group") {
                              // Group dragged over an ungrouped thread
                              if (dragItem.threadIds.includes(thread.id)) return;
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                              setDropIndicator({
                                type: "thread",
                                id: thread.id,
                                projectId: project.id,
                                placement: getDropPlacement(event),
                              });
                            }
                          }

                          function handleThreadDrop(
                            thread: Thread,
                            event: DragEvent<HTMLButtonElement>,
                          ) {
                            if (!dragItem || dragItem.type === "project") return;
                            if (dragItem.projectId !== project.id) return;

                            if (dragItem.type === "thread") {
                              if (dragItem.id === thread.id) return;
                              const sourceThread = threads.find((t) => t.id === dragItem.id);
                              if (sourceThread?.worktreePath !== thread.worktreePath) return;

                              event.preventDefault();
                              const placement = getDropPlacement(event);
                              if (isReorderNoOp(allThreadIds, dragItem.id, thread.id, placement)) {
                                setDragItem(undefined);
                                setDropIndicator(undefined);
                                return;
                              }
                              onReorderThreads(dragItem.id, thread.id, placement);
                            } else if (dragItem.type === "worktree-group") {
                              if (dragItem.threadIds.includes(thread.id)) return;
                              event.preventDefault();
                              onReorderThreadBlock(
                                dragItem.threadIds,
                                thread.id,
                                getDropPlacement(event),
                              );
                            }

                            setDragItem(undefined);
                            setDropIndicator(undefined);
                          }

                          function renderThreadItem(thread: Thread, showWorktreeBadge: boolean) {
                            const isCurrentThread = currentThreadIds.includes(thread.id);
                            const isDraggedThread =
                              dragItem?.type === "thread" && dragItem.id === thread.id;
                            const statusTone = getStatusTone(thread);
                            const threadIndicator =
                              dropIndicator?.type === "thread" && dropIndicator.id === thread.id
                                ? dropIndicator
                                : undefined;

                            return (
                              <div key={thread.id} className="relative">
                                {threadIndicator
                                  ? renderDropIndicator(threadIndicator.placement)
                                  : null}

                                <ContextMenu
                                  items={[
                                    ...(thread.worktreePath
                                      ? [
                                          {
                                            id: "git-review",
                                            label: "Git Review",
                                            icon: <FileDiff className="size-3.5" />,
                                          },
                                        ]
                                      : []),
                                    {
                                      id: "rename",
                                      label: "Rename",
                                      icon: <Pencil className="size-3.5" />,
                                    },
                                    ...(currentThreadIds.length >= 2
                                      ? [
                                          {
                                            id: "replace-second",
                                            label: "Replace 2nd",
                                            icon: <Columns2 className="size-3.5" />,
                                            isDisabled: currentThreadIds.includes(thread.id),
                                          },
                                        ]
                                      : []),
                                    {
                                      id: "open-side",
                                      label:
                                        currentThreadIds.length >= 2
                                          ? "Open 3rd"
                                          : "Open Side by Side",
                                      icon: <Columns2 className="size-3.5" />,
                                      isDisabled:
                                        currentThreadIds.includes(thread.id) ||
                                        currentThreadIds.length >= 3,
                                    },
                                    {
                                      id: "delete",
                                      label: "Delete Thread",
                                      icon: <Trash2 className="size-3.5" />,
                                      variant: "danger",
                                    },
                                  ]}
                                  onAction={(key) => {
                                    if (key === "git-review")
                                      onOpenGitReview(thread.projectId, thread.worktreePath);
                                    if (key === "rename") setEditingThreadId(thread.id);
                                    if (key === "replace-second") onReplaceSecondPane(thread.id);
                                    if (key === "open-side") onOpenThreadSideBySide(thread.id);
                                    if (key === "delete")
                                      onDeleteThread(
                                        thread.id,
                                        thread.worktreePath,
                                        thread.projectId,
                                      );
                                  }}
                                >
                                  <SidebarButton
                                    icon={
                                      <ProviderIcon
                                        kind={thread.agentKind}
                                        tone={statusTone}
                                        className="size-3.5 shrink-0"
                                      />
                                    }
                                    label={
                                      editingThreadId === thread.id ? (
                                        <InlineRenameInput
                                          initialValue={thread.title}
                                          onCommit={(newTitle) => {
                                            onRenameThread(thread.id, newTitle);
                                            setEditingThreadId(null);
                                          }}
                                          onCancel={() => setEditingThreadId(null)}
                                        />
                                      ) : (
                                        thread.title
                                      )
                                    }
                                    tooltip={
                                      editingThreadId === thread.id ? undefined : thread.title
                                    }
                                    isActive={isCurrentThread}
                                    className={isDraggedThread ? "opacity-60" : ""}
                                    onPress={() => onOpenThread(thread.id)}
                                    onDoubleClick={() => setEditingThreadId(thread.id)}
                                    onDragOver={(event) => handleThreadDragOver(thread, event)}
                                    onDrop={(event) => handleThreadDrop(thread, event)}
                                    onDragStart={(event) => {
                                      event.dataTransfer.effectAllowed = "move";
                                      event.dataTransfer.setData("text/plain", thread.id);
                                      event.dataTransfer.setData(
                                        "application/x-lightcode-sidebar-thread",
                                        thread.id,
                                      );
                                      setDragItem({
                                        type: "thread",
                                        id: thread.id,
                                        projectId: project.id,
                                      });
                                      setDropIndicator(undefined);
                                    }}
                                    onDragEnd={() => {
                                      setDragItem(undefined);
                                      setDropIndicator(undefined);
                                    }}
                                    isDragging={isDraggedThread}
                                    dragLabel={`Reorder ${thread.title}`}
                                    suffix={
                                      <>
                                        {showWorktreeBadge && thread.worktreePath && (
                                          <>
                                            <Tooltip delay={150}>
                                              <Tooltip.Trigger>
                                                <div className="flex shrink-0 items-center">
                                                  <GitFork className="size-3 text-muted/60" />
                                                </div>
                                              </Tooltip.Trigger>
                                              <Tooltip.Content placement="right">
                                                Worktree: {thread.worktreeBranch}
                                              </Tooltip.Content>
                                            </Tooltip>
                                            <GitBadge
                                              projectId={thread.projectId}
                                              projectName={thread.title}
                                              worktreePath={thread.worktreePath}
                                              onPress={() =>
                                                onOpenGitReview(
                                                  thread.projectId,
                                                  thread.worktreePath,
                                                )
                                              }
                                            />
                                            <div
                                              role="button"
                                              tabIndex={0}
                                              aria-label={`Terminal for ${thread.worktreeBranch}`}
                                              className={`shrink-0 cursor-default rounded p-0.5 transition-colors hover:bg-white/[0.04] hover:text-foreground ${
                                                activeWorktreeTerminalPath === thread.worktreePath
                                                  ? "text-accent"
                                                  : activeWorktreeTerminalPaths.includes(
                                                        thread.worktreePath,
                                                      )
                                                    ? "text-foreground"
                                                    : "text-muted/60"
                                              }`}
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                onOpenWorktreeTerminal(
                                                  thread.projectId,
                                                  thread.worktreePath!,
                                                );
                                              }}
                                              onKeyDown={(event) => {
                                                if (event.key === "Enter" || event.key === " ") {
                                                  event.stopPropagation();
                                                  onOpenWorktreeTerminal(
                                                    thread.projectId,
                                                    thread.worktreePath!,
                                                  );
                                                }
                                              }}
                                            >
                                              <TerminalSquare className="size-3.5" />
                                            </div>
                                          </>
                                        )}
                                        <span className="relative w-[2.4ch] shrink-0">
                                          <span className="block text-center font-mono text-[10px] tabular-nums text-muted group-hover:invisible">
                                            {formatRelativeTime(thread.updatedAt)}
                                          </span>
                                          <div
                                            role="button"
                                            tabIndex={0}
                                            aria-label={`Delete ${thread.title}`}
                                            className="absolute inset-0 flex items-center justify-center rounded text-muted/55 opacity-0 transition hover:text-danger group-hover:opacity-100"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              onDeleteThread(
                                                thread.id,
                                                thread.worktreePath,
                                                thread.projectId,
                                              );
                                            }}
                                            onKeyDown={(event) => {
                                              if (event.key === "Enter" || event.key === " ") {
                                                event.stopPropagation();
                                                onDeleteThread(
                                                  thread.id,
                                                  thread.worktreePath,
                                                  thread.projectId,
                                                );
                                              }
                                            }}
                                          >
                                            <Trash2 className="size-3.5" />
                                          </div>
                                        </span>
                                      </>
                                    }
                                  />
                                </ContextMenu>
                              </div>
                            );
                          }

                          return entries.map((entry) => {
                            if (entry.kind === "thread") {
                              return renderThreadItem(entry.thread, true);
                            }

                            const { group } = entry;
                            const isGroupCollapsed =
                              collapsedWorktrees[group.worktreePath] ?? false;
                            const isDraggedGroup =
                              dragItem?.type === "worktree-group" &&
                              dragItem.worktreePath === group.worktreePath;
                            const groupIndicator =
                              dropIndicator?.type === "worktree-group" &&
                              dropIndicator.worktreePath === group.worktreePath
                                ? dropIndicator
                                : undefined;
                            const groupThreadIds = group.threads.map((t) => t.id);

                            return (
                              <div
                                key={group.worktreePath}
                                className={`relative space-y-0.5 ${isDraggedGroup ? "opacity-60" : ""}`}
                              >
                                {groupIndicator
                                  ? renderDropIndicator(groupIndicator.placement)
                                  : null}
                                <ContextMenu
                                  items={[
                                    {
                                      id: "git-review",
                                      label: "Git Review",
                                      icon: <FileDiff className="size-3.5" />,
                                    },
                                    {
                                      id: "delete-worktree",
                                      label: "Delete Worktree",
                                      icon: <Trash2 className="size-3.5" />,
                                      variant: "danger",
                                    },
                                  ]}
                                  onAction={(key) => {
                                    if (key === "git-review") {
                                      onOpenGitReview(project.id, group.worktreePath);
                                    }
                                    if (key === "delete-worktree") {
                                      onDeleteWorktreeGroup(
                                        project.id,
                                        group.worktreePath,
                                        groupThreadIds,
                                      );
                                    }
                                  }}
                                >
                                  <WorktreeGroupHeader
                                    worktreePath={group.worktreePath}
                                    worktreeBranch={group.worktreeBranch}
                                    projectId={project.id}
                                    isCollapsed={isGroupCollapsed}
                                    hasTerminal={activeWorktreeTerminalPaths.includes(
                                      group.worktreePath,
                                    )}
                                    isActiveTerminal={
                                      activeWorktreeTerminalPath === group.worktreePath
                                    }
                                    onToggleCollapse={() =>
                                      setCollapsedWorktrees((prev) => ({
                                        ...prev,
                                        [group.worktreePath]: !isGroupCollapsed,
                                      }))
                                    }
                                    onOpenGitReview={() =>
                                      onOpenGitReview(project.id, group.worktreePath)
                                    }
                                    onOpenTerminal={() =>
                                      onOpenWorktreeTerminal(project.id, group.worktreePath)
                                    }
                                    isDragging={isDraggedGroup}
                                    onDragStart={(event) => {
                                      event.dataTransfer.effectAllowed = "move";
                                      event.dataTransfer.setData("text/plain", group.worktreePath);
                                      setDragItem({
                                        type: "worktree-group",
                                        worktreePath: group.worktreePath,
                                        projectId: project.id,
                                        threadIds: groupThreadIds,
                                      });
                                      setDropIndicator(undefined);
                                    }}
                                    onDragEnd={() => {
                                      setDragItem(undefined);
                                      setDropIndicator(undefined);
                                    }}
                                    onDragOver={(event) => {
                                      if (!dragItem || dragItem.type === "project") return;
                                      if (dragItem.projectId !== project.id) return;
                                      if (
                                        dragItem.type === "worktree-group" &&
                                        dragItem.worktreePath === group.worktreePath
                                      )
                                        return;
                                      // Reject thread drags onto group headers
                                      // (threads reorder within their own scope)
                                      if (dragItem.type === "thread") return;

                                      event.preventDefault();
                                      event.dataTransfer.dropEffect = "move";
                                      setDropIndicator({
                                        type: "worktree-group",
                                        worktreePath: group.worktreePath,
                                        projectId: project.id,
                                        placement: getDropPlacement(event),
                                      });
                                    }}
                                    onDrop={(event) => {
                                      if (!dragItem || dragItem.type === "project") return;
                                      if (dragItem.projectId !== project.id) return;
                                      if (dragItem.type !== "worktree-group") return;
                                      if (dragItem.worktreePath === group.worktreePath) return;

                                      event.preventDefault();
                                      const placement = getDropPlacement(event);
                                      // Drop relative to first/last thread of target group
                                      const anchorId =
                                        placement === "before"
                                          ? groupThreadIds[0]!
                                          : groupThreadIds.at(-1)!;
                                      onReorderThreadBlock(dragItem.threadIds, anchorId, placement);
                                      setDragItem(undefined);
                                      setDropIndicator(undefined);
                                    }}
                                  />
                                </ContextMenu>
                                {!isGroupCollapsed && (
                                  <div className="space-y-0.5 pl-2">
                                    {group.threads.map((thread) => renderThreadItem(thread, false))}
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-1 border-t border-white/6 pt-2">
          <UpdateButtons />
          <SidebarButton
            icon={<Settings2 className="size-4" />}
            label="Settings"
            onPress={onOpenSettings}
          />
          <SidebarButton
            icon={<PanelLeftClose className="size-4" />}
            label="Hide sidebar"
            onPress={collapse}
          />
        </div>
      </div>
    </div>
  );
}
