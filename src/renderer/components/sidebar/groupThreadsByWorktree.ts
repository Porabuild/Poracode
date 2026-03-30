import type { Thread } from "../../../shared/contracts";

export interface WorktreeThreadGroup {
  worktreePath: string;
  worktreeBranch: string;
  threads: Thread[];
}

export type ThreadListEntry =
  | { kind: "thread"; thread: Thread }
  | { kind: "worktree-group"; group: WorktreeThreadGroup };

/**
 * Groups project threads into an ordered list of entries.
 * Multi-thread worktree groups appear at the position of their first thread.
 * Solo worktree threads remain as regular thread entries.
 */
export function groupThreadsByWorktree(threads: Thread[]): ThreadListEntry[] {
  // First pass: collect threads by worktreePath
  const worktreeMap = new Map<string, Thread[]>();
  for (const thread of threads) {
    if (thread.worktreePath) {
      const arr = worktreeMap.get(thread.worktreePath);
      if (arr) arr.push(thread);
      else worktreeMap.set(thread.worktreePath, [thread]);
    }
  }

  // Identify multi-thread groups (2+)
  const multiGroups = new Map<string, WorktreeThreadGroup>();
  for (const [path, groupThreads] of worktreeMap) {
    if (groupThreads.length >= 2) {
      multiGroups.set(path, {
        worktreePath: path,
        worktreeBranch: groupThreads[0]!.worktreeBranch ?? path,
        threads: groupThreads,
      });
    }
  }

  // Second pass: build entries in original array order
  const emittedGroups = new Set<string>();
  const entries: ThreadListEntry[] = [];

  for (const thread of threads) {
    if (thread.worktreePath && multiGroups.has(thread.worktreePath)) {
      // Emit the group at the position of its first thread
      if (!emittedGroups.has(thread.worktreePath)) {
        emittedGroups.add(thread.worktreePath);
        entries.push({ kind: "worktree-group", group: multiGroups.get(thread.worktreePath)! });
      }
    } else {
      entries.push({ kind: "thread", thread });
    }
  }

  return entries;
}
