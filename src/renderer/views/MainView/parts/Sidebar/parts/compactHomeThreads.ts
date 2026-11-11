import type { Thread } from "@/shared/contracts";
import type { ThreadSortMode } from "./sortMode";

/**
 * Orders the compact home list: one flat run of threads, never grouped by
 * worktree or provider. The caller passes the threads of one view (all active
 * or all done). Active threads follow the shared sort mode with starred
 * threads first (manual order keeps the stored order); the Done view lists the
 * newest activity first, like the desktop Done section.
 */
export function orderCompactHomeThreads(
  threads: readonly Thread[],
  sortMode: ThreadSortMode,
  showDone: boolean,
): Thread[] {
  const listed = [...threads];
  if (showDone) return listed.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const starredFirst = (a: Thread, b: Thread) => Number(b.starred) - Number(a.starred);
  if (sortMode === "manual") return listed.sort(starredFirst);
  const field = sortMode === "created" ? "createdAt" : "updatedAt";
  return listed.sort((a, b) => starredFirst(a, b) || b[field].localeCompare(a[field]));
}
