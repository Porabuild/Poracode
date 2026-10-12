import {
  scheduledTaskConfigSchema,
  scheduledTaskSchema,
  scheduleRecurrenceSchema,
  type ScheduledTask,
  type ScheduledTaskRunStatus,
} from "@/shared/contracts";
import { getSqlite } from "./connection";
import { projectPersistedSelectionBinding } from "@/shared/persistedSelectionBinding";
import { assertSelectionJsonReplaceable } from "./persistedSelectionData";

interface ScheduledTaskRow {
  id: string;
  name: string;
  prompt: string;
  agent_kind: string;
  config: string;
  recurrence: string;
  enabled: number;
  project_id: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  last_completed_at: string | null;
  last_status: string;
  last_result: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function fromRow(row: ScheduledTaskRow): ScheduledTask {
  return scheduledTaskSchema.parse({
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    agentKind: row.agent_kind,
    config: scheduledTaskConfigSchema.parse(
      projectPersistedSelectionBinding(JSON.parse(row.config)),
    ),
    recurrence: scheduleRecurrenceSchema.parse(JSON.parse(row.recurrence)),
    enabled: row.enabled === 1,
    projectId: row.project_id,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastCompletedAt: row.last_completed_at,
    lastStatus: row.last_status,
    lastResult: row.last_result,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function dbGetSchedules(): ScheduledTask[] {
  const rows = getSqlite()
    .prepare("SELECT * FROM scheduled_tasks ORDER BY created_at ASC")
    .all() as ScheduledTaskRow[];
  return rows.map(fromRow);
}

export function dbGetSchedule(id: string): ScheduledTask | null {
  const row = getSqlite().prepare("SELECT * FROM scheduled_tasks WHERE id = ?").get(id) as
    | ScheduledTaskRow
    | undefined;
  return row ? fromRow(row) : null;
}

export function dbUpsertSchedule(task: ScheduledTask): void {
  const parsed = scheduledTaskSchema.parse(task);
  const sqlite = getSqlite();
  sqlite
    .transaction(() => {
      const previous = sqlite
        .prepare("SELECT config FROM scheduled_tasks WHERE id = ?")
        .get(parsed.id) as { config: string } | undefined;
      assertSelectionJsonReplaceable(previous?.config);
      sqlite
        .prepare(
          `INSERT INTO scheduled_tasks (
        id, name, prompt, agent_kind, config, recurrence, enabled, project_id,
        next_run_at, last_run_at, last_completed_at, last_status,
        last_result, last_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        prompt = excluded.prompt,
        agent_kind = excluded.agent_kind,
        config = excluded.config,
        recurrence = excluded.recurrence,
        enabled = excluded.enabled,
        project_id = excluded.project_id,
        next_run_at = excluded.next_run_at,
        last_run_at = excluded.last_run_at,
        last_completed_at = excluded.last_completed_at,
        last_status = excluded.last_status,
        last_result = excluded.last_result,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at`,
        )
        .run(
          parsed.id,
          parsed.name,
          parsed.prompt,
          parsed.agentKind,
          JSON.stringify(parsed.config),
          JSON.stringify(parsed.recurrence),
          parsed.enabled ? 1 : 0,
          parsed.projectId ?? null,
          parsed.nextRunAt,
          parsed.lastRunAt,
          parsed.lastCompletedAt,
          parsed.lastStatus,
          parsed.lastResult,
          parsed.lastError,
          parsed.createdAt,
          parsed.updatedAt,
        );
    })
    .immediate();
}

export function dbDeleteSchedule(id: string): void {
  getSqlite().prepare("DELETE FROM scheduled_tasks WHERE id = ?").run(id);
}

/**
 * The runtime-bookkeeping fields a schedule's own lifecycle may change in
 * place: everything EXCEPT the execution-defining columns (`agent_kind`,
 * `config`, `project_id`, `prompt`, `name`, `recurrence`) and `created_at`.
 * Startup normalization, interruption, and settlement write through
 * {@link dbPatchScheduleRuntime} so stored config bytes — including
 * unsupported raw metadata the guarded full save would refuse to overwrite —
 * remain exact, and a row deleted while a run is in flight is never
 * resurrected.
 */
export interface ScheduleRuntimePatch {
  enabled?: boolean;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  lastCompletedAt?: string | null;
  lastStatus?: ScheduledTaskRunStatus;
  lastResult?: string | null;
  lastError?: string | null;
  updatedAt: string;
}

const scheduleRuntimePatchSchema = scheduledTaskSchema
  .pick({
    enabled: true,
    nextRunAt: true,
    lastRunAt: true,
    lastCompletedAt: true,
    lastStatus: true,
    lastResult: true,
    lastError: true,
    updatedAt: true,
  })
  .partial()
  .required({ updatedAt: true })
  .strict();

const SCHEDULE_RUNTIME_PATCH_COLUMNS: readonly (keyof ScheduleRuntimePatch)[] = [
  "enabled",
  "nextRunAt",
  "lastRunAt",
  "lastCompletedAt",
  "lastStatus",
  "lastResult",
  "lastError",
];

const SCHEDULE_RUNTIME_COLUMN_NAMES: Record<string, string> = {
  enabled: "enabled",
  nextRunAt: "next_run_at",
  lastRunAt: "last_run_at",
  lastCompletedAt: "last_completed_at",
  lastStatus: "last_status",
  lastResult: "last_result",
  lastError: "last_error",
};

/**
 * Update only the runtime-bookkeeping columns of one schedule. A missing row
 * is a no-op (no insert), and the guarded full-save checks do not apply
 * because the patch never replaces the config column.
 */
export function dbPatchScheduleRuntime(id: string, patch: ScheduleRuntimePatch): void {
  const parsed = scheduleRuntimePatchSchema.parse(patch);
  const assignments: string[] = ["updated_at = ?"];
  const values: (string | number | null)[] = [parsed.updatedAt];
  for (const field of SCHEDULE_RUNTIME_PATCH_COLUMNS) {
    const value = parsed[field];
    if (value === undefined) continue;
    assignments.push(`${SCHEDULE_RUNTIME_COLUMN_NAMES[field]} = ?`);
    values.push(field === "enabled" ? (value ? 1 : 0) : (value as string | null));
  }
  getSqlite()
    .prepare(`UPDATE scheduled_tasks SET ${assignments.join(", ")} WHERE id = ?`)
    .run(...values, id);
}
