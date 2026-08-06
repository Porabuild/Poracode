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
    }
  | {
      kind: "thread-group";
      key: string;
      entry: Extract<ThreadListEntry, { kind: "thread-group" }>;
    }
  | { kind: "section-label"; key: string; label: MessageDescriptor }
  | { kind: "see-more"; key: string; hiddenCount: number };

/** Default number of list items shown per project before the "See more" row. */
export const SIDEBAR_THREAD_LIST_PAGE_SIZE = 10;

/**
 * Page size for the flat (cross-project) list. It is the sidebar's only list,
 * so it affords a taller first page than a per-project section.
 */
export const SIDEBAR_FLAT_THREAD_LIST_PAGE_SIZE = 20;

const EMPTY_THREAD_ID_SET: ReadonlySet<string> = new Set();

/**
 * Collapse state for both group kinds lives in one map: worktree groups are
 * keyed by worktree path and start collapsed on launch; manual thread groups
 * are keyed `group:<groupId>` and start expanded.
 */
export function isSidebarGroupCollapsed(
  collapsedWorktrees: Record<string, boolean>,
  key: string,
): boolean {
  return collapsedWorktrees[key] ?? !key.startsWith("group:");
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
  /** Canonical candidate positions for experiment groups. */
  experimentCandidateOrder?: ReadonlyMap<string, number>;
}): SidebarRow[] {
  const rows: SidebarRow[] = [];
  const dndGroup = `project-entries:${input.projectId}`;
  const liveBackgroundThreadIds = input.liveBackgroundThreadIds ?? EMPTY_THREAD_ID_SET;
  const isCollapsed = (key: string) =>
    input.expandAllGroups ? false : isSidebarGroupCollapsed(input.collapsedWorktrees, key);

  if (input.sortMode === "manual") {
    const orderedThreads = orderManualExperimentCandidates(
      [...input.projectThreads].sort((a, b) => Number(b.starred) - Number(a.starred)),
      input.experimentCandidateOrder,
    );
    const { visible, hiddenCount } = selectVisible(orderedThreads, input.visibleLimit, (t) =>
      threadIsProtected(t, liveBackgroundThreadIds),
    );
    orderedThreads.forEach((thread, idx) => {
      if (!visible.has(thread)) return;
      rows.push({
        kind: "thread",
        key: `thread:${thread.id}`,
        thread,
        threadIndex: idx,
        group: dndGroup,
        showWorktreeBadge: true,
        showWorktreeFilesButton: !!thread.worktreePath,
      });
    });
    if (hiddenCount > 0) rows.push({ kind: "see-more", key: "see-more", hiddenCount });
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

  const { visible, hiddenCount } = selectVisible(
    [...starredEntries, ...activeEntries, ...doneEntries],
    input.visibleLimit,
    (e) => entryIsProtected(e, liveBackgroundThreadIds),
  );
  const starredVisible = starredEntries.filter((e) => visible.has(e));
  const activeVisible = activeEntries.filter((e) => visible.has(e));
  const doneVisible = doneEntries.filter((e) => visible.has(e));
  let ungroupedIndex = 0;

  const nextUngroupedIndex = () => ungroupedIndex++;
  const pushList = (list: ThreadListEntry[], offset = 0) => {
    list.forEach((entry, i) => {
      pushEntryRows(rows, entry, offset + i, {
        projectId: input.projectId,
        dndGroup,
        dndDisabled: true,
        isCollapsed,
        nextUngroupedIndex,
        ...(input.experimentCandidateOrder
          ? { experimentCandidateOrder: input.experimentCandidateOrder }
          : {}),
      });
    });
  };

  pushList(starredVisible);
  pushList(activeVisible, starredVisible.length);
  if (doneVisible.length > 0) {
    rows.push({ kind: "section-label", key: "done-label", label: msg`Done` });
  }
  pushList(doneVisible, starredVisible.length + activeVisible.length);
  if (hiddenCount > 0) rows.push({ kind: "see-more", key: "see-more", hiddenCount });

  return rows;
}
