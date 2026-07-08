import type { Thread } from "@/shared/contracts";
import { getBasename } from "@/shared/pathUtils";
import type { ThreadListEntry } from "@/renderer/views/MainView/parts/Sidebar/parts/groupThreads";

/**
 * Pure helpers for rendering worktree / provider thread groups in the mobile
 * thread list: deriving a stable collapse key, the header label, and the latest
 * activity timestamp for a group's threads.
 */
export type GroupEntry = Extract<ThreadListEntry, { kind: "worktree-group" | "thread-group" }>;

/** Stable collapse key per group: worktree path or explicit group id. */
export function groupEntryKey(entry: GroupEntry): string {
  return entry.kind === "worktree-group"
    ? `wt:${entry.group.worktreePath}`
    : `group:${entry.group.groupId}`;
}

/** Header label: the branch (or worktree folder), else the group's name. */
export function groupEntryTitle(entry: GroupEntry): string {
  if (entry.kind === "worktree-group") {
    const { worktreeBranch, worktreePath } = entry.group;
    if (worktreeBranch && worktreeBranch !== worktreePath) return worktreeBranch;
    return getBasename(worktreePath);
  }
  return entry.group.groupName;
}

export function groupLatestUpdatedAt(threads: readonly Thread[]): string {
  return threads.reduce(
    (latest, thread) => (thread.updatedAt > latest ? thread.updatedAt : latest),
    threads[0]!.updatedAt,
  );
}
