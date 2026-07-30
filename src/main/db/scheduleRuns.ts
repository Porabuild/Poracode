import {
  resolveScheduleAutomation,
  scheduleAutomationSchema,
  scheduleRunInboxQuerySchema,
  scheduleRunResultSchema,
  scheduledTaskRunSchema,
  updateScheduleRunStatePayloadSchema,
  type ScheduleRunInboxQuery,
  type ScheduleRunResult,
  type ScheduledTaskRun,
  type UpdateScheduleRunStatePayload,
} from "@/shared/contracts";
import { getSqlite } from "./connection";

/** Keep the newest read/archived rows per schedule; unread findings are never pruned. */
const MAX_READ_RUNS_PER_SCHEDULE = 20;
const DEFAULT_INBOX_LIMIT = 50;

interface ScheduledTaskRunRow {
  id: string;
  schedule_id: string;
  thread_id: string;
  scheduled_for: string | null;
  trigger: string | null;
  attempt: number | null;
  iteration: number | null;
  started_at: string;
  completed_at: string | null;
  status: string;
  summary: string | null;
  error: string | null;
  result: string | null;
  automation_snapshot: string | null;
  unread: number | null;
  archived_at: string | null;
}

function parseResult(row: ScheduledTaskRunRow): ScheduleRunResult | null {
  if (!row.result) return null;
  return scheduleRunResultSchema.parse({
    ...JSON.parse(row.result),
    unread: row.unread === 1,
    archivedAt: row.archived_at,
  });
}

function fromRow(row: ScheduledTaskRunRow): ScheduledTaskRun {
  return scheduledTaskRunSchema.parse({
    id: row.id,
    scheduleId: row.schedule_id,
    threadId: row.thread_id,
    scheduledFor: row.scheduled_for || row.started_at,
    trigger: row.trigger ?? "scheduled",
    attempt: row.attempt ?? 1,
    iteration: row.iteration ?? 1,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    summary: row.summary,
    error: row.error,
    result: parseResult(row),
    automationSnapshot: row.automation_snapshot
      ? scheduleAutomationSchema.parse(JSON.parse(row.automation_snapshot))
      : resolveScheduleAutomation(undefined),
  });
}

export function dbInsertScheduleRun(run: ScheduledTaskRun): void {
  const parsed = scheduledTaskRunSchema.parse(run);
  const sqlite = getSqlite();
  sqlite
    .prepare(
      `INSERT INTO scheduled_task_runs (
        id, schedule_id, thread_id, scheduled_for, trigger, attempt, iteration,
        started_at, completed_at, status, summary, error, result,
        automation_snapshot, unread, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      parsed.id,
      parsed.scheduleId,
      parsed.threadId,
      parsed.scheduledFor,
      parsed.trigger,
      parsed.attempt,
      parsed.iteration,
      parsed.startedAt,
      parsed.completedAt,
      parsed.status,
      parsed.summary,
      parsed.error,
      parsed.result ? JSON.stringify(parsed.result) : null,
      JSON.stringify(parsed.automationSnapshot),
      parsed.result?.unread ? 1 : 0,
      parsed.result?.archivedAt ?? null,
    );
  pruneScheduleRuns(parsed.scheduleId);
}

export interface ScheduleRunPatch {
  completedAt?: string | null;
  status?: ScheduledTaskRun["status"];
  summary?: string | null;
  error?: string | null;
  attempt?: number;
  iteration?: number;
  result?: ScheduleRunResult | null;
}

export function dbUpdateScheduleRun(id: string, patch: ScheduleRunPatch): void {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if ("completedAt" in patch) {
    sets.push("completed_at = ?");
    values.push(patch.completedAt ?? null);
  }
  if ("status" in patch && patch.status !== undefined) {
    sets.push("status = ?");
    values.push(patch.status);
  }
  if ("summary" in patch) {
    sets.push("summary = ?");
    values.push(patch.summary ?? null);
  }
  if ("error" in patch) {
    sets.push("error = ?");
    values.push(patch.error ?? null);
  }
  if ("attempt" in patch && patch.attempt !== undefined) {
    sets.push("attempt = ?");
    values.push(patch.attempt);
  }
  if ("iteration" in patch && patch.iteration !== undefined) {
    sets.push("iteration = ?");
    values.push(patch.iteration);
  }
  if ("result" in patch) {
    const result = patch.result ? scheduleRunResultSchema.parse(patch.result) : null;
    sets.push("result = ?", "unread = ?", "archived_at = ?");
    values.push(
      result ? JSON.stringify(result) : null,
      result?.unread ? 1 : 0,
      result?.archivedAt ?? null,
    );
  }
  if (sets.length === 0) return;
  values.push(id);
  getSqlite()
    .prepare(`UPDATE scheduled_task_runs SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values);
}

export function dbListScheduleRuns(
  scheduleId: string,
  limit = MAX_READ_RUNS_PER_SCHEDULE,
): ScheduledTaskRun[] {
  const rows = getSqlite()
    .prepare(
      `SELECT * FROM scheduled_task_runs
       WHERE schedule_id = ?
       ORDER BY started_at DESC, rowid DESC
       LIMIT ?`,
    )
    .all(scheduleId, limit) as ScheduledTaskRunRow[];
  return rows.map(fromRow);
}

export function dbListScheduleRunInbox(query: ScheduleRunInboxQuery): ScheduledTaskRun[] {
  const parsed = scheduleRunInboxQuerySchema.parse(query);
  const stateClause =
    parsed.filter === "unread"
      ? "unread = 1 AND archived_at IS NULL"
      : parsed.filter === "archived"
        ? "archived_at IS NOT NULL"
        : "archived_at IS NULL";
  const rows = getSqlite()
    .prepare(
      `SELECT * FROM scheduled_task_runs
       WHERE (result IS NOT NULL OR status = 'running') AND ${stateClause}
       ORDER BY started_at DESC, rowid DESC
       LIMIT ?`,
    )
    .all(parsed.limit ?? DEFAULT_INBOX_LIMIT) as ScheduledTaskRunRow[];
  return rows.map(fromRow);
}

export function dbGetUnreadScheduleRunCount(): number {
  const row = getSqlite()
    .prepare(
      `SELECT COUNT(*) AS count
       FROM scheduled_task_runs
       WHERE unread = 1 AND archived_at IS NULL`,
    )
    .get() as { count: number };
  return row.count;
}

export function dbUpdateScheduleRunState(
  payload: UpdateScheduleRunStatePayload,
  archivedAt = new Date().toISOString(),
): ScheduledTaskRun | null {
  const parsed = updateScheduleRunStatePayloadSchema.parse(payload);
  const sqlite = getSqlite();
  const row = sqlite.prepare("SELECT * FROM scheduled_task_runs WHERE id = ?").get(parsed.id) as
    | ScheduledTaskRunRow
    | undefined;
  if (!row) return null;

  const current = fromRow(row);
  const currentResult: ScheduleRunResult = current.result ?? {
    outcome: "unknown",
    summary: current.summary,
    severity: current.error ? "error" : "info",
    unread: false,
    archivedAt: null,
    changedFiles: [],
    stopReason: null,
  };
  const nextResult = scheduleRunResultSchema.parse({
    ...currentResult,
    unread: parsed.archived === true ? false : (parsed.unread ?? currentResult.unread),
    archivedAt:
      parsed.archived === undefined
        ? currentResult.archivedAt
        : parsed.archived
          ? archivedAt
          : null,
  });
  sqlite
    .prepare("UPDATE scheduled_task_runs SET result = ?, unread = ?, archived_at = ? WHERE id = ?")
    .run(JSON.stringify(nextResult), nextResult.unread ? 1 : 0, nextResult.archivedAt, parsed.id);

  return fromRow({
    ...row,
    result: JSON.stringify(nextResult),
    unread: nextResult.unread ? 1 : 0,
    archived_at: nextResult.archivedAt,
  });
}

export function dbDeleteScheduleRuns(scheduleId: string): void {
  getSqlite().prepare("DELETE FROM scheduled_task_runs WHERE schedule_id = ?").run(scheduleId);
}

/**
 * Force-fail dangling `running` rows for a schedule on startup (their host
 * process is gone, so the run can never settle). Used by the schedule
 * service's post-startup normalization.
 */
export function dbInterruptScheduleRuns(scheduleId: string, completedAt: string): void {
  const sqlite = getSqlite();
  const rows = sqlite
    .prepare("SELECT * FROM scheduled_task_runs WHERE schedule_id = ? AND status = 'running'")
    .all(scheduleId) as ScheduledTaskRunRow[];
  const update = sqlite.prepare(
    `UPDATE scheduled_task_runs
     SET status = 'interrupted', completed_at = ?, result = ?, unread = 1, archived_at = NULL
     WHERE id = ?`,
  );
  sqlite.transaction(() => {
    for (const row of rows) {
      const result = scheduleRunResultSchema.parse({
        outcome: "needs-attention",
        summary: row.summary,
        severity: "warning",
        unread: true,
        archivedAt: null,
        changedFiles: [],
        stopReason: "interrupted",
      });
      update.run(completedAt, JSON.stringify(result), row.id);
    }
  })();
}

function pruneScheduleRuns(scheduleId: string): void {
  getSqlite()
    .prepare(
      `DELETE FROM scheduled_task_runs
       WHERE schedule_id = ?
         AND unread = 0
         AND id NOT IN (
           SELECT id FROM scheduled_task_runs
           WHERE schedule_id = ? AND unread = 0
           ORDER BY started_at DESC, rowid DESC
           LIMIT ?
         )`,
    )
    .run(scheduleId, scheduleId, MAX_READ_RUNS_PER_SCHEDULE);
}
