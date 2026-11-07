import type { GitWorktreeInfo } from "@/shared/contracts";

const comparable = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();

/**
 * True when the project's worktree list is loaded and no entry is `worktreePath`:
 * the checkout was removed (or moved) outside the app. An unloaded or empty list
 * says nothing, so the path is kept.
 */
export function isWorktreeMissing(
  worktreePath: string | undefined,
  worktrees: readonly GitWorktreeInfo[] | undefined,
): boolean {
  if (!worktreePath || !worktrees || worktrees.length === 0) return false;
  const wanted = comparable(worktreePath);
  return !worktrees.some((worktree) => comparable(worktree.path) === wanted);
}
