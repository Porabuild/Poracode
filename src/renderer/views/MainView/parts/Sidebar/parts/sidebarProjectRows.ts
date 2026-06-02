import type { Thread } from "@/shared/contracts";
import { groupThreads, type ThreadListEntry, type WorktreeThreadGroup } from "./groupThreads";
import type { ThreadSortMode } from "./sortMode";

export type SidebarVirtualRow =
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
  | { kind: "section-label"; key: string; label: string };

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

export function estimateSidebarRowSize(row: SidebarVirtualRow | undefined): number {
  if (!row) return 32;
  if (row.kind === "divider") return 11;
  if (row.kind === "section-label") return 28;
  if (row.kind === "worktree-group") return 34;
  if (row.kind === "thread-group") return 26;
  return 30;
}

export function estimateSidebarProjectListHeightPx(rows: SidebarVirtualRow[]): number {
  return rows.reduce((total, row) => total + estimateSidebarRowSize(row), 0);
}

function pushEntryRows(
  rows: SidebarVirtualRow[],
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
}): SidebarVirtualRow[] {
  const rows: SidebarVirtualRow[] = [];
  const dndGroup = `project-entries:${input.projectId}`;

  if (input.sortMode === "manual") {
    const orderedThreads = [...input.projectThreads].sort(
      (a, b) => Number(b.starred) - Number(a.starred),
    );
    orderedThreads.forEach((thread, idx) => {
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
  const hasBothSections = recentEntries.length > 0 && olderEntries.length > 0;
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

  pushList(starredEntries);
  pushList(recentEntries, starredEntries.length);
  if (hasBothSections) {
    rows.push({ kind: "section-label", key: "older-label", label: "Older" });
  }
  pushList(olderEntries, starredEntries.length + recentEntries.length);

  return rows;
}
