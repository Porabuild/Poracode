import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULE_AUTOMATION,
  type ScheduleRunResult,
  type ScheduledTask,
  type ScheduledTaskRun,
} from "@/shared/contracts";
import { closeDatabase, initDatabase } from "./connection";
import {
  dbDeleteScheduleRuns,
  dbGetUnreadScheduleRunCount,
  dbInsertScheduleRun,
  dbInterruptScheduleRuns,
  dbListScheduleRunInbox,
  dbListScheduleRuns,
  dbUpdateScheduleRun,
  dbUpdateScheduleRunState,
} from "./scheduleRuns";
import { dbDeleteSchedule, dbGetSchedule, dbUpsertSchedule } from "./schedules";

const serverNativeBinding = join(process.cwd(), "dist", "server-native", "better_sqlite3.node");
let nativeBindingEnv: string | undefined;
let sqliteAvailable = true;
try {
  new Database(":memory:").close();
} catch {
  if (existsSync(serverNativeBinding)) {
    nativeBindingEnv = serverNativeBinding;
  } else {
    sqliteAvailable = false;
  }
}

const SCHEDULE_ID = "11111111-1111-4111-8111-111111111111";

function schedule(): ScheduledTask {
  return {
    id: SCHEDULE_ID,
    name: "Nightly brief",
    prompt: "Summarize the day.",
    agentKind: "claude:home",
    config: { model: "claude-fable-5" },
    recurrence: { kind: "hourly", minute: 0 },
    automation: DEFAULT_SCHEDULE_AUTOMATION,
    enabled: true,
    nextRunAt: null,
    lastRunAt: null,
    lastCompletedAt: null,
    lastStatus: "never",
    lastResult: null,
    lastError: null,
    iterationCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

let runSeq = 0;
function run(overrides: Partial<ScheduledTaskRun> = {}): ScheduledTaskRun {
  runSeq += 1;
  const suffix = String(runSeq).padStart(12, "0");
  return {
    id: `22222222-2222-4222-8222-${suffix}`,
    scheduleId: SCHEDULE_ID,
    threadId: `33333333-3333-4333-8333-${suffix}`,
    scheduledFor: `2026-07-10T00:00:${String(runSeq % 60).padStart(2, "0")}.000Z`,
    trigger: "scheduled",
    attempt: 1,
    iteration: 1,
    startedAt: `2026-07-10T00:00:${String(runSeq % 60).padStart(2, "0")}.000Z`,
    completedAt: null,
    status: "running",
    summary: null,
    error: null,
    result: null,
    automationSnapshot: DEFAULT_SCHEDULE_AUTOMATION,
    ...overrides,
  };
}

function result(overrides: Partial<ScheduleRunResult> = {}): ScheduleRunResult {
  return {
    outcome: "findings",
    summary: "Found something useful.",
    severity: "info",
    unread: false,
    archivedAt: null,
    changedFiles: [],
    stopReason: null,
    ...overrides,
  };
}

describe.skipIf(!sqliteAvailable)("scheduleRuns (real sqlite round-trip)", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    runSeq = 0;
    dir = mkdtempSync(join(tmpdir(), "lc-runs-test-"));
    dbPath = join(dir, "state.sqlite");
    initDatabase(dbPath);
    dbUpsertSchedule(schedule());
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("inserts and lists runs newest-first", () => {
    const first = run();
    const second = run();
    dbInsertScheduleRun(first);
    dbInsertScheduleRun(second);

    const rows = dbListScheduleRuns(SCHEDULE_ID);
    expect(rows.map((row) => row.id)).toEqual([second.id, first.id]);
    expect(rows[0]).toMatchObject({
      status: "running",
      completedAt: null,
      scheduledFor: second.scheduledFor,
      trigger: "scheduled",
      attempt: 1,
      iteration: 1,
      automationSnapshot: DEFAULT_SCHEDULE_AUTOMATION,
    });
  });

  it("round-trips task automation and iteration state", () => {
    const configured: ScheduledTask = {
      ...schedule(),
      automation: {
        ...DEFAULT_SCHEDULE_AUTOMATION,
        mode: { kind: "heartbeat", targetThreadId: "thread-1" },
        maxIterations: 8,
      },
      iterationCount: 3,
    };
    dbUpsertSchedule(configured);

    expect(dbGetSchedule(SCHEDULE_ID)).toMatchObject({
      automation: configured.automation,
      iterationCount: 3,
    });
  });

  it("updates a run by id", () => {
    const row = run();
    dbInsertScheduleRun(row);
    dbUpdateScheduleRun(row.id, {
      completedAt: "2026-07-10T01:00:00.000Z",
      status: "succeeded",
      summary: "Finished.",
      attempt: 2,
      iteration: 3,
      result: result({ unread: true, summary: "Finished." }),
    });

    const [stored] = dbListScheduleRuns(SCHEDULE_ID);
    expect(stored).toMatchObject({
      status: "succeeded",
      completedAt: "2026-07-10T01:00:00.000Z",
      summary: "Finished.",
      attempt: 2,
      iteration: 3,
      result: expect.objectContaining({ unread: true, summary: "Finished." }),
    });
  });

  it("prunes to the newest 20 read runs", () => {
    for (let i = 0; i < 25; i += 1) dbInsertScheduleRun(run());
    expect(dbListScheduleRuns(SCHEDULE_ID, 100)).toHaveLength(20);
  });

  it("preserves every unread result alongside the newest 20 read runs", () => {
    const unreadIds: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const row = run({
        status: "succeeded",
        completedAt: "2026-07-10T01:00:00.000Z",
        result: result({ unread: true }),
      });
      unreadIds.push(row.id);
      dbInsertScheduleRun(row);
    }
    for (let i = 0; i < 25; i += 1) {
      dbInsertScheduleRun(
        run({
          status: "succeeded",
          completedAt: "2026-07-10T01:00:00.000Z",
          result: result(),
        }),
      );
    }

    const rows = dbListScheduleRuns(SCHEDULE_ID, 100);
    expect(rows).toHaveLength(23);
    expect(
      rows
        .filter((row) => row.result?.unread)
        .map((row) => row.id)
        .sort(),
    ).toEqual(unreadIds.sort());
  });

  it("queries and updates inbox state", () => {
    const unread = run({
      status: "succeeded",
      completedAt: "2026-07-10T01:00:00.000Z",
      result: result({ unread: true }),
    });
    const read = run({
      status: "succeeded",
      completedAt: "2026-07-10T01:00:00.000Z",
      result: result(),
    });
    const archived = run({
      status: "succeeded",
      completedAt: "2026-07-10T01:00:00.000Z",
      result: result({ archivedAt: "2026-07-10T02:00:00.000Z" }),
    });
    const running = run();
    dbInsertScheduleRun(unread);
    dbInsertScheduleRun(read);
    dbInsertScheduleRun(archived);
    dbInsertScheduleRun(running);

    expect(dbListScheduleRunInbox({ filter: "unread" }).map((row) => row.id)).toEqual([unread.id]);
    expect(dbListScheduleRunInbox({ filter: "all" }).map((row) => row.id)).toEqual([
      running.id,
      read.id,
      unread.id,
    ]);
    expect(dbListScheduleRunInbox({ filter: "archived" }).map((row) => row.id)).toEqual([
      archived.id,
    ]);
    expect(dbGetUnreadScheduleRunCount()).toBe(1);

    const updated = dbUpdateScheduleRunState(
      { id: unread.id, archived: true },
      "2026-07-10T03:00:00.000Z",
    );
    expect(updated?.result).toMatchObject({
      unread: false,
      archivedAt: "2026-07-10T03:00:00.000Z",
    });
    expect(dbListScheduleRunInbox({ filter: "unread" })).toHaveLength(0);
    expect(dbGetUnreadScheduleRunCount()).toBe(0);

    const restored = dbUpdateScheduleRunState({ id: unread.id, archived: false, unread: true });
    expect(restored?.result).toMatchObject({ unread: true, archivedAt: null });
    expect(dbListScheduleRunInbox({ filter: "unread" }).map((row) => row.id)).toEqual([unread.id]);
  });

  it("marks dangling running rows interrupted", () => {
    dbInsertScheduleRun(run());
    dbInsertScheduleRun(run({ status: "succeeded", completedAt: "2026-07-10T00:30:00.000Z" }));
    dbInterruptScheduleRuns(SCHEDULE_ID, "2026-07-10T02:00:00.000Z");

    const rows = dbListScheduleRuns(SCHEDULE_ID);
    const statuses = rows.map((row) => row.status).sort();
    expect(statuses).toEqual(["interrupted", "succeeded"]);
    expect(dbListScheduleRunInbox({ filter: "unread" })[0]?.result).toMatchObject({
      outcome: "needs-attention",
      unread: true,
      stopReason: "interrupted",
    });
  });

  it("migrates v25 schedule rows with backward-compatible defaults", () => {
    closeDatabase();
    rmSync(dbPath, { force: true });
    const legacy = new Database(
      dbPath,
      nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : {},
    );
    legacy.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO app_state (key, value) VALUES ('schema_version', '25');
      CREATE TABLE scheduled_tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        agent_kind TEXT NOT NULL,
        config TEXT NOT NULL,
        recurrence TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        project_id TEXT,
        next_run_at TEXT,
        last_run_at TEXT,
        last_completed_at TEXT,
        last_status TEXT NOT NULL DEFAULT 'never',
        last_result TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE scheduled_task_runs (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
        thread_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL,
        summary TEXT,
        error TEXT
      );
      INSERT INTO scheduled_tasks (
        id, name, prompt, agent_kind, config, recurrence, enabled, project_id,
        next_run_at, last_run_at, last_completed_at, last_status,
        last_result, last_error, created_at, updated_at
      ) VALUES (
        '${SCHEDULE_ID}', 'Legacy', 'Review.', 'claude:home',
        '{"model":"claude-fable-5"}', '{"kind":"hourly","minute":0}',
        1, NULL, NULL, NULL, NULL, 'succeeded', NULL, NULL,
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
      );
      INSERT INTO scheduled_task_runs (
        id, schedule_id, thread_id, started_at, completed_at, status, summary, error
      ) VALUES (
        '22222222-2222-4222-8222-000000000001', '${SCHEDULE_ID}', 'legacy-thread',
        '2026-07-10T00:00:00.000Z', '2026-07-10T00:01:00.000Z',
        'succeeded', 'Legacy result', NULL
      );
    `);
    legacy.close();

    initDatabase(dbPath);

    expect(dbGetSchedule(SCHEDULE_ID)).toMatchObject({
      automation: DEFAULT_SCHEDULE_AUTOMATION,
      iterationCount: 0,
    });
    expect(dbListScheduleRuns(SCHEDULE_ID)[0]).toMatchObject({
      scheduledFor: "2026-07-10T00:00:00.000Z",
      trigger: "scheduled",
      attempt: 1,
      iteration: 1,
      result: null,
      automationSnapshot: DEFAULT_SCHEDULE_AUTOMATION,
    });
    expect(dbListScheduleRunInbox({ filter: "unread" })).toHaveLength(0);
  });

  it("cascade-deletes runs when the parent schedule is deleted", () => {
    dbInsertScheduleRun(run());
    dbInsertScheduleRun(run());
    dbDeleteSchedule(SCHEDULE_ID);
    expect(dbListScheduleRuns(SCHEDULE_ID)).toHaveLength(0);
  });

  it("deletes runs by schedule id explicitly", () => {
    dbInsertScheduleRun(run());
    dbDeleteScheduleRuns(SCHEDULE_ID);
    expect(dbListScheduleRuns(SCHEDULE_ID)).toHaveLength(0);
  });
});
