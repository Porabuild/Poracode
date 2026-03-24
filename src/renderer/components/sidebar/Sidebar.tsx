import { Tooltip } from "@heroui/react";
import {
  BookOpenText,
  ChevronRight,
  Clock3,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Plus,
  Server,
  Settings2,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type DragEvent } from "react";
import type { Project, Thread } from "../../../shared/contracts";
import { isReorderNoOp, type ReorderPlacement } from "../../state/reorder";
import { Button, CodexStatusIcon, getCodexStatusTone, Input } from "../common";

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

function formatThreadStatus(status: Thread["status"]): string {
  switch (status) {
    case "inactive":
      return "Inactive";
    case "launching":
      return "Launching";
    case "working":
      return "Working";
    case "idle":
      return "Idle";
    case "needs_approval":
      return "Needs approval";
    case "needs_reply":
      return "Needs reply";
    case "error":
      return "Error";
  }
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

export function Sidebar(props: {
  projects: Project[];
  threads: Thread[];
  currentProjectId: string | undefined;
  currentThreadId: string | undefined;
  wslDistros: string[];
  onOpenNewThread: (projectId?: string) => void;
  onAddWindowsProject: () => void;
  onAddWslProject: (distro: string, linuxPath: string) => void;
  onOpenThread: (threadId: string) => void;
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
    currentThreadId,
    wslDistros,
    onOpenNewThread,
    onAddWindowsProject,
    onAddWslProject,
    onOpenThread,
    onDeleteThread,
    onOpenHome,
    onOpenSettings,
    onReorderProjects,
    onReorderThreads,
  } = props;
  const [wslExpanded, setWslExpanded] = useState(false);
  const [wslPath, setWslPath] = useState("/home/");
  const [selectedDistro, setSelectedDistro] = useState(wslDistros[0] ?? "");
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [dragItem, setDragItem] = useState<SidebarDragItem>();
  const [dropIndicator, setDropIndicator] = useState<SidebarDropIndicator>();
  const projectIds = projects.map((project) => project.id);

  useEffect(() => {
    if (wslDistros.length === 0) {
      setSelectedDistro("");
      return;
    }

    if (!selectedDistro || !wslDistros.includes(selectedDistro)) {
      setSelectedDistro(wslDistros[0] ?? "");
    }
  }, [selectedDistro, wslDistros]);

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

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-3 pb-3 pt-0">
      <div className="space-y-1">
        <button
          className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1 text-left transition-colors hover:bg-white/[0.04]"
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
            <p className="truncate text-xs text-muted">Terminal-native threads</p>
          </div>
        </button>
      </div>

      <div className="flex items-center justify-between px-1.5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Threads</p>
        <div className="flex items-center gap-1">
          <Button
            isIconOnly
            aria-label="Add Windows project"
            className="rounded-lg text-muted hover:bg-white/[0.05] hover:text-foreground"
            onPress={onAddWindowsProject}
            size="sm"
            variant="ghost"
          >
            <FolderPlus className="size-4" />
          </Button>
          <Button
            isIconOnly
            aria-label="Add WSL project"
            className="rounded-lg text-muted hover:bg-white/[0.05] hover:text-foreground"
            onPress={() => setWslExpanded((value) => !value)}
            size="sm"
            variant="ghost"
          >
            {wslExpanded ? <Plus className="size-4 rotate-45" /> : <Server className="size-4" />}
          </Button>
        </div>
      </div>

      {wslExpanded ? (
        <div className="rounded-xl border border-white/6 bg-white/[0.03] p-3">
          <div className="space-y-2.5">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">WSL project</p>
              <p className="text-xs text-muted">Launch through a distro and Linux path.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {wslDistros.map((distro) => (
                <Button
                  key={distro}
                  className="rounded-lg px-3"
                  onPress={() => setSelectedDistro(distro)}
                  size="sm"
                  variant={selectedDistro === distro ? "primary" : "secondary"}
                >
                  {distro}
                </Button>
              ))}
            </div>

            <Input
              fullWidth
              id="wsl-path"
              placeholder="/home/you/project"
              value={wslPath}
              variant="secondary"
              onChange={(event) => setWslPath(event.target.value)}
            />

            <div className="flex gap-2">
              <Button
                className="rounded-lg px-4"
                isDisabled={!selectedDistro || !wslPath.trim()}
                onPress={() => {
                  if (!selectedDistro || !wslPath.trim()) {
                    return;
                  }
                  onAddWslProject(selectedDistro, wslPath.trim());
                  setWslExpanded(false);
                }}
                size="sm"
              >
                Add
              </Button>
              <Button
                className="rounded-lg px-4"
                onPress={() => setWslExpanded(false)}
                size="sm"
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pr-0.5">
        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-5">
            <p className="text-sm text-muted">
              Add a project to start a real terminal-backed thread.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => {
              const projectThreads = threads.filter((thread) => thread.projectId === project.id);
              const isCollapsed = collapsedProjects[project.id] ?? false;
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
                    className="flex items-center gap-2 rounded-xl px-3 py-1.5 transition-colors hover:bg-white/[0.03]"
                    onDragOver={(event) => {
                      if (!dragItem || dragItem.type !== "project" || dragItem.id === project.id) {
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
                      if (!dragItem || dragItem.type !== "project" || dragItem.id === project.id) {
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
                      className="min-w-0 flex-1 text-left"
                      onClick={() =>
                        setCollapsedProjects((current) => ({
                          ...current,
                          [project.id]: !isCollapsed,
                        }))
                      }
                      type="button"
                    >
                      <div className="flex items-center gap-2">
                        <ChevronRight
                          className={`size-3.5 shrink-0 text-muted transition-transform ${
                            isCollapsed ? "" : "rotate-90"
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

                  {!isCollapsed ? (
                    <div className="space-y-0.5 pl-4">
                      <button
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-muted transition-colors hover:bg-white/[0.04] hover:text-foreground"
                        onClick={() => onOpenNewThread(project.id)}
                        type="button"
                      >
                        <Plus className="size-4" />
                        <span>New thread</span>
                      </button>

                      {projectThreads.map((thread) => {
                        const isCurrentThread = thread.id === currentThreadId;
                        const isDraggedThread =
                          dragItem?.type === "thread" && dragItem.id === thread.id;
                        const codexTone =
                          thread.agentKind === "codex" ? getCodexStatusTone(thread) : undefined;
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

                            <div
                              className={`group flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors ${
                                isCurrentThread
                                  ? "bg-white/[0.08] text-foreground"
                                  : "bg-transparent text-muted hover:bg-white/[0.04] hover:text-foreground"
                              } ${isDraggedThread ? "opacity-60" : ""}`}
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
                                  isReorderNoOp(projectThreadIds, dragItem.id, thread.id, placement)
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
                                  isReorderNoOp(projectThreadIds, dragItem.id, thread.id, placement)
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
                              <button
                                className="min-w-0 flex-1 text-left"
                                onClick={() => onOpenThread(thread.id)}
                                type="button"
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  {thread.agentKind === "codex" ? (
                                    <CodexStatusIcon
                                      className="size-3.5 shrink-0"
                                      tone={codexTone ?? "inactive"}
                                    />
                                  ) : null}
                                  <p className="truncate text-sm font-medium">{thread.title}</p>
                                </div>
                              </button>
                              <button
                                aria-label={`Delete ${thread.title}`}
                                className="shrink-0 rounded text-muted/55 opacity-0 transition hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onDeleteThread(thread.id);
                                }}
                                type="button"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                              <span className="shrink-0 text-[11px] text-muted">
                                {formatRelativeTime(thread.updatedAt)}
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
                            </div>
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
        <div className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted">
          <Clock3 className="size-4" />
          <span>Automations</span>
        </div>

        <div className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted">
          <BookOpenText className="size-4" />
          <span>Skills</span>
        </div>
      </div>

      <div className="pt-1">
        <Button
          aria-label="Settings"
          className="w-full justify-start"
          onPress={onOpenSettings}
          variant="ghost"
        >
          <Settings2 className="size-4 text-muted" />
          <span>Settings</span>
        </Button>
      </div>
    </div>
  );
}
