import { isThreadTurnActive, type Thread } from "./contracts";
import type { GitStateInterest } from "./gitState";

export const MAX_REMOTE_GIT_TARGET_INTERESTS = 4;

type GitInterestThread = Pick<
  Thread,
  "id" | "projectId" | "worktreePath" | "status" | "archived" | "updatedAt"
>;

export interface RemoteGitTargetInterestOptions {
  readonly selectedThreadId?: string | null;
  /**
   * Fill unused slots with recent idle threads. This is useful only for a
   * one-shot host warm-up; retained polling should stay selected/active only.
   */
  readonly includeRecentFallback?: boolean;
  readonly limit?: number;
}

/**
 * Converts thread-level UI demand into a small, deduplicated set of Git
 * targets. Selection wins, then live turns, then (only for one-shot warm-up)
 * recent idle threads.
 */
export function buildRemoteGitTargetInterests(
  threads: readonly GitInterestThread[],
  options: RemoteGitTargetInterestOptions = {},
): GitStateInterest[] {
  const limit = Math.max(0, Math.floor(options.limit ?? MAX_REMOTE_GIT_TARGET_INTERESTS));
  if (limit === 0) return [];

  const available = threads
    .filter((thread) => !thread.archived)
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const selected = options.selectedThreadId
    ? available.find((thread) => thread.id === options.selectedThreadId)
    : undefined;
  const active = available.filter(
    (thread) => thread.id !== selected?.id && isThreadTurnActive(thread.status),
  );
  const recent = options.includeRecentFallback
    ? available.filter(
        (thread) =>
          thread.id !== selected?.id && !active.some((candidate) => candidate.id === thread.id),
      )
    : [];
  const candidates = [...(selected ? [selected] : []), ...active, ...recent];

  const interests: GitStateInterest[] = [];
  const targetKeys = new Set<string>();
  for (const thread of candidates) {
    const targetKey = `${thread.projectId}\0${thread.worktreePath ?? ""}`;
    if (targetKeys.has(targetKey)) continue;
    targetKeys.add(targetKey);
    interests.push({
      kind: "target",
      projectId: thread.projectId,
      ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
      includePrDetails: true,
    });
    if (interests.length >= limit) break;
  }
  return interests;
}
