import { scheduledTaskRunSchema, type ScheduledTaskRun } from "@/shared/contracts";
import { getSqlite } from "./connection";

/** Keep at most this many run rows per schedule; older rows are pruned on insert. */
const MAX_RUNS_PER_SCHEDULE = 20;

interface ScheduledTaskRunRow {
  id: string;
  schedule_id: string;
  thread_id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  summary: string | null;
  error: string | null;
}

function fromRow(row: ScheduledTaskRunRow): ScheduledTaskRun {
  return scheduledTaskRunSchema.parse({
    id: row.id,
    scheduleId: row.schedule_id,
    threadId: row.thread_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    summary: row.summary,
    error: row.error,
  });
}

export function dbInsertScheduleRun(run: ScheduledTaskRun): void {
  const parsed = scheduledTaskRunSchema.parse(run);
  const sqlite = getSqlite();
  sqlite
    .prepare(
      `INSERT INTO scheduled_task_runs (
        id, schedule_id, thread_id, started_at, completed_at, status, summary, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      parsed.id,
      parsed.scheduleId,
      parsed.threadId,
      parsed.startedAt,
      parsed.completedAt,
      parsed.status,
      parsed.summary,
      parsed.error,
    );
  pruneScheduleRuns(parsed.scheduleId);
}

export interface ScheduleRunPatch {
  completedAt?: string | null;
  status?: ScheduledTaskRun["status"];
  summary?: string | null;
  error?: string | null;
}

export function dbUpdateScheduleRun(id: string, patch: ScheduleRunPatch): void {
  const sets: string[] = [];
  const values: (string | null)[] = [];
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
  if (sets.length === 0) return;
  values.push(id);
  getSqlite()
    .prepare(`UPDATE scheduled_task_runs SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values);
}

export function dbListScheduleRuns(
  scheduleId: string,
  limit = MAX_RUNS_PER_SCHEDULE,
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

export function dbDeleteScheduleRuns(scheduleId: string): void {
  getSqlite().prepare("DELETE FROM scheduled_task_runs WHERE schedule_id = ?").run(scheduleId);
}

/**
 * Force-fail dangling `running` rows for a schedule on startup (their host
 * process is gone, so the run can never settle). Used by the schedule
 * service's post-startup normalization.
 */
export function dbInterruptScheduleRuns(scheduleId: string, completedAt: string): void {
  getSqlite()
    .prepare(
      "UPDATE scheduled_task_runs SET status = 'interrupted', completed_at = ? WHERE schedule_id = ? AND status = 'running'",
    )
    .run(completedAt, scheduleId);
}

function pruneScheduleRuns(scheduleId: string): void {
  getSqlite()
    .prepare(
      `DELETE FROM scheduled_task_runs
       WHERE schedule_id = ?
         AND id NOT IN (
           SELECT id FROM scheduled_task_runs
           WHERE schedule_id = ?
           ORDER BY started_at DESC, rowid DESC
           LIMIT ?
         )`,
    )
    .run(scheduleId, scheduleId, MAX_RUNS_PER_SCHEDULE);
}
