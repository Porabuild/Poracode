import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { isThreadTurnActive, type Thread } from "@/shared/contracts";
import { groupThreads, type ThreadListEntry, type WorktreeThreadGroup } from "./groupThreads";
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
  | { kind: "divider"; key: string }
  | { kind: "section-label"; key: string; label: MessageDescriptor }
  | { kind: "see-more"; key: string; hiddenCount: number };

/** Default number of list items shown per project before the "See more" row. */
export const SIDEBAR_THREAD_LIST_PAGE_SIZE = 10;

function isRecent(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000;
}

function getEntryDate(entry: ThreadListEntry, field: "updatedAt" | "createdAt"): string {
  if (entry.kind === "thread") return entry.thread[field];
  return entry.group.threads.reduce(
    (latest, t) => (t[field] > latest ? t[field] : latest),
    entry.group.threads[0]![field],
  );
}

function entryIsStarred(entry: ThreadListEntry): boolean {
  if (entry.kind === "thread") return entry.thread.starred;
  return entry.group.threads.some((t) => t.starred);
}

/** Pinned or attention-needing threads are never hidden behind "See more". */
function threadIsProtected(thread: Thread): boolean {
  return thread.starred || isThreadTurnActive(thread.status) || thread.status === "error";
}

function entryIsProtected(entry: ThreadListEntry): boolean {
  if (entry.kind === "thread") return threadIsProtected(entry.thread);
  return entry.group.threads.some(threadIsProtected);
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

function pushEntryRows(
  rows: SidebarRow[],
  entry: ThreadListEntry,
  entryIndex: number,
  input: {
    projectId: string;
    dndGroup: string;
    dndDisabled: boolean;
    collapsedWorktrees: Record<string, boolean>;
    nextUngroupedIndex: () => number;
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
    if (!(input.collapsedWorktrees[entry.group.worktreePath] ?? false)) {
      entry.group.threads.forEach((thread, threadIndex) => {
        rows.push({
          kind: "thread",
          key: `wt:${entry.group.worktreePath}:thread:${thread.id}`,
          thread,
          threadIndex,
          group: `wt:${entry.group.worktreePath}`,
          showWorktreeBadge: false,
          showWorktreeFilesButton: false,
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
  if (!(input.collapsedWorktrees[`group:${groupKey}`] ?? false)) {
    entry.group.threads.forEach((thread, threadIndex) => {
      rows.push({
        kind: "thread",
        key: `group:${groupKey}:thread:${thread.id}`,
        thread,
        threadIndex,
        group: `group:${groupKey}`,
        showWorktreeBadge: !!thread.worktreePath,
        sortDisabled: input.dndDisabled,
      });
    });
  }
}

export function buildSidebarProjectRows(input: {
  projectId: string;
  projectThreads: Thread[];
  sortMode: ThreadSortMode;
  collapsedWorktrees: Record<string, boolean>;
  /** Max list items shown before "See more"; protected items are always kept. */
  visibleLimit: number;
}): SidebarRow[] {
  const rows: SidebarRow[] = [];
  const dndGroup = `project-entries:${input.projectId}`;

  if (input.sortMode === "manual") {
    const orderedThreads = [...input.projectThreads].sort(
      (a, b) => Number(b.starred) - Number(a.starred),
    );
    const { visible, hiddenCount } = selectVisible(
      orderedThreads,
      input.visibleLimit,
      threadIsProtected,
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
  const starredEntries = entries.filter(entryIsStarred);
  const unstarredEntries = entries.filter((e) => !entryIsStarred(e));
  const recentEntries = unstarredEntries.filter((e) => isRecent(getEntryDate(e, dateField)));
  const olderEntries = unstarredEntries.filter((e) => !isRecent(getEntryDate(e, dateField)));

  const { visible, hiddenCount } = selectVisible(
    [...starredEntries, ...recentEntries, ...olderEntries],
    input.visibleLimit,
    entryIsProtected,
  );
  const starredVisible = starredEntries.filter((e) => visible.has(e));
  const recentVisible = recentEntries.filter((e) => visible.has(e));
  const olderVisible = olderEntries.filter((e) => visible.has(e));
  const hasBothSections = recentVisible.length > 0 && olderVisible.length > 0;
  let ungroupedIndex = 0;

  const nextUngroupedIndex = () => ungroupedIndex++;
  const pushList = (list: ThreadListEntry[], offset = 0) => {
    list.forEach((entry, i) => {
      pushEntryRows(rows, entry, offset + i, {
        projectId: input.projectId,
        dndGroup,
        dndDisabled: true,
        collapsedWorktrees: input.collapsedWorktrees,
        nextUngroupedIndex,
      });
      const isLast = i === list.length - 1;
      if (isLast) return;
      if (
        entry.kind === "worktree-group" &&
        !(input.collapsedWorktrees[entry.group.worktreePath] ?? false)
      ) {
        rows.push({ kind: "divider", key: `wt-divider:${entry.group.worktreePath}` });
      } else if (
        entry.kind === "thread-group" &&
        !(input.collapsedWorktrees[`group:${entry.group.groupId}`] ?? false)
      ) {
        rows.push({ kind: "divider", key: `group-divider:${entry.group.groupId}` });
      }
    });
  };

  pushList(starredVisible);
  pushList(recentVisible, starredVisible.length);
  if (hasBothSections) {
    rows.push({ kind: "section-label", key: "older-label", label: msg`Older` });
  }
  pushList(olderVisible, starredVisible.length + recentVisible.length);
  if (hiddenCount > 0) rows.push({ kind: "see-more", key: "see-more", hiddenCount });

  return rows;
}
