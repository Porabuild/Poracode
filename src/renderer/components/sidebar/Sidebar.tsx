import { Tooltip } from "@heroui/react";
import {
  ChevronRight,
  Columns2,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Monitor,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Settings2,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type DragEvent } from "react";
import type { EnvironmentMode, Project, Thread } from "../../../shared/contracts";
import { isReorderNoOp, type ReorderPlacement } from "../../state/reorder";
import { Button, ContextMenu } from "../common";
import { useSidebar } from "../layout/AppShell";
import { ClaudeIcon, CodexStatusIcon, getStatusTone } from "../providers";

type SidebarDragItem =
  | { type: "project"; id: string }
  | { type: "thread"; id: string; projectId: string };

type SidebarDropIndicator =
  | { type: "project"; id: string; placement: ReorderPlacement }
  | { type: "thread"; id: string; projectId: string; placement: ReorderPlacement };

function formatProjectLocation(project: Project): string {
  return project.location.kind === "windows"
    ? project.location.path
    : `${project.location.distro}:${project.location.linuxPath}`;
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

function SidebarButton(props: {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  isDisabled?: boolean;
  isActive?: boolean;
  iconOnly?: boolean;
}) {
  const { icon, label, onPress, isDisabled = false, isActive = false, iconOnly = false } = props;

  const stateClass = isDisabled
    ? "cursor-not-allowed text-muted/40"
    : isActive
      ? "bg-white/[0.08] text-foreground"
      : "text-muted hover:bg-white/[0.04] hover:text-foreground";

  if (iconOnly) {
    return (
      <Tooltip delay={150}>
        <Tooltip.Trigger>
          <button
            className={`flex h-8 w-8 shrink-0 cursor-default items-center justify-center rounded-3xl transition-colors ${stateClass}`}
            disabled={isDisabled}
            onClick={onPress}
            type="button"
          >
            {icon}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content placement="right">{label}</Tooltip.Content>
      </Tooltip>
    );
  }

  return (
    <button
      className={`flex w-full cursor-default items-center gap-2 rounded-3xl px-4 py-1.5 text-left text-sm transition-colors ${stateClass}`}
      disabled={isDisabled}
      onClick={onPress}
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ThreadIcon(props: { thread: Thread }) {
  const { thread } = props;
  const tone = getStatusTone(thread);
  if (thread.agentKind === "codex") {
    return <CodexStatusIcon className="size-3.5" tone={tone} />;
  }
  if (thread.agentKind === "claude") {
    return <ClaudeIcon className="size-3.5" tone={tone} />;
  }
  return null;
}

export function Sidebar(props: {
  projects: Project[];
  threads: Thread[];
  currentProjectId: string | undefined;
  currentThreadIds: string[];
  environmentMode: EnvironmentMode;
  wslAvailable: boolean;
  onOpenNewThread: (projectId?: string) => void;
  onAddProject: () => void;
  onSwitchMode: () => void;
  onOpenThread: (threadId: string) => void;
  onOpenThreadSideBySide: (threadId: string) => void;
  onReplaceSecondPane: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onOpenHome: () => void;
  onOpenSettings: () => void;
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
}) {
  const {
    projects,
    threads,
    currentProjectId,
    currentThreadIds,
    environmentMode,
    wslAvailable,
    onOpenNewThread,
    onAddProject,
    onSwitchMode,
    onOpenThread,
    onOpenThreadSideBySide,
    onReplaceSecondPane,
    onDeleteThread,
    onOpenHome,
    onOpenSettings,
    onReorderProjects,
    onReorderThreads,
  } = props;

  const { isCollapsed, collapse, expand } = useSidebar();
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
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

  const activeThreads = threads.filter((thread) => thread.status !== "inactive");

  const switchModeLabel = environmentMode === "windows" ? "Switch to WSL" : "Switch to Windows";
  const switchModeIcon =
    environmentMode === "windows" ? (
      <TerminalSquare className="size-4" />
    ) : (
      <Monitor className="size-4" />
    );

  return (
    <div className="relative h-full">
      {/* Collapsed icon rail overlay — width 48px, icons centered at 24px (pl-2 + w-8/2) */}
      {isCollapsed && (
        <div className="absolute inset-0 z-10 flex h-full min-h-0 flex-col items-start gap-3 pl-2 pb-1 pt-0">
        {/* App icon — centered at 24px (pl-2 + w-8/2) */}
        <Tooltip delay={150}>
          <Tooltip.Trigger>
            <button
              className="flex h-11 w-8 cursor-default items-center justify-center transition-colors hover:bg-white/[0.04] rounded-3xl"
              onClick={onOpenHome}
              type="button"
            >
              <div className="flex size-6 items-center justify-center rounded-full border border-white/8 bg-white/[0.03]">
                <div className="size-2.5 rounded-full border border-white/70" />
              </div>
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content placement="right">Lightcode</Tooltip.Content>
        </Tooltip>

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
          {environmentMode === "windows" && !wslAvailable ? (
            <SidebarButton
              iconOnly
              isDisabled
              icon={<TerminalSquare className="size-4" />}
              label="No WSL distros detected"
            />
          ) : (
            <SidebarButton
              iconOnly
              icon={switchModeIcon}
              label={switchModeLabel}
              onPress={onSwitchMode}
            />
          )}
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
      <div className={`flex h-full min-h-0 flex-col gap-3 px-3 pb-1 pt-0 transition-opacity duration-150 ${isCollapsed ? "invisible opacity-0" : "opacity-100 delay-100"}`}
      >
        <div className="space-y-1">
          <button
            className="flex h-11 w-full cursor-default items-center gap-2.5 rounded-3xl px-3 text-left transition-colors hover:bg-white/[0.04]"
            onClick={onOpenHome}
            type="button"
          >
            <div className="flex size-6 items-center justify-center rounded-full border border-white/8 bg-white/[0.03]">
              <div className="size-2.5 rounded-full border border-white/70" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight text-foreground">
                Lightcode
              </p>
              <p className="truncate text-xs text-muted leading-tight">Terminal-native threads</p>
            </div>
          </button>
        </div>

        <div className="flex items-center justify-between px-1.5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Threads</p>
          <Button
            isIconOnly
            aria-label="Add project"
            className="rounded-3xl text-muted hover:bg-white/[0.05] hover:text-foreground"
            onPress={onAddProject}
            size="sm"
            variant="ghost"
          >
            <FolderPlus className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-1 pr-0.5">
          {projects.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-5">
              <p className="text-sm text-muted">
                Add a project to start a real terminal-backed thread.
              </p>
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

                    <div
                      className="flex items-center gap-2 rounded-3xl px-3 py-1.5 transition-colors hover:bg-white/[0.03]"
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
                    >
                      <button
                        className="min-w-0 flex-1 cursor-default text-left"
                        onClick={() =>
                          setCollapsedProjects((current) => ({
                            ...current,
                            [project.id]: !isProjectCollapsed,
                          }))
                        }
                        type="button"
                      >
                        <div className="flex items-center gap-2">
                          <ChevronRight
                            className={`size-3.5 shrink-0 text-muted transition-transform ${
                              isProjectCollapsed ? "" : "rotate-90"
                            }`}
                          />
                          <Tooltip delay={250}>
                            <Tooltip.Trigger className="inline-flex shrink-0 items-center">
                              <span className="inline-flex shrink-0 items-center">
                                <FolderOpen className="size-4 text-muted" />
                              </span>
                            </Tooltip.Trigger>
                            <Tooltip.Content showArrow className="max-w-[28rem] break-all text-xs">
                              {projectLocation}
                            </Tooltip.Content>
                          </Tooltip>
                          <h2 className="truncate text-base font-semibold text-foreground">
                            {project.name}
                          </h2>
                        </div>
                      </button>

                      <div className="flex shrink-0 items-center self-center">
                        <button
                          aria-grabbed={isDraggedProject}
                          aria-label={`Reorder ${project.name}`}
                          className="shrink-0 cursor-grab rounded text-muted/60 active:cursor-grabbing"
                          draggable
                          onDragEnd={() => {
                            setDragItem(undefined);
                            setDropIndicator(undefined);
                          }}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", project.id);
                            setDragItem({ type: "project", id: project.id });
                            setDropIndicator(undefined);
                          }}
                          type="button"
                        >
                          <GripVertical className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    {!isProjectCollapsed ? (
                      <div className="space-y-0.5 pl-4">
                        <SidebarButton
                          icon={<Plus className="size-4" />}
                          label="New thread"
                          onPress={() => onOpenNewThread(project.id)}
                        />

                        {projectThreads.map((thread) => {
                          const isCurrentThread = currentThreadIds.includes(thread.id);
                          const isDraggedThread =
                            dragItem?.type === "thread" && dragItem.id === thread.id;
                          const statusTone = getStatusTone(thread);
                          const threadIndicator =
                            dropIndicator?.type === "thread" && dropIndicator.id === thread.id
                              ? dropIndicator
                              : undefined;
                          const projectThreadIds = projectThreads.map(
                            (projectThread) => projectThread.id,
                          );

                          return (
                            <div key={thread.id} className="relative">
                              {threadIndicator
                                ? renderDropIndicator(threadIndicator.placement)
                                : null}

                              <ContextMenu
                                items={[
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
                                  if (key === "replace-second") onReplaceSecondPane(thread.id);
                                  if (key === "open-side") onOpenThreadSideBySide(thread.id);
                                  if (key === "delete") onDeleteThread(thread.id);
                                }}
                              >
                                <button
                                  type="button"
                                  className={`group flex w-full cursor-default items-center gap-2 rounded-3xl border-none bg-transparent px-2.5 py-1.5 text-left transition-colors ${
                                    isCurrentThread
                                      ? "bg-white/[0.08] text-foreground"
                                      : "text-muted hover:bg-white/[0.04] hover:text-foreground"
                                  } ${isDraggedThread ? "opacity-60" : ""}`}
                                  onClick={() => onOpenThread(thread.id)}
                                  onDragOver={(event) => {
                                    if (
                                      !dragItem ||
                                      dragItem.type !== "thread" ||
                                      dragItem.projectId !== project.id ||
                                      dragItem.id === thread.id
                                    ) {
                                      return;
                                    }

                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "move";
                                    const placement = getDropPlacement(event);

                                    if (
                                      isReorderNoOp(
                                        projectThreadIds,
                                        dragItem.id,
                                        thread.id,
                                        placement,
                                      )
                                    ) {
                                      setDropIndicator(undefined);
                                      return;
                                    }

                                    setDropIndicator({
                                      type: "thread",
                                      id: thread.id,
                                      projectId: project.id,
                                      placement,
                                    });
                                  }}
                                  onDrop={(event) => {
                                    if (
                                      !dragItem ||
                                      dragItem.type !== "thread" ||
                                      dragItem.projectId !== project.id ||
                                      dragItem.id === thread.id
                                    ) {
                                      return;
                                    }

                                    event.preventDefault();
                                    const placement = getDropPlacement(event);

                                    if (
                                      isReorderNoOp(
                                        projectThreadIds,
                                        dragItem.id,
                                        thread.id,
                                        placement,
                                      )
                                    ) {
                                      setDragItem(undefined);
                                      setDropIndicator(undefined);
                                      return;
                                    }

                                    onReorderThreads(dragItem.id, thread.id, placement);
                                    setDragItem(undefined);
                                    setDropIndicator(undefined);
                                  }}
                                >
                                  <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                    {thread.agentKind === "codex" ? (
                                      <CodexStatusIcon
                                        className="size-3.5 shrink-0"
                                        tone={statusTone}
                                      />
                                    ) : thread.agentKind === "claude" ? (
                                      <ClaudeIcon className="size-3.5 shrink-0" tone={statusTone} />
                                    ) : null}
                                    <p className="min-w-0 flex-1 truncate text-sm font-medium">
                                      {thread.title}
                                    </p>
                                  </div>
                                  <span className="relative shrink-0">
                                    <span className="text-[11px] text-muted group-hover:invisible">
                                      {formatRelativeTime(thread.updatedAt)}
                                    </span>
                                    <button
                                      aria-label={`Delete ${thread.title}`}
                                      className="absolute inset-0 flex items-center justify-center rounded text-muted/55 opacity-0 transition hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onDeleteThread(thread.id);
                                      }}
                                      type="button"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </button>
                                  </span>
                                  <button
                                    aria-grabbed={isDraggedThread}
                                    aria-label={`Reorder ${thread.title}`}
                                    className="shrink-0 cursor-grab rounded text-muted/60 active:cursor-grabbing"
                                    draggable
                                    onDragEnd={() => {
                                      setDragItem(undefined);
                                      setDropIndicator(undefined);
                                    }}
                                    onDragStart={(event) => {
                                      event.dataTransfer.effectAllowed = "move";
                                      event.dataTransfer.setData("text/plain", thread.id);
                                      setDragItem({
                                        type: "thread",
                                        id: thread.id,
                                        projectId: project.id,
                                      });
                                      setDropIndicator(undefined);
                                    }}
                                    type="button"
                                  >
                                    <GripVertical className="size-3.5" />
                                  </button>
                                </button>
                              </ContextMenu>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-1 border-t border-white/6 pt-2">
          {environmentMode === "windows" && !wslAvailable ? (
            <Tooltip>
              <Tooltip.Trigger>
                <SidebarButton
                  isDisabled
                  icon={<TerminalSquare className="size-4" />}
                  label="Switch to WSL"
                />
              </Tooltip.Trigger>
              <Tooltip.Content>No WSL distros detected</Tooltip.Content>
            </Tooltip>
          ) : (
            <SidebarButton icon={switchModeIcon} label={switchModeLabel} onPress={onSwitchMode} />
          )}
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
