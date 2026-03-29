import { Dropdown, Label, Tooltip } from "@heroui/react";
import {
  ChevronRight,
  Columns2,
  Download,
  FolderPlus,
  GripVertical,
  Monitor,
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
import { isReorderNoOp, type ReorderPlacement } from "../../state/reorder";
import { Button, ContextMenu, SidebarButton } from "../common";
import { useSidebar } from "../layout/AppShell";
import { readBridge } from "../../bridge";
import { useUpdateStore } from "../../state/updateStore";
import { useGitStore } from "../../state/gitStore";
import { ProviderIcon, getStatusTone } from "../providers";

type SidebarDragItem =
  | { type: "project"; id: string }
  | { type: "thread"; id: string; projectId: string };

type SidebarDropIndicator =
  | { type: "project"; id: string; placement: ReorderPlacement }
  | { type: "thread"; id: string; projectId: string; placement: ReorderPlacement };

function GitBadge(props: { projectId: string; projectName: string; onPress: () => void }) {
  const gitStatus = useGitStore((s) => s.statuses[props.projectId]);
  if (!gitStatus?.isRepo || (gitStatus.totalInsertions === 0 && gitStatus.totalDeletions === 0))
    return null;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Git changes for ${props.projectName}`}
      className="shrink-0 cursor-default rounded px-1 py-0.5 transition-colors text-muted/60 hover:bg-white/[0.04] hover:text-foreground"
      onClick={(e) => {
        e.stopPropagation();
        props.onPress();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          props.onPress();
        }
      }}
    >
      <span className="flex items-center gap-0.5 text-[10px] font-medium">
        {gitStatus.totalInsertions > 0 && (
          <span className="text-success">+{gitStatus.totalInsertions}</span>
        )}
        {gitStatus.totalDeletions > 0 && (
          <span className="text-danger">-{gitStatus.totalDeletions}</span>
        )}
      </span>
    </div>
  );
}

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
      <div className="flex w-full items-center gap-2 rounded-3xl px-4 py-1.5 text-sm text-muted">
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
  threads: Thread[];
  currentProjectId: string | undefined;
  currentThreadIds: string[];
  wslAvailable: boolean;
  onOpenNewThread: (projectId?: string) => void;
  onAddWindowsProject: () => void;
  onAddWslProject: () => void;
  onOpenThread: (threadId: string) => void;
  onOpenThreadSideBySide: (threadId: string) => void;
  onReplaceSecondPane: (threadId: string) => void;
  onRenameThread: (threadId: string, title: string) => void;
  onDeleteThread: (threadId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onOpenHome: () => void;
  onOpenSettings: () => void;
  onOpenTerminal: (projectId: string) => void;
  onOpenGitReview: (projectId: string) => void;
  terminalProjectIds: string[];
  activeTerminalProjectId: string | null;
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
    wslAvailable,
    onOpenNewThread,
    onAddWindowsProject,
    onAddWslProject,
    onOpenThread,
    onOpenThreadSideBySide,
    onReplaceSecondPane,
    onRenameThread,
    onDeleteThread,
    onDeleteProject,
    onOpenHome,
    onOpenSettings,
    onOpenTerminal,
    onOpenGitReview,
    terminalProjectIds,
    activeTerminalProjectId,
    onReorderProjects,
    onReorderThreads,
  } = props;

  const { isCollapsed, collapse, expand } = useSidebar();
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
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

  const activeThreads = threads.filter((thread) => thread.status !== "inactive");

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

        <div className="flex items-center justify-between px-1.5 pr-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Threads</p>
          <Dropdown>
            <Button
              isIconOnly
              aria-label="Add project"
              className="rounded-3xl text-muted hover:bg-white/[0.05] hover:text-foreground"
              size="sm"
              variant="ghost"
            >
              <FolderPlus className="size-4" />
            </Button>
            <Dropdown.Popover>
              <Dropdown.Menu
                aria-label="Add project options"
                onAction={(key) => {
                  if (key === "windows") onAddWindowsProject();
                  if (key === "wsl") onAddWslProject();
                }}
              >
                <Dropdown.Item id="windows" textValue="Add Windows Project">
                  <Monitor className="size-4 shrink-0 text-muted" />
                  <Label>Add Windows Project</Label>
                </Dropdown.Item>
                <Dropdown.Item id="wsl" isDisabled={!wslAvailable} textValue="Add WSL Project">
                  <TuxIcon className="size-4 shrink-0 text-muted" />
                  <Label>Add WSL Project</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-0 -mr-3 [scrollbar-gutter:stable]">
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
                            <div
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
                            >
                              <GripVertical className="size-3.5" />
                            </div>
                          </>
                        }
                      />
                    </ContextMenu>

                    {!isProjectCollapsed ? (
                      <div className="space-y-0.5 pl-4">
                        <SidebarButton
                          icon={<Plus className="size-4" />}
                          label="New thread"
                          isActive={
                            currentProjectId === project.id && currentThreadIds.length === 0
                          }
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
                                  if (key === "rename") setEditingThreadId(thread.id);
                                  if (key === "replace-second") onReplaceSecondPane(thread.id);
                                  if (key === "open-side") onOpenThreadSideBySide(thread.id);
                                  if (key === "delete") onDeleteThread(thread.id);
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
                                  tooltip={editingThreadId === thread.id ? undefined : thread.title}
                                  isActive={isCurrentThread}
                                  className={isDraggedThread ? "opacity-60" : ""}
                                  onPress={() => onOpenThread(thread.id)}
                                  onDoubleClick={() => setEditingThreadId(thread.id)}
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
                                  suffix={
                                    <>
                                      <span className="relative shrink-0">
                                        <span className="text-[11px] text-muted group-hover:invisible">
                                          {formatRelativeTime(thread.updatedAt)}
                                        </span>
                                        <div
                                          role="button"
                                          tabIndex={0}
                                          aria-label={`Delete ${thread.title}`}
                                          className="absolute inset-0 flex items-center justify-center rounded text-muted/55 opacity-0 transition hover:text-danger group-hover:opacity-100"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            onDeleteThread(thread.id);
                                          }}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === " ") {
                                              event.stopPropagation();
                                              onDeleteThread(thread.id);
                                            }
                                          }}
                                        >
                                          <Trash2 className="size-3.5" />
                                        </div>
                                      </span>
                                      <div
                                        role="button"
                                        tabIndex={0}
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
                                      >
                                        <GripVertical className="size-3.5" />
                                      </div>
                                    </>
                                  }
                                />
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
