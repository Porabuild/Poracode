import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { isThreadTurnActive, type Thread } from "@/shared/contracts";
import {
  entryIsDone,
  entryIsStarred,
  entryLatestDate,
  groupThreads,
  type ThreadListEntry,
  type WorktreeThreadGroup,
} from "./groupThreads";
import type { ThreadSortMode } from "./sortMode";

export type SidebarRow =
  | {
      kind: "thread";
      key: string;
      thread: Thread;
      threadIndex: number;
      group: string;
      showWorktreeBadge: boolean;
      showWorktreeFilesButton?: boolean;
      sortDisabled?: boolean;
      /** Child of a worktree/thread group — rendered against a left rail. */
      inGroup?: boolean;
    }
  | {
      kind: "worktree-group";
      key: string;
      group: WorktreeThreadGroup;
      entryIndex: number;
      sortableGroup: string;
      sortDisabled: boolean;
      liveBackgroundThreadIds: ReadonlySet<string>;
    }
  | {
      kind: "thread-group";
      key: string;
      entry: Extract<ThreadListEntry, { kind: "thread-group" }>;
    }
  | {
      kind: "section-label";
      key: string;
      label: MessageDescriptor;
      doneThreads: Thread[];
      hasProtectedDoneThreads: boolean;
      /** Key into the sidebar collapse map; see {@link sidebarDoneSectionKey}. */
      collapseKey: string;
      collapsed: boolean;
      /** Every done thread in the list, including any hidden behind "See more". */
      doneCount: number;
    }
  | {
      kind: "see-more";
      key: string;
      hiddenCount: number;
      /** Set when the row pages a separately paged Done section, not the main list. */
      section?: "done";
    };

/** Default number of list items shown per project before the "See more" row. */
export const SIDEBAR_THREAD_LIST_PAGE_SIZE = 10;

/**
 * Page size for the flat (cross-project) list. It is the sidebar's only list,
 * so it affords a taller first page than a per-project section.
 */
export const SIDEBAR_FLAT_THREAD_LIST_PAGE_SIZE = 20;

/**
 * List id of the flat (cross-project) list, passed to `buildSidebarProjectRows`
 * as its `projectId` and used as its "See more" pager scope. Not a real
 * project id.
 */
export const FLAT_THREAD_LIST_ID = "__flat__";

/** Drag-and-drop sort group of the reorderable rows in one sidebar list. */
function sidebarSortGroup(listId: string): string {
  return `project-entries:${listId}`;
}

/**
 * Sort group of the flat list's rows. It mixes projects, so reordering in it
 * moves threads in the global thread order rather than within one project.
 */
export const FLAT_THREAD_LIST_SORT_GROUP = sidebarSortGroup(FLAT_THREAD_LIST_ID);

/**
 * Whether a thread can move in the flat Manual order. A remote mirror's place
 * comes from its host: each snapshot puts that host's threads back in host
 * order after the local ones, and mirrors aren't persisted locally, so a move
 * would be lost.
 */
export function canReorderInFlatList(thread: Thread): boolean {
  return thread.remoteServerId === undefined;
}

const EMPTY_THREAD_ID_SET: ReadonlySet<string> = new Set();

/**
 * Collapse state for every collapsible sidebar section lives in one map:
 * worktree groups are keyed by worktree path and start collapsed on launch;
 * manual thread groups are keyed `group:<groupId>` and start expanded; a list's
 * Done section is keyed by {@link sidebarDoneSectionKey} and starts collapsed.
 */
export function isSidebarGroupCollapsed(
  collapsedWorktrees: Record<string, boolean>,
  key: string,
): boolean {
  return collapsedWorktrees[key] ?? !key.startsWith("group:");
}

/** Collapse-map key for the Done section of one thread list (a project or the flat list). */
export function sidebarDoneSectionKey(listId: string): string {
  return `done:${listId}`;
}

/** Pinned or attention-needing threads are never hidden behind "See more". */
function threadIsProtected(thread: Thread, liveBackgroundThreadIds: ReadonlySet<string>): boolean {
  return (
    thread.starred ||
    isThreadTurnActive(thread.status) ||
    thread.status === "error" ||
    liveBackgroundThreadIds.has(thread.id)
  );
}

function entryIsProtected(
  entry: ThreadListEntry,
  liveBackgroundThreadIds: ReadonlySet<string>,
): boolean {
  if (entry.kind === "thread") return threadIsProtected(entry.thread, liveBackgroundThreadIds);
  return entry.group.threads.some((t) => threadIsProtected(t, liveBackgroundThreadIds));
}

function entryHasThread(entry: ThreadListEntry, threadIds: ReadonlySet<string>): boolean {
  if (entry.kind === "thread") return threadIds.has(entry.thread.id);
  return entry.group.threads.some((t) => threadIds.has(t.id));
}

/**
 * Chooses which items stay visible under a page limit. Protected items are
 * always kept; remaining slots fill in list order. Returns the kept set and the
 * count of items hidden behind "See more".
 */
function selectVisible<T>(
  items: T[],
  limit: number,
  isProtected: (item: T) => boolean,
): { visible: Set<T>; hiddenCount: number } {
  if (items.length <= limit) return { visible: new Set(items), hiddenCount: 0 };
  const visible = new Set<T>(items.filter(isProtected));
  for (const item of items) {
    if (visible.size >= limit) break;
    visible.add(item);
  }
  return { visible, hiddenCount: items.length - visible.size };
}

function compareExperimentCandidateOrder(
  candidateOrder: ReadonlyMap<string, number>,
  a: Thread,
  b: Thread,
): number {
  const aIndex = candidateOrder.get(a.id);
  const bIndex = candidateOrder.get(b.id);
  if (aIndex === undefined || bIndex === undefined) return 0;
  return aIndex - bIndex;
}

function pushEntryRows(
  rows: SidebarRow[],
  entry: ThreadListEntry,
  entryIndex: number,
  input: {
    projectId: string;
    dndGroup: string;
    dndDisabled: boolean;
    isCollapsed: (key: string) => boolean;
    nextUngroupedIndex: () => number;
    liveBackgroundThreadIds: ReadonlySet<string>;
    experimentCandidateOrder?: ReadonlyMap<string, number>;
  },
) {
  if (entry.kind === "thread") {
    const idx = input.nextUngroupedIndex();
    rows.push({
      kind: "thread",
      key: `thread:${entry.thread.id}`,
      thread: entry.thread,
      threadIndex: idx,
      group: input.dndGroup,
      showWorktreeBadge: true,
      showWorktreeFilesButton: !!entry.thread.worktreePath,
      sortDisabled: input.dndDisabled,
    });
    return;
  }

  if (entry.kind === "worktree-group") {
    rows.push({
      kind: "worktree-group",
      key: `wt:${entry.group.worktreePath}`,
      group: entry.group,
      entryIndex,
      sortableGroup: input.dndGroup,
      sortDisabled: input.dndDisabled,
      liveBackgroundThreadIds: input.liveBackgroundThreadIds,
    });
    if (!input.isCollapsed(entry.group.worktreePath)) {
      entry.group.threads.forEach((thread, threadIndex) => {
        rows.push({
          kind: "thread",
          key: `wt:${entry.group.worktreePath}:thread:${thread.id}`,
          thread,
          threadIndex,
          group: `wt:${entry.group.worktreePath}`,
          showWorktreeBadge: false,
          showWorktreeFilesButton: false,
          inGroup: true,
        });
      });
    }
    return;
  }

  const groupKey = entry.group.groupId;
  rows.push({
    kind: "thread-group",
    key: `group:${groupKey}`,
    entry,
  });
  if (!input.isCollapsed(`group:${groupKey}`)) {
    const candidateOrder = input.experimentCandidateOrder;
    const threads =
      candidateOrder?.size && entry.group.threads.some((thread) => candidateOrder.has(thread.id))
        ? [...entry.group.threads].sort((a, b) =>
            compareExperimentCandidateOrder(candidateOrder, a, b),
          )
        : entry.group.threads;
    threads.forEach((thread, threadIndex) => {
      rows.push({
        kind: "thread",
        key: `group:${groupKey}:thread:${thread.id}`,
        thread,
        threadIndex,
        group: `group:${groupKey}`,
        showWorktreeBadge: !!thread.worktreePath,
        showWorktreeFilesButton: !!thread.worktreePath,
        sortDisabled: input.dndDisabled,
        inGroup: true,
      });
    });
  }
}

function orderManualExperimentCandidates(
  threads: Thread[],
  candidateOrder: ReadonlyMap<string, number> | undefined,
): Thread[] {
  if (!candidateOrder || candidateOrder.size === 0) return threads;
  const candidatesByGroup = new Map<string, Thread[]>();
  for (const thread of threads) {
    if (!thread.groupId || !candidateOrder.has(thread.id)) continue;
    const group = candidatesByGroup.get(thread.groupId) ?? [];
    group.push(thread);
    candidatesByGroup.set(thread.groupId, group);
  }
  for (const group of candidatesByGroup.values()) {
    group.sort((a, b) => compareExperimentCandidateOrder(candidateOrder, a, b));
  }
  const emitted = new Set<string>();
  const ordered: Thread[] = [];
  for (const thread of threads) {
    if (!thread.groupId || !candidateOrder.has(thread.id)) {
      ordered.push(thread);
      continue;
    }
    if (emitted.has(thread.groupId)) continue;
    emitted.add(thread.groupId);
    ordered.push(...(candidatesByGroup.get(thread.groupId) ?? [thread]));
  }
  return ordered;
}

/**
 * Pushes a list's live entries, then its Done section, each with its "See
 * more" row. Every sort mode shares this layout and only orders the entries
 * and turns them into rows itself.
 */
function pushListSections(
  rows: SidebarRow[],
  input: {
    liveEntries: ThreadListEntry[];
    /** Newest activity first. */
    doneEntries: ThreadListEntry[];
    doneCollapseKey: string;
    doneCollapsed: boolean;
    visibleLimit: number;
    doneVisibleLimit: number | undefined;
    openThreadIds: ReadonlySet<string>;
    isEntryProtected: (entry: ThreadListEntry) => boolean;
    experimentCandidateOrder: ReadonlyMap<string, number> | undefined;
    pushEntries: (entries: ThreadListEntry[], offset: number, section: "live" | "done") => void;
  },
) {
  const { doneEntries, doneCollapsed, isEntryProtected } = input;
  // A collapsed Done section lists only entries holding an open thread, so the
  // selection doesn't vanish.
  const listedDoneEntries = doneCollapsed
    ? doneEntries.filter((entry) => entryHasThread(entry, input.openThreadIds))
    : doneEntries;

  // An expanded inline Done shares the list's page. Otherwise Done is paged on
  // its own: by `doneVisibleLimit` when given, or in full while collapsed.
  const doneSharesMainPage = input.doneVisibleLimit === undefined && !doneCollapsed;
  const mainPage = selectVisible(
    [...input.liveEntries, ...(doneSharesMainPage ? listedDoneEntries : [])],
    input.visibleLimit,
    isEntryProtected,
  );
  const donePage = doneSharesMainPage
    ? mainPage
    : selectVisible(
        listedDoneEntries,
        input.doneVisibleLimit ?? listedDoneEntries.length,
        isEntryProtected,
      );
  const liveVisible = input.liveEntries.filter((e) => mainPage.visible.has(e));
  const doneVisible = listedDoneEntries.filter((e) => donePage.visible.has(e));

  const pushMainSeeMore = () => {
    if (mainPage.hiddenCount > 0) {
      rows.push({ kind: "see-more", key: "see-more", hiddenCount: mainPage.hiddenCount });
    }
  };

  input.pushEntries(liveVisible, 0, "live");
  // A main-list pager that covers no done entries goes above the Done header,
  // so it doesn't read as part of Done.
  if (!doneSharesMainPage) pushMainSeeMore();
  // The header carries the toggle, so it stays even when "See more" hides every done entry.
  if (doneEntries.length > 0) {
    const allDoneThreads = doneEntries.flatMap((entry) =>
      entry.kind === "thread" ? [entry.thread] : entry.group.threads,
    );
    const candidateOrder = input.experimentCandidateOrder;
    const doneThreads = candidateOrder
      ? allDoneThreads.filter((thread) => !candidateOrder.has(thread.id))
      : allDoneThreads;
    const doneCount = allDoneThreads.length;
    rows.push({
      kind: "section-label",
      key: "done-label",
      label: msg`Done (${doneCount})`,
      doneThreads,
      hasProtectedDoneThreads: doneThreads.length < allDoneThreads.length,
      collapseKey: input.doneCollapseKey,
      collapsed: doneCollapsed,
      doneCount,
    });
  }
  input.pushEntries(doneVisible, liveVisible.length, "done");
  if (doneSharesMainPage) {
    pushMainSeeMore();
  } else if (donePage.hiddenCount > 0) {
    rows.push({
      kind: "see-more",
      key: "done-see-more",
      hiddenCount: donePage.hiddenCount,
      section: "done",
    });
  }
}

export function buildSidebarProjectRows(input: {
  projectId: string;
  projectThreads: Thread[];
  sortMode: ThreadSortMode;
  collapsedWorktrees: Record<string, boolean>;
  /** Treat every group as expanded regardless of collapse state (keyboard navigation). */
  expandAllGroups?: boolean;
  /** Max list items shown before "See more"; protected items are always kept. */
  visibleLimit: number;
  /** Threads with live background activity — kept visible like working ones. */
  liveBackgroundThreadIds?: ReadonlySet<string>;
  /** Threads open in a pane — kept visible even inside a collapsed Done section. */
  openThreadIds?: ReadonlySet<string>;
  /** Canonical candidate positions for experiment groups. */
  experimentCandidateOrder?: ReadonlyMap<string, number>;
  /**
   * Pages the Done section on its own with this limit, for a list that shows
   * Done apart from its other rows. Done entries then take no `visibleLimit`
   * slots. Without it, Done shares the list's page.
   */
  doneVisibleLimit?: number;
  /**
   * Manual order only. A live thread that fails this keeps its place in the
   * list but can't be dragged to a new one or take a drop. Defaults to every
   * thread passing.
   */
  canReorderThread?: (thread: Thread) => boolean;
}): SidebarRow[] {
  const rows: SidebarRow[] = [];
  const dndGroup = sidebarSortGroup(input.projectId);
  const liveBackgroundThreadIds = input.liveBackgroundThreadIds ?? EMPTY_THREAD_ID_SET;
  const isCollapsed = (key: string) =>
    input.expandAllGroups ? false : isSidebarGroupCollapsed(input.collapsedWorktrees, key);
  const doneCollapseKey = sidebarDoneSectionKey(input.projectId);
  const sections = {
    doneCollapseKey,
    doneCollapsed: isCollapsed(doneCollapseKey),
    visibleLimit: input.visibleLimit,
    doneVisibleLimit: input.doneVisibleLimit,
    openThreadIds: input.openThreadIds ?? EMPTY_THREAD_ID_SET,
    isEntryProtected: (e: ThreadListEntry) => entryIsProtected(e, liveBackgroundThreadIds),
    experimentCandidateOrder: input.experimentCandidateOrder,
  };

  if (input.sortMode === "manual") {
    // Live threads keep the stored order, starred first, with no worktree or
    // provider grouping. Done threads sink into the Done section ordered by
    // last update, as in the date modes, and can't be dragged.
    const liveThreads = orderManualExperimentCandidates(
      input.projectThreads
        .filter((thread) => !thread.done)
        .sort((a, b) => Number(b.starred) - Number(a.starred)),
      input.experimentCandidateOrder,
    );
    // A live row's sort index is its place among all live threads, hidden ones
    // included, which is the order the drag handler's index fallback rebuilds.
    // Done rows share the sortable group, so their indices start after the last
    // live thread's. dnd-kit restores a canceled drag by index order, and an
    // overlap would put a live row back among the done rows.
    const liveIndex = new Map(liveThreads.map((thread, idx) => [thread.id, idx]));
    const doneThreads = input.projectThreads
      .filter((thread) => thread.done)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const toEntry = (thread: Thread): ThreadListEntry => ({ kind: "thread", thread });
    pushListSections(rows, {
      ...sections,
      liveEntries: liveThreads.map(toEntry),
      doneEntries: doneThreads.map(toEntry),
      pushEntries: (entries, _offset, section) => {
        entries.forEach((entry, i) => {
          if (entry.kind !== "thread") return;
          const { thread } = entry;
          rows.push({
            kind: "thread",
            key: `thread:${thread.id}`,
            thread,
            threadIndex:
              section === "done" ? liveThreads.length + i : (liveIndex.get(thread.id) ?? i),
            group: dndGroup,
            showWorktreeBadge: true,
            showWorktreeFilesButton: !!thread.worktreePath,
            ...(section === "done" || input.canReorderThread?.(thread) === false
              ? { sortDisabled: true }
              : {}),
          });
        });
      },
    });
    return rows;
  }

  const dateField = input.sortMode === "created" ? "createdAt" : "updatedAt";
  const entries = groupThreads(
    [...input.projectThreads].sort((a, b) => b[dateField].localeCompare(a[dateField])),
  );
  // One pass into the three sections: done entries sink to the bottom, newest
  // activity first — independent of the sort mode, which only orders the live
  // list above. Their sort key is computed once per entry rather than per
  // comparison, since a group entry has to scan its threads for it.
  const starredEntries: ThreadListEntry[] = [];
  const activeEntries: ThreadListEntry[] = [];
  const datedDoneEntries: { entry: ThreadListEntry; updatedAt: string }[] = [];
  for (const entry of entries) {
    if (entryIsDone(entry)) {
      datedDoneEntries.push({ entry, updatedAt: entryLatestDate(entry, "updatedAt") });
    } else if (entryIsStarred(entry)) {
      starredEntries.push(entry);
    } else {
      activeEntries.push(entry);
    }
  }
  const doneEntries = datedDoneEntries
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((item) => item.entry);

  let ungroupedIndex = 0;
  const nextUngroupedIndex = () => ungroupedIndex++;
  pushListSections(rows, {
    ...sections,
    liveEntries: [...starredEntries, ...activeEntries],
    doneEntries,
    pushEntries: (list, offset) => {
      list.forEach((entry, i) => {
        pushEntryRows(rows, entry, offset + i, {
          projectId: input.projectId,
          dndGroup,
          dndDisabled: true,
          isCollapsed,
          nextUngroupedIndex,
          liveBackgroundThreadIds,
          ...(input.experimentCandidateOrder
            ? { experimentCandidateOrder: input.experimentCandidateOrder }
            : {}),
        });
      });
    },
  });

  return rows;
}
