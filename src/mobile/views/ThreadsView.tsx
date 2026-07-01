import { useRef, useState } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  GitFork,
  History,
  Pencil,
  Plus,
  Search,
  Star,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Project, Thread } from "@/shared/contracts";
import { getBasename } from "@/shared/pathUtils";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";
import { ThreadProviderIcon, getStatusTone } from "@/renderer/components/providers";
import { InlineRenameInput } from "@/renderer/views/MainView/parts/Sidebar/parts/InlineRenameInput";
import {
  groupThreads,
  type ThreadListEntry,
} from "@/renderer/views/MainView/parts/Sidebar/parts/groupThreads";
import { resolveActionIcon } from "@/renderer/utils/actionIcons";
import { BottomSheet, EmptyState, SheetMenu, Skeleton, useSheet } from "../components";
import { GitSummaryBadge, WorktreeGitSummaryBadge } from "../GitSummaryParts";
import type { ThreadAction } from "../useRemoteDesktop";

export interface ThreadsViewProps {
  readonly projects: readonly Project[];
  readonly threads: readonly Thread[];
  readonly selectedThreadId: string | null;
  /** `null` shows every project in one flat list. */
  readonly projectFilter: string | null;
  /** First load with no cached threads yet: show placeholder rows. */
  readonly loading?: boolean;
  readonly onProjectFilterChange: (projectId: string | null) => void;
  readonly onOpenThread: (thread: Thread) => void;
  readonly onThreadAction: (thread: Thread, action: ThreadAction) => void;
  readonly onNew: () => void;
  /** Opens the composer pre-targeted at an existing worktree. */
  readonly onNewThreadInWorktree: (input: {
    readonly projectId: string;
    readonly worktreePath: string;
    readonly worktreeBranch: string;
  }) => void;
  /** Removes a worktree group through the paired desktop's cleanup path. */
  readonly onDeleteWorktreeGroup: (input: {
    readonly projectId: string;
    readonly worktreePath: string;
    readonly threadIds: readonly string[];
  }) => void;
  /** Opens a live shell for a project (or worktree, when a path is given). */
  readonly onOpenTerminal: (input: {
    readonly projectId: string;
    readonly worktreePath?: string;
    readonly sourceThreadId?: string;
  }) => void;
  /** Opens a terminal and runs one configured project action. */
  readonly onRunProjectAction: (input: {
    readonly projectId: string;
    readonly actionId: string;
    readonly worktreePath?: string;
    readonly sourceThreadId?: string;
  }) => void;
}

/** Placeholder rows shown on first load before any thread data arrives. */
function ThreadListSkeleton() {
  const { t } = useLingui();
  return (
    <div className="m-skeleton-list" aria-busy="true" aria-label={t`Loading threads`}>
      {Array.from({ length: 6 }, (_unused, index) => (
        <div className="m-skeleton-row" key={index}>
          <Skeleton className="size-4 shrink-0 !rounded-md" />
          <span className="m-skeleton-row__body">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2.5 w-1/3" />
          </span>
        </div>
      ))}
    </div>
  );
}

const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP_PX = 10;

function normalizeSearchText(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function threadMatchesSearch(
  thread: Thread,
  projectName: string | undefined,
  query: string,
): boolean {
  const haystack = [
    thread.title,
    projectName,
    thread.worktreeBranch,
    thread.worktreePath,
    thread.agentKind,
    thread.groupName,
  ]
    .map(normalizeSearchText)
    .filter(Boolean)
    .join(" ");
  return haystack.includes(query);
}

/**
 * Touch long-press / right-click → context menu, shared by thread rows and
 * group headers. The release click after a long-press is swallowed (via
 * `onClick`) so the row/header doesn't also fire its tap action; moving past
 * the slop cancels (the gesture was a scroll).
 */
function useLongPress(onLongPress: () => void) {
  const pressRef = useRef<{
    timer: ReturnType<typeof setTimeout>;
    x: number;
    y: number;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const cancel = () => {
    if (pressRef.current) {
      clearTimeout(pressRef.current.timer);
      pressRef.current = null;
    }
  };

  const pressHandlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      cancel();
      pressRef.current = {
        x: event.clientX,
        y: event.clientY,
        timer: setTimeout(() => {
          pressRef.current = null;
          suppressClickRef.current = true;
          onLongPress();
        }, LONG_PRESS_MS),
      };
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const press = pressRef.current;
      if (!press) return;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > LONG_PRESS_SLOP_PX) {
        cancel();
      }
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
  };

  const onClick = (action: () => void) => () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    action();
  };

  const onContextMenu = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    cancel();
    onLongPress();
  };

  return { pressHandlers, onClick, onContextMenu };
}

/** Long-press (touch) or right-click context menu for a thread row. */
function ThreadActionsSheet(props: {
  readonly thread: Thread;
  readonly project?: Project | undefined;
  readonly closing?: boolean;
  readonly onAction: (action: ThreadAction) => void;
  readonly onNewThreadInWorktree: ThreadsViewProps["onNewThreadInWorktree"];
  readonly onDeleteWorktreeGroup: ThreadsViewProps["onDeleteWorktreeGroup"];
  readonly onOpenTerminal: ThreadsViewProps["onOpenTerminal"];
  readonly onRunProjectAction: ThreadsViewProps["onRunProjectAction"];
  readonly onClose: () => void;
}) {
  const { thread } = props;
  const { t } = useLingui();
  const [renaming, setRenaming] = useState(false);

  const act = (action: ThreadAction) => {
    props.onAction(action);
    props.onClose();
  };
  const runAndClose = (run: () => void) => {
    run();
    props.onClose();
  };

  const openTerminal = () => {
    props.onOpenTerminal({
      projectId: thread.projectId,
      ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
      sourceThreadId: thread.id,
    });
    props.onClose();
  };
  const worktreePath = thread.worktreePath;
  const worktreeBranch = worktreePath && (thread.worktreeBranch || getBasename(worktreePath));

  return (
    <BottomSheet
      label={t`Actions for ${thread.title}`}
      closeLabel={t`Close thread actions`}
      closing={props.closing}
      onClose={props.onClose}
    >
      <div className="m-sheet-head">
        <span className="truncate">{thread.title}</span>
      </div>
      <div className="m-sheet-list">
        <button type="button" className="m-sheet-action" onClick={openTerminal}>
          <Terminal className="size-4 shrink-0 text-muted" />
          <span>{thread.worktreePath ? t`Open terminal in worktree` : t`Open terminal`}</span>
        </button>
        {worktreePath && worktreeBranch ? (
          <button
            type="button"
            className="m-sheet-action"
            onClick={() =>
              runAndClose(() =>
                props.onNewThreadInWorktree({
                  projectId: thread.projectId,
                  worktreePath,
                  worktreeBranch,
                }),
              )
            }
          >
            <Plus className="size-4 shrink-0 text-muted" />
            <span>
              <Trans>New thread in worktree</Trans>
            </span>
          </button>
        ) : null}
        {props.project?.scripts?.actions?.map((action) => (
          <button
            type="button"
            key={action.id}
            className="m-sheet-action"
            onClick={() =>
              runAndClose(() =>
                props.onRunProjectAction({
                  projectId: thread.projectId,
                  actionId: action.id,
                  ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
                  sourceThreadId: thread.id,
                }),
              )
            }
          >
            <span className="size-4 shrink-0 text-muted">{resolveActionIcon(action.icon)}</span>
            <span>{action.name}</span>
          </button>
        ))}
        {renaming ? (
          <div className="m-sheet-action" data-static="true">
            <Pencil className="size-4 shrink-0 text-muted" />
            <InlineRenameInput
              initialValue={thread.title}
              onCommit={(title) => act({ kind: "rename", title })}
              onCancel={() => setRenaming(false)}
            />
          </div>
        ) : (
          <button type="button" className="m-sheet-action" onClick={() => setRenaming(true)}>
            <Pencil className="size-4 shrink-0 text-muted" />
            <span>
              <Trans>Rename</Trans>
            </span>
          </button>
        )}
        <button
          type="button"
          className="m-sheet-action"
          onClick={() => act({ kind: "set-done", done: !thread.done })}
        >
          <CircleCheck className="size-4 shrink-0 text-muted" />
          <span>{thread.done ? t`Unmark Done` : t`Mark Done`}</span>
        </button>
        <button
          type="button"
          className="m-sheet-action"
          onClick={() => act({ kind: "set-starred", starred: !(thread.starred ?? false) })}
        >
          <Star className="size-4 shrink-0 text-muted" />
          <span>{thread.starred ? t`Unpin` : t`Pin to top`}</span>
        </button>
        <button
          type="button"
          className="m-sheet-action text-warning"
          onClick={() => act({ kind: "archive" })}
        >
          <Archive className="size-4 shrink-0" />
          <span>
            <Trans>Archive Thread</Trans>
          </span>
        </button>
        <button
          type="button"
          className="m-sheet-action text-danger"
          onClick={() =>
            worktreePath
              ? runAndClose(() =>
                  props.onDeleteWorktreeGroup({
                    projectId: thread.projectId,
                    worktreePath,
                    threadIds: [thread.id],
                  }),
                )
              : act({ kind: "delete" })
          }
        >
          <Trash2 className="size-4 shrink-0" />
          <span>
            {worktreePath ? <Trans>Delete Worktree</Trans> : <Trans>Delete Thread</Trans>}
          </span>
        </button>
        {worktreePath ? (
          <button
            type="button"
            className="m-sheet-action text-danger"
            onClick={() => act({ kind: "delete" })}
          >
            <Trash2 className="size-4 shrink-0" />
            <span>
              <Trans>Delete Thread</Trans>
            </span>
          </button>
        ) : null}
      </div>
    </BottomSheet>
  );
}

/**
 * Touch-sized two-line thread row: title on top, project + worktree below.
 * Same provider icon and status semantics as the desktop sidebar rows, but
 * without desktop-only chrome (drag handle, context menu, hover actions).
 */
function ThreadRow(props: {
  readonly thread: Thread;
  readonly projectName: string | undefined;
  readonly isActive: boolean;
  /** Hide the worktree badge when the row sits under a worktree group header. */
  readonly hideWorktree?: boolean;
  /** Hide the per-row diff/PR badge; the worktree group header shows it instead. */
  readonly hideGitSummary?: boolean;
  readonly onPress: () => void;
  readonly onMenu: () => void;
}) {
  const { thread } = props;
  const { t } = useLingui();
  const tone = getStatusTone(thread);
  const live = tone !== "inactive" && tone !== "done";
  const worktreeName =
    !props.hideWorktree && thread.worktreePath ? getBasename(thread.worktreePath) : undefined;
  const { pressHandlers, onClick, onContextMenu } = useLongPress(props.onMenu);

  return (
    <button
      type="button"
      className="m-thread-row"
      data-active={props.isActive || undefined}
      data-live={live || undefined}
      onClick={onClick(props.onPress)}
      onContextMenu={onContextMenu}
      {...pressHandlers}
    >
      <ThreadProviderIcon thread={thread} className="size-4 shrink-0" />
      <span className="m-thread-row__body">
        <span className="m-thread-row__title" data-done={thread.done || undefined}>
          {thread.title}
        </span>
        <span className="m-thread-row__meta">
          {props.projectName ? (
            <span className="m-thread-row__meta-item">{props.projectName}</span>
          ) : null}
          {worktreeName ? (
            <span className="m-thread-row__meta-item">
              <GitFork className="size-3 shrink-0" aria-label={t`Worktree`} />
              <span className="m-thread-row__meta-text">{worktreeName}</span>
            </span>
          ) : null}
          {props.hideGitSummary ? null : <GitSummaryBadge threadId={thread.id} />}
        </span>
      </span>
      <span className="m-thread-row__side">
        {thread.starred && <Star className="size-3 shrink-0 fill-current" aria-label={t`Pinned`} />}
        <RelativeTime
          iso={thread.updatedAt}
          className="block shrink-0 text-center font-mono text-[10px] tabular-nums text-muted"
        />
      </span>
    </button>
  );
}

type GroupEntry = Extract<ThreadListEntry, { kind: "worktree-group" | "thread-group" }>;

/** Stable collapse key per group: worktree path or explicit group id. */
function groupEntryKey(entry: GroupEntry): string {
  return entry.kind === "worktree-group"
    ? `wt:${entry.group.worktreePath}`
    : `group:${entry.group.groupId}`;
}

/** Header label: the branch (or worktree folder), else the group's name. */
function groupEntryTitle(entry: GroupEntry): string {
  if (entry.kind === "worktree-group") {
    const { worktreeBranch, worktreePath } = entry.group;
    if (worktreeBranch && worktreeBranch !== worktreePath) return worktreeBranch;
    return getBasename(worktreePath);
  }
  return entry.group.groupName;
}

function groupLatestUpdatedAt(threads: readonly Thread[]): string {
  return threads.reduce(
    (latest, thread) => (thread.updatedAt > latest ? thread.updatedAt : latest),
    threads[0]!.updatedAt,
  );
}

/**
 * Collapsed group keys persist across remounts within the session (e.g. tabbing
 * away and back) without touching storage; a full reload starts expanded.
 */
const collapsedGroupCache = new Set<string>();

/** Test-only: clear session collapse state so cases don't leak into each other. */
export function __resetCollapsedGroupCache() {
  collapsedGroupCache.clear();
}

/**
 * Collapsible header for a worktree (or "continue in other provider") group.
 * Tapping toggles the child rows; the long-press actions stay on each row.
 */
function ThreadGroupHeader(props: {
  readonly entry: GroupEntry;
  readonly projectName: string | undefined;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  readonly onMenu: () => void;
}) {
  const { entry } = props;
  const { t } = useLingui();
  const threads = entry.group.threads;
  const allDone = threads.every((thread) => thread.done);
  const { pressHandlers, onClick, onContextMenu } = useLongPress(props.onMenu);

  return (
    <button
      type="button"
      className="m-thread-group__header"
      data-collapsed={props.collapsed || undefined}
      aria-expanded={!props.collapsed}
      onClick={onClick(props.onToggle)}
      onContextMenu={onContextMenu}
      {...pressHandlers}
    >
      <ChevronRight className="m-thread-group__chevron size-3.5 shrink-0" />
      {entry.kind === "worktree-group" ? (
        <GitFork className="size-3.5 shrink-0" aria-label={t`Worktree`} />
      ) : null}
      <span className="m-thread-group__title" data-done={allDone || undefined}>
        {groupEntryTitle(entry)}
      </span>
      {entry.kind === "worktree-group" ? (
        <WorktreeGitSummaryBadge threadIds={threads.map((thread) => thread.id)} />
      ) : null}
      {props.projectName ? (
        <span className="m-thread-group__project">{props.projectName}</span>
      ) : null}
      <span
        className="m-thread-group__count"
        aria-label={threads.length === 1 ? t`1 thread` : t`${threads.length} threads`}
      >
        {threads.length}
      </span>
      <RelativeTime
        iso={groupLatestUpdatedAt(threads)}
        className="block shrink-0 font-mono text-[10px] tabular-nums text-muted"
      />
    </button>
  );
}

/**
 * Long-press menu for a worktree / provider group — the mobile stand-in for the
 * desktop sidebar's group context menu. Bulk actions fan out over the existing
 * per-thread command path, so no extra remote plumbing is needed.
 */
function GroupActionsSheet(props: {
  readonly entry: GroupEntry;
  readonly project?: Project | undefined;
  readonly closing?: boolean;
  readonly onThreadAction: (thread: Thread, action: ThreadAction) => void;
  readonly onNewThreadInWorktree: ThreadsViewProps["onNewThreadInWorktree"];
  readonly onDeleteWorktreeGroup: ThreadsViewProps["onDeleteWorktreeGroup"];
  readonly onOpenTerminal: ThreadsViewProps["onOpenTerminal"];
  readonly onRunProjectAction: ThreadsViewProps["onRunProjectAction"];
  readonly onClose: () => void;
}) {
  const { entry } = props;
  const { t } = useLingui();
  const threads = entry.group.threads;
  const title = groupEntryTitle(entry);
  const activeThreads = threads.filter((thread) => !thread.done);
  const allDone = activeThreads.length === 0;

  const act = (run: () => void) => {
    run();
    props.onClose();
  };

  return (
    <BottomSheet
      label={t`Actions for ${title}`}
      closeLabel={t`Close group actions`}
      closing={props.closing}
      onClose={props.onClose}
    >
      <div className="m-sheet-head">
        <span className="truncate">{title}</span>
        <span className="shrink-0 font-normal text-muted">{threads.length}</span>
      </div>
      <div className="m-sheet-list">
        {entry.kind === "worktree-group" ? (
          <button
            type="button"
            className="m-sheet-action"
            onClick={() =>
              act(() =>
                props.onNewThreadInWorktree({
                  projectId: entry.group.threads[0]!.projectId,
                  worktreePath: entry.group.worktreePath,
                  worktreeBranch: entry.group.worktreeBranch,
                }),
              )
            }
          >
            <Plus className="size-4 shrink-0 text-muted" />
            <span>
              <Trans>New thread in worktree</Trans>
            </span>
          </button>
        ) : null}
        {entry.kind === "worktree-group" ? (
          <button
            type="button"
            className="m-sheet-action"
            onClick={() =>
              act(() =>
                props.onOpenTerminal({
                  projectId: entry.group.threads[0]!.projectId,
                  worktreePath: entry.group.worktreePath,
                }),
              )
            }
          >
            <Terminal className="size-4 shrink-0 text-muted" />
            <span>
              <Trans>Open terminal</Trans>
            </span>
          </button>
        ) : null}
        {entry.kind === "worktree-group"
          ? props.project?.scripts?.actions?.map((action) => (
              <button
                type="button"
                key={action.id}
                className="m-sheet-action"
                onClick={() =>
                  act(() =>
                    props.onRunProjectAction({
                      projectId: entry.group.threads[0]!.projectId,
                      actionId: action.id,
                      worktreePath: entry.group.worktreePath,
                    }),
                  )
                }
              >
                <span className="size-4 shrink-0 text-muted">{resolveActionIcon(action.icon)}</span>
                <span>{action.name}</span>
              </button>
            ))
          : null}
        {allDone ? (
          <button
            type="button"
            className="m-sheet-action"
            onClick={() =>
              act(() =>
                threads.forEach(
                  (thread) =>
                    thread.done &&
                    props.onThreadAction(thread, {
                      kind: "set-done",
                      done: false,
                    }),
                ),
              )
            }
          >
            <CircleCheck className="size-4 shrink-0 text-muted" />
            <span>
              <Trans>Unmark all done</Trans>
            </span>
          </button>
        ) : (
          <button
            type="button"
            className="m-sheet-action"
            onClick={() =>
              act(() =>
                activeThreads.forEach((thread) =>
                  props.onThreadAction(thread, { kind: "set-done", done: true }),
                ),
              )
            }
          >
            <CircleCheck className="size-4 shrink-0 text-muted" />
            <span>
              <Trans>Mark all done</Trans>
            </span>
          </button>
        )}
        <button
          type="button"
          className="m-sheet-action text-warning"
          onClick={() =>
            act(() =>
              threads.forEach((thread) => props.onThreadAction(thread, { kind: "archive" })),
            )
          }
        >
          <Archive className="size-4 shrink-0" />
          <span>
            <Trans>Archive all threads</Trans>
          </span>
        </button>
        {entry.kind === "worktree-group" ? (
          <button
            type="button"
            className="m-sheet-action text-danger"
            onClick={() =>
              act(() =>
                props.onDeleteWorktreeGroup({
                  projectId: entry.group.threads[0]!.projectId,
                  worktreePath: entry.group.worktreePath,
                  threadIds: entry.group.threads.map((thread) => thread.id),
                }),
              )
            }
          >
            <Trash2 className="size-4 shrink-0" />
            <span>
              <Trans>Delete Worktree</Trans>
            </span>
          </button>
        ) : null}
      </div>
    </BottomSheet>
  );
}

export function ThreadsView(props: ThreadsViewProps) {
  const { t } = useLingui();
  // Each menu keeps a snapshot of its target (the thread / group), so the
  // slide-out still plays even when the action removes it from the list.
  const threadMenu = useSheet<Thread>();
  const groupMenu = useSheet<GroupEntry>();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(collapsedGroupCache),
  );
  const toggleCollapsed = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      collapsedGroupCache.clear();
      for (const groupKey of next) collapsedGroupCache.add(groupKey);
      return next;
    });
  };
  const counts = new Map<string, number>();
  for (const thread of props.threads) {
    counts.set(thread.projectId, (counts.get(thread.projectId) ?? 0) + 1);
  }
  const projectNames = new Map(props.projects.map((project) => [project.id, project.name]));
  const projectsById = new Map(props.projects.map((project) => [project.id, project]));
  const pickerProjects = props.projects.filter(
    (project) => !project.disabled || counts.has(project.id),
  );

  const currentProjectLabel = props.projectFilter
    ? (projectNames.get(props.projectFilter) ?? t`Project`)
    : t`All projects`;
  const projectPicker =
    pickerProjects.length > 1 ? (
      <SheetMenu
        label={t`Filter by project`}
        closeLabel={t`Close project filter`}
        items={[
          {
            id: "all",
            label: t`All projects`,
            hint: String(props.threads.length),
            selected: !props.projectFilter,
          },
          ...pickerProjects.map((project) => ({
            id: project.id,
            label: project.name,
            hint: String(counts.get(project.id) ?? 0),
            selected: props.projectFilter === project.id,
          })),
        ]}
        onSelect={(id) => props.onProjectFilterChange(id === "all" ? null : id)}
        trigger={({ open, isOpen }) => (
          <Button
            aria-label={t`Project`}
            aria-expanded={isOpen}
            className="m-threads__project-btn text-foreground"
            size="sm"
            variant="ghost"
            onPress={open}
          >
            <span className="truncate">{currentProjectLabel}</span>
            <ChevronDown className="size-3.5 text-muted" />
          </Button>
        )}
      />
    ) : null;

  const projectFilteredThreads = props.projectFilter
    ? props.threads.filter((thread) => thread.projectId === props.projectFilter)
    : props.threads;
  const searchQuery = normalizeSearchText(query);
  const visibleThreads = searchQuery
    ? projectFilteredThreads.filter((thread) =>
        threadMatchesSearch(thread, projectNames.get(thread.projectId), searchQuery),
      )
    : projectFilteredThreads;
  const controls =
    props.threads.length > 0 || projectPicker ? (
      <div className="m-threads__picker">
        {props.threads.length > 0 ? (
          <label className="m-thread-search">
            <Search className="size-3.5 shrink-0 text-muted" />
            <input
              aria-label={t`Search threads`}
              placeholder={t`Search threads`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button
                type="button"
                aria-label={t`Clear thread search`}
                onClick={() => setQuery("")}
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </label>
        ) : null}
        {projectPicker}
      </div>
    ) : null;

  if (visibleThreads.length === 0 && props.loading) {
    return (
      <div className="m-threads">
        <ThreadListSkeleton />
      </div>
    );
  }

  if (visibleThreads.length === 0) {
    const filteredOut = projectFilteredThreads.length > 0 && searchQuery.length > 0;
    return (
      <div className="m-threads">
        {controls}
        <EmptyState
          icon={<History className="size-5" />}
          title={
            filteredOut
              ? t`No matching threads`
              : props.projectFilter
                ? t`No threads in this project`
                : t`No threads yet`
          }
          hint={
            filteredOut
              ? t`Try a different search or project filter.`
              : t`Start a new thread to put an agent to work from this device.`
          }
          action={
            filteredOut ? (
              <Button size="sm" variant="secondary" onPress={() => setQuery("")}>
                <X className="size-4" />
                <Trans>Clear search</Trans>
              </Button>
            ) : (
              <Button className="text-white" size="sm" variant="secondary" onPress={props.onNew}>
                <Plus className="size-4" />
                <Trans>New thread</Trans>
              </Button>
            )
          }
        />
      </div>
    );
  }

  // Collapse threads that share a worktree (or an explicit group) into one
  // header. Standalone threads stay as plain rows. Reuses the desktop sidebar's
  // grouping so both surfaces agree on what counts as a group.
  const entries = groupThreads([...visibleThreads]);

  // A worktree-group child drops its worktree + git badges (the header carries
  // them); any group child drops the project name (the header carries that too).
  const renderThreadRow = (thread: Thread, group?: "worktree" | "thread") => (
    <ThreadRow
      key={thread.id}
      thread={thread}
      projectName={group ? undefined : projectNames.get(thread.projectId)}
      isActive={thread.id === props.selectedThreadId}
      hideWorktree={group === "worktree"}
      hideGitSummary={group === "worktree"}
      onPress={() => props.onOpenThread(thread)}
      onMenu={() => threadMenu.open(thread)}
    />
  );

  const menuThread = threadMenu.target;
  const menuGroupEntry = groupMenu.target;

  return (
    <div className="m-threads">
      {controls}
      <div className="m-thread-list">
        {entries.map((entry) => {
          if (entry.kind === "thread") return renderThreadRow(entry.thread);

          const key = groupEntryKey(entry);
          const isCollapsed = collapsed.has(key);
          // The worktree path is project-unique, so a group is always one
          // project; surface its name only in the cross-project "All" view.
          const headerProjectName = props.projectFilter
            ? undefined
            : projectNames.get(entry.group.threads[0]!.projectId);
          const groupKind = entry.kind === "worktree-group" ? "worktree" : "thread";
          return (
            <div className="m-thread-group" key={key} data-collapsed={isCollapsed || undefined}>
              <ThreadGroupHeader
                entry={entry}
                projectName={headerProjectName}
                collapsed={isCollapsed}
                onToggle={() => toggleCollapsed(key)}
                onMenu={() => groupMenu.open(entry)}
              />
              {isCollapsed ? null : (
                <div className="m-thread-group__items">
                  {entry.group.threads.map((thread) => renderThreadRow(thread, groupKind))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {menuThread ? (
        <ThreadActionsSheet
          key={menuThread.id}
          thread={menuThread}
          project={projectsById.get(menuThread.projectId)}
          closing={threadMenu.closing}
          onAction={(action) => props.onThreadAction(menuThread, action)}
          onNewThreadInWorktree={props.onNewThreadInWorktree}
          onDeleteWorktreeGroup={props.onDeleteWorktreeGroup}
          onOpenTerminal={props.onOpenTerminal}
          onRunProjectAction={props.onRunProjectAction}
          onClose={threadMenu.close}
        />
      ) : null}
      {menuGroupEntry ? (
        <GroupActionsSheet
          key={groupEntryKey(menuGroupEntry)}
          entry={menuGroupEntry}
          project={projectsById.get(menuGroupEntry.group.threads[0]!.projectId)}
          closing={groupMenu.closing}
          onThreadAction={props.onThreadAction}
          onNewThreadInWorktree={props.onNewThreadInWorktree}
          onDeleteWorktreeGroup={props.onDeleteWorktreeGroup}
          onOpenTerminal={props.onOpenTerminal}
          onRunProjectAction={props.onRunProjectAction}
          onClose={groupMenu.close}
        />
      ) : null}
    </div>
  );
}
