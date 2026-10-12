import {
  prWatchBlockedReasonSchema,
  prWatchSchema,
  type PrWatch,
  type PrWatchBlockedReason,
} from "@/shared/contracts";
import { getSqlite } from "./connection";
import { projectPersistedSelectionBinding } from "@/shared/persistedSelectionBinding";
import { assertSelectionJsonReplaceable } from "./persistedSelectionData";

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
  blocked_reason: string | null;
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
    ...(row.config ? { config: projectPersistedSelectionBinding(JSON.parse(row.config)) } : {}),
    lastCommentCursor: row.last_comment_cursor,
    lastReviewCommentCursor: row.last_review_comment_cursor,
    lastReviewCursor: row.last_review_cursor,
    lastCheckKey: row.last_check_key,
    activeThreadId: row.active_thread_id,
    lastError: row.last_error,
    blockedReason: row.blocked_reason,
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
  const sqlite = getSqlite();
  sqlite
    .transaction(() => {
      const previous = sqlite
        .prepare("SELECT config FROM pr_watches WHERE project_id = ? AND pr_number = ?")
        .get(parsed.projectId, parsed.prNumber) as { config: string | null } | undefined;
      assertSelectionJsonReplaceable(previous?.config);
      sqlite
        .prepare(
          `INSERT INTO pr_watches (
        project_id, pr_number, head_branch, worktree_path, watch_enabled,
        auto_merge, agent_kind, config, last_comment_cursor,
        last_review_comment_cursor, last_review_cursor, last_check_key,
        active_thread_id, last_error, blocked_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        last_error = excluded.last_error,
        blocked_reason = excluded.blocked_reason`,
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
          parsed.blockedReason,
        );
    })
    .immediate();
}

export function dbDeletePrWatch(projectId: string, prNumber: number): void {
  getSqlite()
    .prepare("DELETE FROM pr_watches WHERE project_id = ? AND pr_number = ?")
    .run(projectId, prNumber);
}

/**
 * The runtime-bookkeeping fields a watch's own lifecycle may change in place:
 * status-only columns. Everything execution-defining — `head_branch`,
 * `watch_enabled`, `auto_merge`, `agent_kind`, `config` — is absent, so
 * startup normalization, settlement, blocks, error recording, and launch
 * results write through {@link dbPatchPrWatchRuntime} and stored config
 * bytes — including unsupported raw metadata the guarded full save would
 * refuse to overwrite — remain exact.
 */
export interface PrWatchRuntimePatch {
  worktreePath?: string;
  lastCheckKey?: string | null;
  activeThreadId?: string | null;
  lastError?: string | null;
  blockedReason?: PrWatchBlockedReason | null;
}

const PR_WATCH_RUNTIME_COLUMN_NAMES: Record<keyof PrWatchRuntimePatch, string> = {
  worktreePath: "worktree_path",
  lastCheckKey: "last_check_key",
  activeThreadId: "active_thread_id",
  lastError: "last_error",
  blockedReason: "blocked_reason",
};

/**
 * Update only the runtime-bookkeeping columns of one watch. A missing row is
 * a no-op (no insert), the guarded full-save checks do not apply because the
 * patch never replaces the config column, and an unknown blocked reason is
 * rejected instead of silently depending on the readers' tolerant catch.
 */
export function dbPatchPrWatchRuntime(
  projectId: string,
  prNumber: number,
  patch: PrWatchRuntimePatch,
): void {
  const assignments: string[] = [];
  const values: (string | null)[] = [];
  for (const field of Object.keys(PR_WATCH_RUNTIME_COLUMN_NAMES) as (keyof PrWatchRuntimePatch)[]) {
    const value = patch[field];
    if (value === undefined) continue;
    if (field === "blockedReason" && value !== null) prWatchBlockedReasonSchema.parse(value);
    assignments.push(`${PR_WATCH_RUNTIME_COLUMN_NAMES[field]} = ?`);
    values.push(value);
  }
  if (assignments.length === 0) return;
  getSqlite()
    .prepare(
      `UPDATE pr_watches SET ${assignments.join(", ")} WHERE project_id = ? AND pr_number = ?`,
    )
    .run(...values, projectId, prNumber);
}
