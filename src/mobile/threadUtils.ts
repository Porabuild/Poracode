import type { Thread } from "@/shared/contracts";
import { getBasename } from "@/shared/pathUtils";

/**
 * Every thread id that shares `worktreePath` within `projectId`. Deleting a
 * worktree removes the directory + branch, so the paired desktop must be told
 * about *all* threads pointing at it — otherwise the untold siblings survive as
 * rows aimed at a deleted path and fail to open.
 */
export function worktreeSiblingIds(
  threads: readonly Thread[],
  projectId: string,
  worktreePath: string,
): readonly string[] {
  return threads
    .filter((entry) => entry.projectId === projectId && entry.worktreePath === worktreePath)
    .map((entry) => entry.id);
}

/** A thread's worktree branch, falling back to the worktree folder basename. */
export function worktreeBranchOf(thread: Thread) {
  const worktreePath = thread.worktreePath;
  return worktreePath && (thread.worktreeBranch || getBasename(worktreePath));
}
