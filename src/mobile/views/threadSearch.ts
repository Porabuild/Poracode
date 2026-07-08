import type { Thread } from "@/shared/contracts";

/**
 * Pure text-search helpers for the mobile thread list. `normalizeSearchText`
 * trims and lowercases a value into a comparable token; `threadMatchesSearch`
 * tests a thread's searchable fields against an already-normalized query.
 */
export function normalizeSearchText(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function threadMatchesSearch(
  thread: Thread,
  projectName: string | undefined,
  query: string,
): boolean {
  const haystack = [
    thread.title,
    projectName,
    thread.worktreeBranch,
    thread.worktreePath,
    thread.agentKind,
    thread.groupName,
  ]
    .map(normalizeSearchText)
    .filter(Boolean)
    .join(" ");
  return haystack.includes(query);
}
