import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ScheduledTask, ScheduledTaskRun } from "@/shared/contracts";
import { closeDatabase, initDatabase } from "./connection";
import {
  dbDeleteScheduleRuns,
  dbInsertScheduleRun,
  dbInterruptScheduleRuns,
  dbListScheduleRuns,
  dbUpdateScheduleRun,
} from "./scheduleRuns";
import { dbDeleteSchedule, dbUpsertSchedule } from "./schedules";

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
    enabled: true,
    nextRunAt: null,
    lastRunAt: null,
    lastCompletedAt: null,
    lastStatus: "never",
    lastResult: null,
    lastError: null,
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
    startedAt: `2026-07-10T00:00:${String(runSeq % 60).padStart(2, "0")}.000Z`,
    completedAt: null,
    status: "running",
    summary: null,
    error: null,
    ...overrides,
  };
}

describe.skipIf(!sqliteAvailable)("scheduleRuns (real sqlite round-trip)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.LIGHTCODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    runSeq = 0;
    dir = mkdtempSync(join(tmpdir(), "lc-runs-test-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertSchedule(schedule());
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.LIGHTCODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("inserts and lists runs newest-first", () => {
    const first = run();
    const second = run();
    dbInsertScheduleRun(first);
    dbInsertScheduleRun(second);

    const rows = dbListScheduleRuns(SCHEDULE_ID);
    expect(rows.map((row) => row.id)).toEqual([second.id, first.id]);
    expect(rows[0]).toMatchObject({ status: "running", completedAt: null });
  });

  it("updates a run by id", () => {
    const row = run();
    dbInsertScheduleRun(row);
    dbUpdateScheduleRun(row.id, {
      completedAt: "2026-07-10T01:00:00.000Z",
      status: "succeeded",
      summary: null,
    });

    const [stored] = dbListScheduleRuns(SCHEDULE_ID);
    expect(stored).toMatchObject({
      status: "succeeded",
      completedAt: "2026-07-10T01:00:00.000Z",
    });
  });

  it("prunes to at most 20 runs per schedule", () => {
    for (let i = 0; i < 25; i += 1) dbInsertScheduleRun(run());
    expect(dbListScheduleRuns(SCHEDULE_ID, 100)).toHaveLength(20);
  });

  it("marks dangling running rows interrupted", () => {
    dbInsertScheduleRun(run());
    dbInsertScheduleRun(run({ status: "succeeded", completedAt: "2026-07-10T00:30:00.000Z" }));
    dbInterruptScheduleRuns(SCHEDULE_ID, "2026-07-10T02:00:00.000Z");

    const rows = dbListScheduleRuns(SCHEDULE_ID);
    const statuses = rows.map((row) => row.status).sort();
    expect(statuses).toEqual(["interrupted", "succeeded"]);
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
