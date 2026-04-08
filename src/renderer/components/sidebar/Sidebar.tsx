import { Tooltip } from "@heroui/react";
import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronRight,
  Columns2,
  Download,
  FileDiff,
  ExternalLink,
  GitFork,
  GitMerge,
  GitPullRequest,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { TuxIcon } from "../common/TuxIcon";
import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/react/sortable";
import type { Project, Thread } from "../../../shared/contracts";
import { useAppStore } from "../../state/appStore";
import { useDndContext, type DragSourceData } from "../../dnd";
import { ContextMenu, SidebarButton } from "../common";
import { useSidebar } from "../layout/AppShell";
import { isWindows, readBridge } from "../../bridge";
import { useUpdateStore } from "../../state/updateStore";
import { useSharedSettings } from "../../state/sharedSettingsStore";
import { ProviderIcon, getStatusTone } from "../providers";
import { resolveActionIcon } from "../settings/ProjectSettingsOverlay";
import { useGitStore } from "../../state/gitStore";
import { GitBadge } from "./GitBadge";
import { SyncBadge } from "./SyncBadge";
import {
  buildWorktreeGitItems,
  getWorktreeActionVisibility,
  type GitMenuIcons,
} from "./useWorktreeActions";
import { groupThreadsByWorktree, type WorktreeThreadGroup } from "./groupThreadsByWorktree";
import { WorktreeGroupHeader } from "./WorktreeGroupHeader";

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

// ── Sortable thread item ────────────────────────────────────────
function SortableThreadItem(props: {
  thread: Thread;
  threadIndex: number;
  project: Project;
  showWorktreeBadge: boolean;
  currentThreadIds: string[];
  editingThreadId: string | null;
  setEditingThreadId: (id: string | null) => void;
  onOpenThread: (threadId: string) => void;
  onOpenThreadSideBySide: (threadId: string) => void;
  onReplaceSecondPane: (threadId: string) => void;
  onUnloadThread: (threadId: string) => void;
  onRenameThread: (threadId: string, title: string) => void;
  onArchiveThread: (threadId: string) => void;
  onDeleteThread: (threadId: string, worktreePath?: string, projectId?: string) => void;
  onOpenGitReview: (projectId: string, worktreePath?: string) => void;
  onGitSync: (projectId: string, worktreePath?: string) => void;
  onGitPush: (projectId: string, worktreePath: string) => void;
  onGitPull: (projectId: string, worktreePath: string) => void;
  onGitMergeToSource: (projectId: string, worktreePath: string) => void;
  onGitMergeAndRemove: (projectId: string, worktreePath: string) => void;
  onGitPullFromSource: (projectId: string, worktreePath: string) => void;
  onOpenWorktreeTerminal: (projectId: string, worktreePath: string) => void;
  onRunProjectAction: (projectId: string, actionId: string, worktreePath?: string) => void;
  activeWorktreeTerminalPaths: string[];
  activeWorktreeTerminalPath: string | null;
  gitMenuIcons: GitMenuIcons;
  group: string;
}) {
  const { thread, project, showWorktreeBadge, currentThreadIds, editingThreadId } = props;
  const threadRemoveAction = useSharedSettings((s) => s.threadRemoveAction);
  const unloadDisabledReason =
    thread.status === "inactive"
      ? "Thread is already unloaded."
      : thread.status === "launching"
        ? "Wait for the thread to finish starting."
        : !thread.sessionRef
          ? "This thread can't be resumed yet."
          : undefined;

  const { ref } = useSortable({
    id: `thread:${thread.id}`,
    index: props.threadIndex,
    type: "thread",
    accept: ["thread", "worktree-group"],
    group: props.group,
    data: {
      type: "thread",
      threadId: thread.id,
      projectId: thread.projectId,
      ...(thread.worktreePath != null ? { worktreePath: thread.worktreePath } : {}),
    } satisfies DragSourceData,
  });

  const { source } = useDndContext();
  const isDragging = source?.type === "thread" && source.threadId === thread.id;

  const isCurrentThread = currentThreadIds.includes(thread.id);
  const statusTone = getStatusTone(thread);

  return (
    <div ref={ref} className="relative">
      <ContextMenu
        items={[
          ...(thread.worktreePath
            ? [
                {
                  type: "submenu" as const,
                  id: "git",
                  label: "Git",
                  icon: <GitFork className="size-3.5" />,
                  items: buildWorktreeGitItems(
                    getWorktreeActionVisibility(thread.projectId, thread.worktreePath!),
                    props.gitMenuIcons,
                  ),
                },
              ]
            : []),
          ...(thread.worktreePath && project.scripts?.actions?.length
            ? [
                {
                  type: "submenu" as const,
                  id: "run-action",
                  label: "Run",
                  icon: <Play className="size-3.5" />,
                  items: project.scripts.actions.map((action) => ({
                    id: `action:${action.id}`,
                    label: action.name,
                    icon: resolveActionIcon(action.icon),
                  })),
                },
              ]
            : []),
          {
            id: "rename",
            label: "Rename",
            icon: <Pencil className="size-3.5" />,
          },
          {
            id: "unload",
            label: "Unload Thread",
            icon: <ArrowDownToLine className="size-3.5" />,
            isDisabled: unloadDisabledReason !== undefined,
            ...(unloadDisabledReason ? { disabledReason: unloadDisabledReason } : {}),
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
            label: currentThreadIds.length >= 2 ? "Open 3rd" : "Open Side by Side",
            icon: <Columns2 className="size-3.5" />,
            isDisabled: currentThreadIds.includes(thread.id) || currentThreadIds.length >= 3,
          },
          { type: "separator" as const },
          {
            id: "archive",
            label: "Archive Thread",
            icon: <Archive className="size-3.5" />,
            variant: "warning",
          },
          {
            id: "delete",
            label: "Delete Thread",
            icon: <Trash2 className="size-3.5" />,
            variant: "danger",
          },
        ]}
        onAction={(key) => {
          if (key === "git-review") props.onOpenGitReview(thread.projectId, thread.worktreePath);
          if (key === "git-sync" && thread.worktreePath)
            props.onGitSync(thread.projectId, thread.worktreePath);
          if (key === "git-push" && thread.worktreePath)
            props.onGitPush(thread.projectId, thread.worktreePath);
          if (key === "git-pull" && thread.worktreePath)
            props.onGitPull(thread.projectId, thread.worktreePath);
          if (key === "git-pull-from-source" && thread.worktreePath)
            props.onGitPullFromSource(thread.projectId, thread.worktreePath);
          if (key === "git-merge-to-source" && thread.worktreePath)
            props.onGitMergeToSource(thread.projectId, thread.worktreePath);
          if (key === "git-merge-and-remove" && thread.worktreePath)
            props.onGitMergeAndRemove(thread.projectId, thread.worktreePath);
          if (key === "open-pr" && thread.worktreePath) {
            const pr = useGitStore.getState().prData[thread.worktreePath];
            if (pr?.url) void readBridge().openExternal(pr.url);
          }
          if (key === "create-pr") props.onOpenGitReview(thread.projectId, thread.worktreePath);
          if (key === "archive") props.onArchiveThread(thread.id);
          if (key === "rename") props.setEditingThreadId(thread.id);
          if (key === "unload") props.onUnloadThread(thread.id);
          if (key === "replace-second") props.onReplaceSecondPane(thread.id);
          if (key === "open-side") props.onOpenThreadSideBySide(thread.id);
          if (key === "delete")
            props.onDeleteThread(thread.id, thread.worktreePath, thread.projectId);
          if (key.startsWith("action:")) {
            props.onRunProjectAction(project.id, key.slice("action:".length), thread.worktreePath);
          }
        }}
      >
        <SidebarButton
          icon={
            <ProviderIcon kind={thread.agentKind} tone={statusTone} className="size-3.5 shrink-0" />
          }
          label={
            editingThreadId === thread.id ? (
              <InlineRenameInput
                initialValue={thread.title}
                onCommit={(newTitle) => {
                  props.onRenameThread(thread.id, newTitle);
                  props.setEditingThreadId(null);
                }}
                onCancel={() => props.setEditingThreadId(null)}
              />
            ) : (
              thread.title
            )
          }
          tooltip={editingThreadId === thread.id ? undefined : thread.title}
          isActive={isCurrentThread}
          className={isDragging ? "opacity-60" : ""}
          onPress={() => props.onOpenThread(thread.id)}
          onDoubleClick={() => props.setEditingThreadId(thread.id)}
          isDragging={isDragging}
          suffix={
            <>
              {showWorktreeBadge && thread.worktreePath && (
                <>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Terminal for ${thread.worktreeBranch}`}
                    className={`shrink-0 cursor-default rounded p-0.5 transition-colors hover:bg-white/[0.04] hover:text-foreground ${
                      props.activeWorktreeTerminalPath === thread.worktreePath
                        ? "text-accent"
                        : props.activeWorktreeTerminalPaths.includes(thread.worktreePath)
                          ? "text-foreground"
                          : "text-muted/60 opacity-0 group-hover:opacity-100"
                    }`}
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onOpenWorktreeTerminal(thread.projectId, thread.worktreePath!);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.stopPropagation();
                        props.onOpenWorktreeTerminal(thread.projectId, thread.worktreePath!);
                      }
                    }}
                  >
                    <TerminalSquare className="size-3.5" />
                  </div>
                  <SyncBadge projectId={thread.projectId} worktreePath={thread.worktreePath} />
                  <GitBadge
                    projectId={thread.projectId}
                    projectName={thread.worktreeBranch ?? ""}
                    worktreePath={thread.worktreePath}
                    onPress={() => props.onOpenGitReview(thread.projectId, thread.worktreePath)}
                  />
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
                </>
              )}
              <span className="relative w-[2.4ch] shrink-0">
                <span className="block text-center font-mono text-[10px] tabular-nums text-muted group-hover:invisible">
                  {formatRelativeTime(thread.updatedAt)}
                </span>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={
                    threadRemoveAction === "archive"
                      ? `Archive ${thread.title}`
                      : `Delete ${thread.title}`
                  }
                  className={`absolute inset-0 flex items-center justify-center rounded text-muted/55 opacity-0 transition group-hover:opacity-100 ${threadRemoveAction === "archive" ? "hover:text-warning" : "hover:text-danger"}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (threadRemoveAction === "archive") {
                      props.onArchiveThread(thread.id);
                    } else {
                      props.onDeleteThread(thread.id, thread.worktreePath, thread.projectId);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.stopPropagation();
                      if (threadRemoveAction === "archive") {
                        props.onArchiveThread(thread.id);
                      } else {
                        props.onDeleteThread(thread.id, thread.worktreePath, thread.projectId);
                      }
                    }
                  }}
                >
                  {threadRemoveAction === "archive" ? (
                    <Archive className="size-3.5" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </div>
              </span>
            </>
          }
        />
      </ContextMenu>
    </div>
  );
}

// ── Sortable worktree group ─────────────────────────────────────
function SortableWorktreeGroup(props: {
  group: WorktreeThreadGroup;
  entryIndex: number;
  project: Project;
  isCollapsed: boolean;
  collapsedWorktrees: Record<string, boolean>;
  setCollapsedWorktrees: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  currentThreadIds: string[];
  editingThreadId: string | null;
  setEditingThreadId: (id: string | null) => void;
  onOpenThread: (threadId: string) => void;
  onOpenThreadSideBySide: (threadId: string) => void;
  onReplaceSecondPane: (threadId: string) => void;
  onUnloadThread: (threadId: string) => void;
  onArchiveThread: (threadId: string) => void;
  onRenameThread: (threadId: string, title: string) => void;
  onDeleteThread: (threadId: string, worktreePath?: string, projectId?: string) => void;
  onDeleteWorktreeGroup: (projectId: string, worktreePath: string, threadIds: string[]) => void;
  onOpenGitReview: (projectId: string, worktreePath?: string) => void;
  onGitSync: (projectId: string, worktreePath?: string) => void;
  onGitPush: (projectId: string, worktreePath: string) => void;
  onGitPull: (projectId: string, worktreePath: string) => void;
  onGitMergeToSource: (projectId: string, worktreePath: string) => void;
  onGitMergeAndRemove: (projectId: string, worktreePath: string) => void;
  onGitPullFromSource: (projectId: string, worktreePath: string) => void;
  onOpenWorktreeTerminal: (projectId: string, worktreePath: string) => void;
  onRunProjectAction: (projectId: string, actionId: string, worktreePath?: string) => void;
  activeWorktreeTerminalPaths: string[];
  activeWorktreeTerminalPath: string | null;
  gitMenuIcons: GitMenuIcons;
  sortableGroup: string;
}) {
  const { group, project } = props;
  const groupThreadIds = group.threads.map((t) => t.id);

  const { ref } = useSortable({
    id: `wt:${group.worktreePath}`,
    index: props.entryIndex,
    type: "worktree-group",
    accept: "worktree-group",
    group: props.sortableGroup,
    data: {
      type: "worktree-group",
      worktreePath: group.worktreePath,
      projectId: project.id,
      threadIds: group.threads.map((t) => t.id),
    } satisfies DragSourceData,
  });

  const { source } = useDndContext();
  const isDragging =
    source?.type === "worktree-group" && source.worktreePath === group.worktreePath;
  const isGroupCollapsed = props.isCollapsed;

  return (
    <div ref={ref} className={`relative space-y-0.5 ${isDragging ? "opacity-60" : ""}`}>
      <ContextMenu
        items={[
          {
            type: "submenu" as const,
            id: "git",
            label: "Git",
            icon: <GitFork className="size-3.5" />,
            items: buildWorktreeGitItems(
              getWorktreeActionVisibility(project.id, group.worktreePath),
              props.gitMenuIcons,
            ),
          },
          ...(project.scripts?.actions?.length
            ? [
                {
                  type: "submenu" as const,
                  id: "run-action",
                  label: "Run",
                  icon: <Play className="size-3.5" />,
                  items: project.scripts.actions.map((action) => ({
                    id: `action:${action.id}`,
                    label: action.name,
                    icon: resolveActionIcon(action.icon),
                  })),
                },
              ]
            : []),
          {
            id: "delete-worktree",
            label: "Delete Worktree",
            icon: <Trash2 className="size-3.5" />,
            variant: "danger" as const,
          },
        ]}
        onAction={(key) => {
          if (key === "git-review") {
            props.onOpenGitReview(project.id, group.worktreePath);
          }
          if (key === "delete-worktree") {
            props.onDeleteWorktreeGroup(project.id, group.worktreePath, groupThreadIds);
          }
          if (key === "git-sync") {
            props.onGitSync(project.id, group.worktreePath);
          }
          if (key === "git-push") {
            props.onGitPush(project.id, group.worktreePath);
          }
          if (key === "git-pull") {
            props.onGitPull(project.id, group.worktreePath);
          }
          if (key === "git-pull-from-source") {
            props.onGitPullFromSource(project.id, group.worktreePath);
          }
          if (key === "git-merge-to-source") {
            props.onGitMergeToSource(project.id, group.worktreePath);
          }
          if (key === "git-merge-and-remove") {
            props.onGitMergeAndRemove(project.id, group.worktreePath);
          }
          if (key === "open-pr") {
            const pr = useGitStore.getState().prData[group.worktreePath];
            if (pr?.url) void readBridge().openExternal(pr.url);
          }
          if (key === "create-pr") {
            props.onOpenGitReview(project.id, group.worktreePath);
          }
          if (key.startsWith("action:")) {
            props.onRunProjectAction(project.id, key.slice("action:".length), group.worktreePath);
          }
        }}
      >
        <WorktreeGroupHeader
          worktreePath={group.worktreePath}
          worktreeBranch={group.worktreeBranch}
          projectId={project.id}
          isCollapsed={isGroupCollapsed}
          hasTerminal={props.activeWorktreeTerminalPaths.includes(group.worktreePath)}
          isActiveTerminal={props.activeWorktreeTerminalPath === group.worktreePath}
          onToggleCollapse={() =>
            props.setCollapsedWorktrees((prev) => ({
              ...prev,
              [group.worktreePath]: !isGroupCollapsed,
            }))
          }
          onOpenGitReview={() => props.onOpenGitReview(project.id, group.worktreePath)}
          onOpenTerminal={() => props.onOpenWorktreeTerminal(project.id, group.worktreePath)}
          isDragging={isDragging}
          isDraggingAnything={!!source}
        />
      </ContextMenu>
      {!isGroupCollapsed && (
        <div className="space-y-0.5 pl-2">
          {group.threads.map((thread, threadIdx) => (
            <SortableThreadItem
              key={thread.id}
              thread={thread}
              threadIndex={threadIdx}
              project={project}
              showWorktreeBadge={false}
              currentThreadIds={props.currentThreadIds}
              editingThreadId={props.editingThreadId}
              setEditingThreadId={props.setEditingThreadId}
              onOpenThread={props.onOpenThread}
              onOpenThreadSideBySide={props.onOpenThreadSideBySide}
              onReplaceSecondPane={props.onReplaceSecondPane}
              onUnloadThread={props.onUnloadThread}
              onArchiveThread={props.onArchiveThread}
              onRenameThread={props.onRenameThread}
              onDeleteThread={props.onDeleteThread}
              onOpenGitReview={props.onOpenGitReview}
              onGitSync={props.onGitSync}
              onGitPush={props.onGitPush}
              onGitPull={props.onGitPull}
              onGitMergeToSource={props.onGitMergeToSource}
              onGitMergeAndRemove={props.onGitMergeAndRemove}
              onGitPullFromSource={props.onGitPullFromSource}
              onOpenWorktreeTerminal={props.onOpenWorktreeTerminal}
              onRunProjectAction={props.onRunProjectAction}
              activeWorktreeTerminalPaths={props.activeWorktreeTerminalPaths}
              activeWorktreeTerminalPath={props.activeWorktreeTerminalPath}
              gitMenuIcons={props.gitMenuIcons}
              group={`wt:${group.worktreePath}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sortable project header ─────────────────────────────────────
function SortableProjectHeader(props: {
  project: Project;
  projectIndex: number;
  isProjectCollapsed: boolean;
  setCollapsedProjects: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  collapsedWorktrees: Record<string, boolean>;
  setCollapsedWorktrees: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  currentProjectId: string | undefined;
  currentThreadIds: string[];
  editingThreadId: string | null;
  setEditingThreadId: (id: string | null) => void;
  onOpenNewThread: (projectId?: string) => void;
  onOpenThread: (threadId: string) => void;
  onOpenThreadSideBySide: (threadId: string) => void;
  onReplaceSecondPane: (threadId: string) => void;
  onUnloadThread: (threadId: string) => void;
  onArchiveThread: (threadId: string) => void;
  onRenameThread: (threadId: string, title: string) => void;
  onDeleteThread: (threadId: string, worktreePath?: string, projectId?: string) => void;
  onDeleteProject: (projectId: string) => void;
  onDeleteWorktreeGroup: (projectId: string, worktreePath: string, threadIds: string[]) => void;
  onOpenSettings: () => void;
  onOpenTerminal: (projectId: string) => void;
  onOpenWorktreeTerminal: (projectId: string, worktreePath: string) => void;
  onOpenGitReview: (projectId: string, worktreePath?: string) => void;
  onGitSync: (projectId: string, worktreePath?: string) => void;
  onGitPush: (projectId: string, worktreePath: string) => void;
  onGitPull: (projectId: string, worktreePath: string) => void;
  onGitMergeToSource: (projectId: string, worktreePath: string) => void;
  onGitMergeAndRemove: (projectId: string, worktreePath: string) => void;
  onGitPullFromSource: (projectId: string, worktreePath: string) => void;
  onOpenProjectSettings: (projectId: string) => void;
  onRunProjectAction: (projectId: string, actionId: string, worktreePath?: string) => void;
  terminalProjectIds: string[];
  activeTerminalProjectId: string | null;
  activeWorktreeTerminalPaths: string[];
  activeWorktreeTerminalPath: string | null;
  gitMenuIcons: GitMenuIcons;
}) {
  const { project, isProjectCollapsed } = props;
  const threads = useAppStore((state) => state.threads);
  const projectThreads = threads.filter(
    (thread) => thread.projectId === project.id && !thread.archived,
  );
  const projectLocation = formatProjectLocation(project);

  const { ref } = useSortable({
    id: `project:${project.id}`,
    index: props.projectIndex,
    type: "project",
    accept: "project",
    data: { type: "project", projectId: project.id } satisfies DragSourceData,
  });

  const { source } = useDndContext();
  const isDragging = source?.type === "project" && source.projectId === project.id;

  return (
    <section ref={ref} className={`relative space-y-0.5 ${isDragging ? "opacity-60" : ""}`}>
      <ContextMenu
        items={[
          {
            id: "project-settings",
            label: "Project Settings",
            icon: <Settings2 className="size-3.5" />,
          },
          {
            type: "submenu" as const,
            id: "git",
            label: "Git",
            icon: <GitFork className="size-3.5" />,
            items: [
              {
                id: "git-review",
                label: "Review Changes",
                icon: <FileDiff className="size-3.5" />,
              },
              {
                id: "git-sync",
                label: "Sync",
                icon: <RefreshCw className="size-3.5" />,
              },
            ],
          },
          ...(project.scripts?.actions?.length
            ? [
                {
                  type: "submenu" as const,
                  id: "run-action",
                  label: "Run",
                  icon: <Play className="size-3.5" />,
                  items: project.scripts.actions.map((action) => ({
                    id: `action:${action.id}`,
                    label: action.name,
                    icon: resolveActionIcon(action.icon),
                  })),
                },
              ]
            : []),
          {
            id: "remove-project",
            label: "Remove Project",
            icon: <Trash2 className="size-3.5" />,
            variant: "danger" as const,
          },
        ]}
        onAction={(key) => {
          if (key === "project-settings") props.onOpenProjectSettings(project.id);
          if (key === "remove-project") props.onDeleteProject(project.id);
          if (key === "git-review") props.onOpenGitReview(project.id);
          if (key === "git-sync") props.onGitSync(project.id);
          if (key.startsWith("action:")) {
            props.onRunProjectAction(project.id, key.slice("action:".length));
          }
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
              <span className="truncate font-semibold text-foreground">{project.name}</span>
              {project.location.kind === "wsl" && (
                <TuxIcon className="h-3 w-auto shrink-0 text-muted/60" />
              )}
            </span>
          }
          tooltip={projectLocation}
          className={isDragging ? "opacity-60" : ""}
          onPress={() =>
            props.setCollapsedProjects((current) => ({
              ...current,
              [project.id]: !isProjectCollapsed,
            }))
          }
          isDragging={isDragging}
          suffix={
            <>
              <div
                role="button"
                tabIndex={0}
                aria-label={`Terminal for ${project.name}`}
                className={`shrink-0 cursor-default rounded p-0.5 transition-colors hover:bg-white/[0.04] hover:text-foreground ${
                  props.activeTerminalProjectId === project.id
                    ? "text-accent"
                    : props.terminalProjectIds.includes(project.id)
                      ? "text-foreground"
                      : "text-muted/60 opacity-0 group-hover:opacity-100"
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  props.onOpenTerminal(project.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.stopPropagation();
                    props.onOpenTerminal(project.id);
                  }
                }}
              >
                <TerminalSquare className="size-3.5" />
              </div>
              <SyncBadge projectId={project.id} />
              <GitBadge
                projectId={project.id}
                projectName={project.name}
                onPress={() => props.onOpenGitReview(project.id)}
              />
            </>
          }
        />
      </ContextMenu>

      {!isProjectCollapsed ? (
        <div className="space-y-0.5 pl-3">
          <SidebarButton
            icon={<Plus className="size-4" />}
            label="New thread"
            isActive={props.currentProjectId === project.id && props.currentThreadIds.length === 0}
            isDraggingAnything={!!source}
            onPress={() => props.onOpenNewThread(project.id)}
          />

          <div className="max-h-80 space-y-0.5 overflow-y-auto">
            {(() => {
              const entries = groupThreadsByWorktree(projectThreads);
              let ungroupedIndex = 0;

              return entries.map((entry, entryIndex) => {
                if (entry.kind === "thread") {
                  const idx = ungroupedIndex++;
                  return (
                    <SortableThreadItem
                      key={entry.thread.id}
                      thread={entry.thread}
                      threadIndex={idx}
                      project={project}
                      showWorktreeBadge={true}
                      currentThreadIds={props.currentThreadIds}
                      editingThreadId={props.editingThreadId}
                      setEditingThreadId={props.setEditingThreadId}
                      onOpenThread={props.onOpenThread}
                      onOpenThreadSideBySide={props.onOpenThreadSideBySide}
                      onReplaceSecondPane={props.onReplaceSecondPane}
                      onUnloadThread={props.onUnloadThread}
                      onArchiveThread={props.onArchiveThread}
                      onRenameThread={props.onRenameThread}
                      onDeleteThread={props.onDeleteThread}
                      onOpenGitReview={props.onOpenGitReview}
                      onGitSync={props.onGitSync}
                      onGitPush={props.onGitPush}
                      onGitPull={props.onGitPull}
                      onGitMergeToSource={props.onGitMergeToSource}
                      onGitMergeAndRemove={props.onGitMergeAndRemove}
                      onGitPullFromSource={props.onGitPullFromSource}
                      onOpenWorktreeTerminal={props.onOpenWorktreeTerminal}
                      onRunProjectAction={props.onRunProjectAction}
                      activeWorktreeTerminalPaths={props.activeWorktreeTerminalPaths}
                      activeWorktreeTerminalPath={props.activeWorktreeTerminalPath}
                      gitMenuIcons={props.gitMenuIcons}
                      group={`project-entries:${project.id}`}
                    />
                  );
                }

                return (
                  <SortableWorktreeGroup
                    key={entry.group.worktreePath}
                    group={entry.group}
                    entryIndex={entryIndex}
                    project={project}
                    isCollapsed={props.collapsedWorktrees[entry.group.worktreePath] ?? false}
                    collapsedWorktrees={props.collapsedWorktrees}
                    setCollapsedWorktrees={props.setCollapsedWorktrees}
                    currentThreadIds={props.currentThreadIds}
                    editingThreadId={props.editingThreadId}
                    setEditingThreadId={props.setEditingThreadId}
                    onOpenThread={props.onOpenThread}
                    onOpenThreadSideBySide={props.onOpenThreadSideBySide}
                    onReplaceSecondPane={props.onReplaceSecondPane}
                    onUnloadThread={props.onUnloadThread}
                    onArchiveThread={props.onArchiveThread}
                    onRenameThread={props.onRenameThread}
                    onDeleteThread={props.onDeleteThread}
                    onDeleteWorktreeGroup={props.onDeleteWorktreeGroup}
                    onOpenGitReview={props.onOpenGitReview}
                    onGitSync={props.onGitSync}
                    onGitPush={props.onGitPush}
                    onGitPull={props.onGitPull}
                    onGitMergeToSource={props.onGitMergeToSource}
                    onGitMergeAndRemove={props.onGitMergeAndRemove}
                    onGitPullFromSource={props.onGitPullFromSource}
                    onOpenWorktreeTerminal={props.onOpenWorktreeTerminal}
                    onRunProjectAction={props.onRunProjectAction}
                    activeWorktreeTerminalPaths={props.activeWorktreeTerminalPaths}
                    activeWorktreeTerminalPath={props.activeWorktreeTerminalPath}
                    gitMenuIcons={props.gitMenuIcons}
                    sortableGroup={`project-entries:${project.id}`}
                  />
                );
              });
            })()}
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ── Main Sidebar ────────────────────────────────────────────────
export function Sidebar(props: {
  projects: Project[];
  currentProjectId: string | undefined;
  currentThreadIds: string[];
  onOpenNewThread: (projectId?: string) => void;
  onOpenThread: (threadId: string) => void;
  onOpenThreadSideBySide: (threadId: string) => void;
  onReplaceSecondPane: (threadId: string) => void;
  onUnloadThread: (threadId: string) => void;
  onArchiveThread: (threadId: string) => void;
  onRenameThread: (threadId: string, title: string) => void;
  onDeleteThread: (threadId: string, worktreePath?: string, projectId?: string) => void;
  onDeleteProject: (projectId: string) => void;
  onDeleteWorktreeGroup: (projectId: string, worktreePath: string, threadIds: string[]) => void;
  onOpenSettings: () => void;
  onOpenTerminal: (projectId: string) => void;
  onOpenWorktreeTerminal: (projectId: string, worktreePath: string) => void;
  onOpenGitReview: (projectId: string, worktreePath?: string) => void;
  onGitSync: (projectId: string, worktreePath?: string) => void;
  onGitPush: (projectId: string, worktreePath: string) => void;
  onGitPull: (projectId: string, worktreePath: string) => void;
  onGitMergeToSource: (projectId: string, worktreePath: string) => void;
  onGitMergeAndRemove: (projectId: string, worktreePath: string) => void;
  onGitPullFromSource: (projectId: string, worktreePath: string) => void;
  onOpenProjectSettings: (projectId: string) => void;
  onRunProjectAction: (projectId: string, actionId: string, worktreePath?: string) => void;
  terminalProjectIds: string[];
  activeTerminalProjectId: string | null;
  activeWorktreeTerminalPaths: string[];
  activeWorktreeTerminalPath: string | null;
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
    onUnloadThread,
    onArchiveThread,
    onRenameThread,
    onDeleteThread,
    onDeleteProject,
    onDeleteWorktreeGroup,
    onOpenSettings,
    onOpenTerminal,
    onOpenWorktreeTerminal,
    onOpenGitReview,
    onGitSync,
    onGitPush,
    onGitPull,
    onGitMergeToSource,
    onGitMergeAndRemove,
    onGitPullFromSource,
    onOpenProjectSettings,
    onRunProjectAction,
    terminalProjectIds,
    activeTerminalProjectId,
    activeWorktreeTerminalPaths,
    activeWorktreeTerminalPath,
  } = props;

  const gitMenuIcons = {
    review: <FileDiff className="size-3.5" />,
    sync: <RefreshCw className="size-3.5" />,
    push: <ArrowUpFromLine className="size-3.5" />,
    pull: <ArrowDownToLine className="size-3.5" />,
    pullFromSource: <ArrowDownToLine className="size-3.5" />,
    merge: <GitMerge className="size-3.5" />,
    openPr: <ExternalLink className="size-3.5" />,
    createPr: <GitPullRequest className="size-3.5" />,
  };

  const { isCollapsed, collapse, expand } = useSidebar();
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [collapsedWorktrees, setCollapsedWorktrees] = useState<Record<string, boolean>>({});
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);

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

  const activeThreads = threads.filter(
    (thread) => thread.status !== "inactive" && !thread.archived,
  );

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
              {projects.map((project, projectIndex) => (
                <SortableProjectHeader
                  key={project.id}
                  project={project}
                  projectIndex={projectIndex}
                  isProjectCollapsed={collapsedProjects[project.id] ?? false}
                  setCollapsedProjects={setCollapsedProjects}
                  collapsedWorktrees={collapsedWorktrees}
                  setCollapsedWorktrees={setCollapsedWorktrees}
                  currentProjectId={currentProjectId}
                  currentThreadIds={currentThreadIds}
                  editingThreadId={editingThreadId}
                  setEditingThreadId={setEditingThreadId}
                  onOpenNewThread={onOpenNewThread}
                  onOpenThread={onOpenThread}
                  onOpenThreadSideBySide={onOpenThreadSideBySide}
                  onReplaceSecondPane={onReplaceSecondPane}
                  onUnloadThread={onUnloadThread}
                  onArchiveThread={onArchiveThread}
                  onRenameThread={onRenameThread}
                  onDeleteThread={onDeleteThread}
                  onDeleteProject={onDeleteProject}
                  onDeleteWorktreeGroup={onDeleteWorktreeGroup}
                  onOpenSettings={onOpenSettings}
                  onOpenTerminal={onOpenTerminal}
                  onOpenWorktreeTerminal={onOpenWorktreeTerminal}
                  onOpenGitReview={onOpenGitReview}
                  onGitSync={onGitSync}
                  onGitPush={onGitPush}
                  onGitPull={onGitPull}
                  onGitMergeToSource={onGitMergeToSource}
                  onGitMergeAndRemove={onGitMergeAndRemove}
                  onGitPullFromSource={onGitPullFromSource}
                  onOpenProjectSettings={onOpenProjectSettings}
                  onRunProjectAction={onRunProjectAction}
                  terminalProjectIds={terminalProjectIds}
                  activeTerminalProjectId={activeTerminalProjectId}
                  activeWorktreeTerminalPaths={activeWorktreeTerminalPaths}
                  activeWorktreeTerminalPath={activeWorktreeTerminalPath}
                  gitMenuIcons={gitMenuIcons}
                />
              ))}
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
