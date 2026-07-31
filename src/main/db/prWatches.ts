import { prWatchSchema, type PrWatch } from "@/shared/contracts";
import { getSqlite } from "./connection";

interface PrWatchRow {
  project_id: string;
  pr_number: number;
  head_branch: string;
  worktree_path: string | null;
  watch_enabled: number;
  auto_merge: number;
  agent_kind: string | null;
  config: string | null;
  last_comment_cursor: string | null;
  last_review_comment_cursor: string | null;
  last_review_cursor: string | null;
  last_check_key: string | null;
  active_thread_id: string | null;
  last_error: string | null;
}

function fromRow(row: PrWatchRow): PrWatch {
  return prWatchSchema.parse({
    projectId: row.project_id,
    prNumber: row.pr_number,
    headBranch: row.head_branch,
    ...(row.worktree_path ? { worktreePath: row.worktree_path } : {}),
    watchEnabled: row.watch_enabled === 1,
    autoMerge: row.auto_merge === 1,
    ...(row.agent_kind ? { agentKind: row.agent_kind } : {}),
    ...(row.config ? { config: JSON.parse(row.config) } : {}),
    lastCommentCursor: row.last_comment_cursor,
    lastReviewCommentCursor: row.last_review_comment_cursor,
    lastReviewCursor: row.last_review_cursor,
    lastCheckKey: row.last_check_key,
    activeThreadId: row.active_thread_id,
    lastError: row.last_error,
  });
}

export function dbGetPrWatches(): PrWatch[] {
  return (
    getSqlite()
      .prepare("SELECT * FROM pr_watches ORDER BY project_id, pr_number")
      .all() as PrWatchRow[]
  ).map(fromRow);
}

export function dbGetPrWatch(projectId: string, prNumber: number): PrWatch | null {
  const row = getSqlite()
    .prepare("SELECT * FROM pr_watches WHERE project_id = ? AND pr_number = ?")
    .get(projectId, prNumber) as PrWatchRow | undefined;
  return row ? fromRow(row) : null;
}

export function dbUpsertPrWatch(watch: PrWatch): void {
  const parsed = prWatchSchema.parse(watch);
  getSqlite()
    .prepare(
      `INSERT INTO pr_watches (
        project_id, pr_number, head_branch, worktree_path, watch_enabled,
        auto_merge, agent_kind, config, last_comment_cursor,
        last_review_comment_cursor, last_review_cursor, last_check_key,
        active_thread_id, last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, pr_number) DO UPDATE SET
        head_branch = excluded.head_branch,
        worktree_path = excluded.worktree_path,
        watch_enabled = excluded.watch_enabled,
        auto_merge = excluded.auto_merge,
        agent_kind = excluded.agent_kind,
        config = excluded.config,
        last_comment_cursor = excluded.last_comment_cursor,
        last_review_comment_cursor = excluded.last_review_comment_cursor,
        last_review_cursor = excluded.last_review_cursor,
        last_check_key = excluded.last_check_key,
        active_thread_id = excluded.active_thread_id,
        last_error = excluded.last_error`,
    )
    .run(
      parsed.projectId,
      parsed.prNumber,
      parsed.headBranch,
      parsed.worktreePath ?? null,
      parsed.watchEnabled ? 1 : 0,
      parsed.autoMerge ? 1 : 0,
      parsed.agentKind ?? null,
      parsed.config ? JSON.stringify(parsed.config) : null,
      parsed.lastCommentCursor,
      parsed.lastReviewCommentCursor,
      parsed.lastReviewCursor,
      parsed.lastCheckKey,
      parsed.activeThreadId,
      parsed.lastError,
    );
}

export function dbDeletePrWatch(projectId: string, prNumber: number): void {
  getSqlite()
    .prepare("DELETE FROM pr_watches WHERE project_id = ? AND pr_number = ?")
    .run(projectId, prNumber);
}
