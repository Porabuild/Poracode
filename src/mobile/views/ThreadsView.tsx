import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type UIEvent as ReactUIEvent,
} from "react";
import { createPortal } from "react-dom";
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
import type { Project, Thread } from "@/shared/contracts";
import { getBasename } from "@/shared/pathUtils";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";
import { ThreadProviderIcon, getStatusTone } from "@/renderer/components/providers";
import { useThreadHasBackgroundActivity } from "@/renderer/hooks/uiSelectors";
import { InlineRenameInput } from "@/renderer/views/MainView/parts/Sidebar/parts/InlineRenameInput";
import {
  entryIsStarred,
  entryLatestDate,
  groupThreads,
  isRecent,
  type ThreadListEntry,
} from "@/renderer/views/MainView/parts/Sidebar/parts/groupThreads";
import { useLongPress } from "@/renderer/hooks/useLongPress";
import { resolveActionIcon } from "@/renderer/utils/actionIcons";
import { BottomSheet, EmptyState, SheetMenu, Skeleton, useSheet } from "../components";
import { useKeyboardVisibilityOffset } from "../useKeyboardOffset";
import { GitSummaryBadge, WorktreeGitSummaryBadge } from "../GitSummaryParts";
import { worktreeBranchOf, worktreeSiblingIds } from "../threadUtils";
import type { ThreadAction } from "../useRemoteDesktop";
import { normalizeSearchText, threadMatchesSearch } from "./threadSearch";
import {
  groupEntryKey,
  groupEntryTitle,
  groupLatestUpdatedAt,
  type GroupEntry,
} from "./threadGrouping";

export interface ThreadsViewProps {
  readonly projects: readonly Project[];
  readonly threads: readonly Thread[];
  readonly selectedThreadId: string | null;
  /** `null` shows every project in one flat list. */
  readonly projectFilter: string | null;
  /** First load with no cached threads yet: show placeholder rows. */
  readonly loading?: boolean;
  /**
   * Header-driven search (narrow home screen): when set, the always-visible
   * inline search box is replaced by an input rendered into the shell header
   * while `searchOpen` is true. Leave unset for the inline box (wide sidebar).
   */
  readonly searchOpen?: boolean;
  readonly searchContainer?: HTMLElement | null;
  readonly onSearchOpenChange?: (open: boolean) => void;
  /** Reports scroll direction so the shell can collapse/reveal its chrome. */
  readonly onChromeHiddenChange?: (hidden: boolean) => void;
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
  /** Replaces the default no-threads empty state when setup blocks composition. */
  readonly emptyStateOverride?: ReactNode;
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

/** Long-press (touch) or right-click context menu for a thread row. */
function ThreadActionsSheet(props: {
  readonly thread: Thread;
  readonly project?: Project | undefined;
  /** Full thread list, so a worktree delete can gather every sibling id. */
  readonly threads: readonly Thread[];
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
  const worktreeBranch = worktreeBranchOf(thread);

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
                    threadIds: worktreeSiblingIds(props.threads, thread.projectId, worktreePath),
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
  const hasBackgroundActivity = useThreadHasBackgroundActivity(thread.id);
  const tone = getStatusTone(thread, { hasBackgroundActivity });
  const live = tone !== "inactive" && tone !== "done";
  const worktreeName =
    !props.hideWorktree && thread.worktreePath ? getBasename(thread.worktreePath) : undefined;
  const longPressHandlers = useLongPress(props.onMenu);

  return (
    <button
      type="button"
      className="m-thread-row"
      data-active={props.isActive || undefined}
      data-live={live || undefined}
      onClick={props.onPress}
      {...longPressHandlers}
    >
      <ThreadProviderIcon thread={thread} tone={tone} className="size-4 shrink-0" />
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
  const longPressHandlers = useLongPress(props.onMenu);

  return (
    <button
      type="button"
      className="m-thread-group__header"
      data-collapsed={props.collapsed || undefined}
      aria-expanded={!props.collapsed}
      onClick={props.onToggle}
      {...longPressHandlers}
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

/** Trigger button for the project filter's `SheetMenu`: shows the active
 * project label and chevron, opening the picker on press. */
function ProjectFilterTrigger(props: {
  readonly label: string;
  readonly isOpen: boolean;
  readonly onPress: () => void;
}) {
  const { t } = useLingui();
  return (
    <Button
      aria-label={t`Project`}
      aria-expanded={props.isOpen}
      className="m-threads__project-btn text-foreground"
      size="sm"
      variant="ghost"
      onPress={props.onPress}
    >
      <span className="truncate">{props.label}</span>
      <ChevronDown className="size-3.5 text-muted" />
    </Button>
  );
}

/**
 * Binds the project filter's current label to a `SheetMenu` `trigger`
 * function. Curried at module scope (rather than an inline arrow in JSX) so
 * `ThreadsView`'s render body never defines a fresh component.
 */
function renderProjectFilterTrigger(label: string) {
  return (api: { readonly open: () => void; readonly isOpen: boolean }) => (
    <ProjectFilterTrigger label={label} isOpen={api.isOpen} onPress={api.open} />
  );
}

/** Scroll travel (px) in one direction before the chrome collapses/reveals. */
const CHROME_SCROLL_SLOP_PX = 6;

/**
 * How long the floating search's shrink-into-the-icon exit stays mounted: a
 * beat past the 0.22s `m-search-float-out` animation in styles.css, so an
 * animation that starts a frame late still finishes before the unmount. The
 * timer (not `animationend`) drives the unmount so it still fires under
 * reduced motion, where the animation is disabled.
 */
const SEARCH_EXIT_MS = 260;

export function ThreadsView(props: ThreadsViewProps) {
  const { t } = useLingui();
  // Each menu keeps a snapshot of its target (the thread / group), so the
  // slide-out still plays even when the action removes it from the list.
  const threadMenu = useSheet<Thread>();
  const groupMenu = useSheet<GroupEntry>();
  const [query, setQuery] = useState("");

  // Header-driven search vs. the wide sidebar's inline box.
  const floatingSearch = props.searchOpen !== undefined;
  // While booting (threads unknown) the inline box renders anyway so the
  // header doesn't pop in once cached/live data lands.
  const searchVisible = floatingSearch
    ? props.searchOpen === true
    : props.threads.length > 0 || props.loading === true;
  // Closing the floating search keeps the box mounted briefly so it can play
  // its exit animation back into the header icon. The exiting flag flips
  // during render (not in an effect): the box must swap to the exit animation
  // in the same commit `searchOpen` drops, or it would unmount for a frame
  // and remount — skipping the animation and replaying the input's autofocus
  // (which yanks the keyboard back up mid-close).
  const [searchExiting, setSearchExiting] = useState(false);
  const searchFloatRef = useRef<HTMLDivElement | null>(null);
  const [prevSearchOpen, setPrevSearchOpen] = useState(props.searchOpen === true);
  if ((props.searchOpen === true) !== prevSearchOpen) {
    setPrevSearchOpen(props.searchOpen === true);
    setSearchExiting(floatingSearch && !props.searchOpen && prevSearchOpen);
  }
  useEffect(() => {
    if (!searchExiting) return;
    // The closing box keeps no state: drop the filter (a hidden query would
    // read as missing threads) and release focus so the keyboard dismisses
    // with the animation, not after it.
    setQuery("");
    const overlay = searchFloatRef.current;
    if (overlay?.contains(document.activeElement) && document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    const timer = setTimeout(() => setSearchExiting(false), SEARCH_EXIT_MS);
    return () => clearTimeout(timer);
  }, [searchExiting]);
  // Autofocus only fires on mount — re-focus when the search reopens while
  // the exiting box is still mounted.
  useEffect(() => {
    if (floatingSearch && props.searchOpen) searchFloatRef.current?.querySelector("input")?.focus();
  }, [floatingSearch, props.searchOpen]);
  // Dismissing the on-screen keyboard dismisses the search with it. Taps
  // outside close via the overlay's onBlur; this covers dismissals that hide
  // the keyboard WITHOUT blurring the input (Android's back button, iPad's
  // keyboard-dismiss key): once the keyboard has been up while searching, its
  // offset falling back to 0 closes the box.
  const keyboardOffset = useKeyboardVisibilityOffset();
  const keyboardWasUpRef = useRef(false);
  const onSearchOpenChange = props.onSearchOpenChange;
  useEffect(() => {
    if (!floatingSearch || !props.searchOpen) {
      keyboardWasUpRef.current = false;
      return;
    }
    if (keyboardOffset > 0) {
      keyboardWasUpRef.current = true;
      return;
    }
    if (!keyboardWasUpRef.current) return;
    keyboardWasUpRef.current = false;
    onSearchOpenChange?.(false);
  }, [floatingSearch, props.searchOpen, keyboardOffset, onSearchOpenChange]);

  // Scroll-direction reporting with hysteresis: down hides the shell chrome,
  // up (or resting near the top) reveals it.
  const lastScrollTopRef = useRef(0);
  const handleListScroll = (event: ReactUIEvent<HTMLDivElement>) => {
    const onChromeHiddenChange = props.onChromeHiddenChange;
    if (!onChromeHiddenChange) return;
    const top = event.currentTarget.scrollTop;
    const delta = top - lastScrollTopRef.current;
    lastScrollTopRef.current = top;
    if (top <= 12) onChromeHiddenChange(false);
    else if (delta > CHROME_SCROLL_SLOP_PX) onChromeHiddenChange(true);
    else if (delta < -CHROME_SCROLL_SLOP_PX) onChromeHiddenChange(false);
  };
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
  // Render the trigger while projects are still unknown (booting with a cold
  // cache) so it doesn't pop in when data arrives; single-project setups
  // resolve to no picker as usual once loading settles.
  const projectPicker =
    pickerProjects.length > 1 || (props.projects.length === 0 && props.loading === true) ? (
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
        trigger={renderProjectFilterTrigger(currentProjectLabel)}
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
  const searchField = (
    <label className="m-thread-search">
      <Search className="size-3.5 shrink-0 text-muted" />
      <input
        aria-label={t`Search threads`}
        placeholder={t`Search threads`}
        value={query}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- the floating box appears because the user tapped the header search button
        autoFocus={floatingSearch}
        onChange={(event) => setQuery(event.target.value)}
      />
      {floatingSearch ? (
        <button
          type="button"
          aria-label={t`Close search`}
          onClick={() => props.onSearchOpenChange?.(false)}
        >
          <X className="size-3.5" />
        </button>
      ) : query ? (
        <button type="button" aria-label={t`Clear thread search`} onClick={() => setQuery("")}>
          <X className="size-3.5" />
        </button>
      ) : null}
    </label>
  );
  // Header mode portals the search into the shell's topbar zone; inline mode
  // keeps it pinned in the picker row. While closing, the search lingers with
  // [data-closing] until its shrink-into-the-icon animation finishes.
  const searchOverlayNode =
    floatingSearch && (searchVisible || searchExiting) ? (
      <div
        ref={searchFloatRef}
        className="m-search-float"
        data-closing={searchExiting || undefined}
        onBlur={(event) => {
          // Tapping outside dismisses the search right away (the exit plays
          // while the keyboard is still sliding down); focus moving within
          // the box (e.g. to its clear button) is not a dismissal.
          if (!searchVisible) return;
          const next = event.relatedTarget;
          if (next instanceof Node && event.currentTarget.contains(next)) return;
          props.onSearchOpenChange?.(false);
        }}
      >
        {searchField}
      </div>
    ) : null;
  const searchOverlay =
    props.searchContainer && searchOverlayNode
      ? createPortal(searchOverlayNode, props.searchContainer)
      : searchOverlayNode;
  const inlineSearch = !floatingSearch && searchVisible ? searchField : null;
  const controls =
    inlineSearch || projectPicker ? (
      <div className="m-threads__picker">
        {inlineSearch}
        {projectPicker}
      </div>
    ) : null;

  // Show the boot skeleton only when NOT searching: a search that matches
  // nothing during the pre-boot cache load should render "No matching threads",
  // not six fake shimmer rows.
  if (visibleThreads.length === 0 && props.loading && searchQuery.length === 0) {
    return (
      <div className="m-threads">
        {controls}
        {searchOverlay}
        <ThreadListSkeleton />
      </div>
    );
  }

  if (visibleThreads.length === 0) {
    const filteredOut = projectFilteredThreads.length > 0 && searchQuery.length > 0;
    const emptyStateOverride = !filteredOut ? props.emptyStateOverride : undefined;
    return (
      <div className="m-threads">
        {controls}
        {searchOverlay}
        {emptyStateOverride ?? (
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
            {...(filteredOut
              ? {
                  action: (
                    <Button size="sm" variant="secondary" onPress={() => setQuery("")}>
                      <X className="size-4" />
                      <Trans>Clear search</Trans>
                    </Button>
                  ),
                }
              : {})}
          />
        )}
      </div>
    );
  }

  // Collapse threads that share a worktree (or an explicit group) into one
  // header. Standalone threads stay as plain rows. Reuses the desktop sidebar's
  // grouping so both surfaces agree on what counts as a group.
  const groupedEntries = groupThreads([...visibleThreads]);
  // Split into Pinned / Current (updated < 24h) / Older sections, floated in
  // that order and labeled — mirroring the desktop sidebar. `visibleThreads` is
  // already recency-sorted, so these stable partitions keep that order within
  // each section. Pinning any group member floats the whole group (entryIsStarred).
  const pinnedEntries = groupedEntries.filter(entryIsStarred);
  const unpinnedEntries = groupedEntries.filter((entry) => !entryIsStarred(entry));
  const currentEntries = unpinnedEntries.filter((entry) =>
    isRecent(entryLatestDate(entry, "updatedAt")),
  );
  const olderEntries = unpinnedEntries.filter(
    (entry) => !isRecent(entryLatestDate(entry, "updatedAt")),
  );
  const sections = [
    { key: "pinned", label: t`Pinned`, entries: pinnedEntries },
    { key: "current", label: t`Current`, entries: currentEntries },
    { key: "older", label: t`Older`, entries: olderEntries },
  ].filter((section) => section.entries.length > 0);
  // A lone section spans the whole list, so its label would be noise; only show
  // the headers once there is an actual boundary between two or more sections.
  const showSectionLabels = sections.length > 1;

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

  const renderEntry = (entry: ThreadListEntry) => {
    if (entry.kind === "thread") return renderThreadRow(entry.thread);

    const key = groupEntryKey(entry);
    const isCollapsed = collapsed.has(key);
    // The worktree path is project-unique, so a group is always one project;
    // surface its name only in the cross-project "All" view.
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
  };

  const menuThread = threadMenu.target;
  const menuGroupEntry = groupMenu.target;

  return (
    <div className="m-threads">
      {controls}
      {searchOverlay}
      <div className="m-thread-list" onScroll={handleListScroll}>
        {sections.map((section) => (
          <Fragment key={section.key}>
            {showSectionLabels ? <div className="m-thread-section">{section.label}</div> : null}
            {section.entries.map((entry) => renderEntry(entry))}
          </Fragment>
        ))}
      </div>
      {menuThread ? (
        <ThreadActionsSheet
          key={menuThread.id}
          thread={menuThread}
          project={projectsById.get(menuThread.projectId)}
          threads={props.threads}
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
