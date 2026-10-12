import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { ZodError } from "zod";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ScheduledTask } from "@/shared/contracts";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import {
  ScheduleExecutionAdmissionError,
  dbAdmitScheduleExecution,
} from "./scheduleExecutionAdmission";
import {
  dbDeleteSchedule,
  dbGetSchedule,
  dbPatchScheduleRuntime,
  dbUpsertSchedule,
} from "./schedules";

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

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "44444444-4444-4444-8444-444444444444";
const WORK_PROJECT_ID = "22222222-2222-4222-8222-222222222222";

/** A full profile kind: one opaque agentKind route identity. */
const PROFILE_KIND = "glm:profile-alpha";

const binding = {
  version: 1 as const,
  kind: "family-member" as const,
  owner: { agentKind: PROFILE_KIND, presentationMode: "gui" as const },
  model: "glm-5.3-flashx",
  inertValues: { effort: "" },
};

function task(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: TASK_ID,
    name: "Nightly brief",
    prompt: "Summarize the day.",
    agentKind: PROFILE_KIND,
    config: {
      model: "glm-5.3-flashx",
      effort: "",
      fast: false,
      thinking: false,
      contextSize: "128k",
      selectionBinding: binding,
    },
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
    ...overrides,
  };
}

function rawRow(): Record<string, unknown> {
  return getSqlite().prepare("SELECT * FROM scheduled_tasks WHERE id = ?").get(TASK_ID) as Record<
    string,
    unknown
  >;
}

function setRawConfig(config: unknown): void {
  getSqlite()
    .prepare("UPDATE scheduled_tasks SET config = ? WHERE id = ?")
    .run(JSON.stringify(config), TASK_ID);
}

/** Runs the admission and returns the refusal; fails the test when it passes. */
function refusalError(run: () => void): ScheduleExecutionAdmissionError {
  try {
    run();
  } catch (error) {
    return error as ScheduleExecutionAdmissionError;
  }
  throw new Error("Expected a schedule execution admission refusal.");
}

describe.skipIf(!sqliteAvailable)("dbAdmitScheduleExecution (real sqlite)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "lc-schedule-admission-test-"));
    initDatabase(join(dir, "state.sqlite"));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("admits a task captured from the authoritative store and refuses a missing row", () => {
    dbUpsertSchedule(task());
    const captured = dbGetSchedule(TASK_ID);
    expect(captured).not.toBeNull();
    expect(() => dbAdmitScheduleExecution(captured!)).not.toThrow();

    const missing = refusalError(() => dbAdmitScheduleExecution(task({ id: OTHER_ID })));
    expect(missing.reason).toBe("missing");
    expect(missing.message).toContain("changed or was removed");
  });

  it.each([null, { version: 2 }, { ...binding, extra: true }])(
    "refuses incoming unsupported metadata %j while preserving the valid stored row",
    (selectionBinding) => {
      dbUpsertSchedule(task());
      const before = rawRow();
      const captured = task({
        config: { ...task().config, selectionBinding } as never,
      });
      const error = refusalError(() => dbAdmitScheduleExecution(captured));
      expect(error.reason).toBe("unsupported");
      expect(rawRow()).toEqual(before);
    },
  );

  it.each([
    ["prompt", { prompt: "Summarize the week instead." }],
    ["agentKind", { agentKind: "claude:home" }],
    ["projectId", { projectId: WORK_PROJECT_ID }],
    ["model", { config: { ...task().config, model: "another-model" } }],
    ["effort value", { config: { ...task().config, effort: "high" } }],
    ["fast value", { config: { ...task().config, fast: true } }],
    ["contextSize value", { config: { ...task().config, contextSize: "32k" } }],
    [
      "binding record",
      {
        config: {
          ...task().config,
          selectionBinding: { ...binding, inertValues: { effort: "high" } },
        },
      },
    ],
  ] as const)("refuses a changed execution field: %s", (_label, overrides) => {
    dbUpsertSchedule(task());
    const captured = dbGetSchedule(TASK_ID)!;
    expect(() => dbAdmitScheduleExecution(captured)).not.toThrow();

    dbUpsertSchedule(task({ ...overrides }));
    expect(refusalError(() => dbAdmitScheduleExecution(captured)).reason).toBe("stale");
  });

  it("refuses a binding removed from or added to the stored row", () => {
    dbUpsertSchedule(task());
    const withBinding = dbGetSchedule(TASK_ID)!;

    const { selectionBinding: _removed, ...withoutBinding } = task().config;
    dbUpsertSchedule(task({ config: withoutBinding }));
    expect(refusalError(() => dbAdmitScheduleExecution(withBinding)).reason).toBe("stale");

    // And the reverse: a recognized binding appears on the row only.
    dbUpsertSchedule(task());
    expect(
      refusalError(() => dbAdmitScheduleExecution(task({ config: withoutBinding }))).reason,
    ).toBe("stale");
  });

  it("refuses unsupported raw selection data with the unsupportedStoredData message", () => {
    dbUpsertSchedule(task());
    setRawConfig({ ...task().config, selectionBinding: { ...binding, version: 2 } });
    // The persisted-read projection keeps the capture usable; admission must
    // still refuse on the raw authoritative bytes.
    const captured = dbGetSchedule(TASK_ID)!;
    const unsupported = refusalError(() => dbAdmitScheduleExecution(captured));
    expect(unsupported.reason).toBe("unsupported");
    expect(unsupported.message).toContain("unsupported selection data");
  });

  it("treats carrier presence as exact, including empty and false values", () => {
    dbUpsertSchedule(task());
    const captured = dbGetSchedule(TASK_ID)!;
    expect(captured?.config).toMatchObject({ effort: "", fast: false, thinking: false });
    expect(() => dbAdmitScheduleExecution(captured!)).not.toThrow();

    // A false `fast` or a false `thinking` silently dropped from the stored
    // row is a change, not an equivalent absence.
    const { fast: _fast, ...withoutFast } = task().config;
    setRawConfig(withoutFast);
    expect(refusalError(() => dbAdmitScheduleExecution(captured!)).reason).toBe("stale");
    const { thinking: _thinking, ...withoutThinking } = task().config;
    setRawConfig(withoutThinking);
    expect(refusalError(() => dbAdmitScheduleExecution(captured!)).reason).toBe("stale");
  });

  it("never substitutes the binding owner for the stored agentKind", () => {
    dbUpsertSchedule(task());
    const captured = dbGetSchedule(TASK_ID)!;
    // The binding's owner kind is inert evidence; a different actual route
    // identity on the row is a change even though the owner still matches.
    dbUpsertSchedule(task({ agentKind: "claude:home" }));
    expect(refusalError(() => dbAdmitScheduleExecution(captured)).reason).toBe("stale");

    // And the reverse: a binding owner that differs from the actual route
    // identity does not make a row stale — the owner is inert evidence and
    // never substitutes for the stored agentKind.
    const divergentOwner = task({
      config: {
        ...task().config,
        selectionBinding: {
          ...binding,
          owner: { agentKind: "other:profile", presentationMode: "gui" },
        },
      },
    });
    dbUpsertSchedule(divergentOwner);
    expect(() => dbAdmitScheduleExecution(divergentOwner)).not.toThrow();
  });

  it("admits after runtime bookkeeping and refuses after concurrent edits or deletes", () => {
    dbUpsertSchedule(task());
    const captured = dbGetSchedule(TASK_ID)!;

    // A settlement that landed between capture and launch changes no
    // execution field.
    dbPatchScheduleRuntime(TASK_ID, {
      lastStatus: "succeeded",
      lastResult: "out",
      lastError: null,
      lastCompletedAt: "2026-07-10T01:00:00.000Z",
      updatedAt: "2026-07-10T01:00:00.000Z",
    });
    expect(() => dbAdmitScheduleExecution(captured)).not.toThrow();

    dbUpsertSchedule(task({ prompt: "Rewritten while launching." }));
    expect(refusalError(() => dbAdmitScheduleExecution(captured)).reason).toBe("stale");

    dbDeleteSchedule(TASK_ID);
    expect(refusalError(() => dbAdmitScheduleExecution(captured)).reason).toBe("missing");
  });
});

describe.skipIf(!sqliteAvailable)("dbPatchScheduleRuntime (real sqlite)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "lc-schedule-patch-test-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertSchedule(task());
    // Simulate pre-guard raw bytes: the full save refuses to replace them.
    setRawConfig({ ...task().config, selectionBinding: { ...binding, version: 2 } });
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("supports an updatedAt-only patch without touching any other column", () => {
    const before = rawRow();
    const updatedAt = "2026-07-10T01:00:00.000Z";
    dbPatchScheduleRuntime(TASK_ID, { updatedAt });
    expect(rawRow()).toEqual({ ...before, updated_at: updatedAt });
  });

  it("rejects invalid runtime fields or attempted selection replacement before writing", () => {
    const before = rawRow();
    const updatedAt = "2026-07-10T01:00:00.000Z";
    expect(() =>
      dbPatchScheduleRuntime(TASK_ID, { updatedAt, lastStatus: "invalid" } as never),
    ).toThrow(ZodError);
    expect(() =>
      dbPatchScheduleRuntime(TASK_ID, { updatedAt, config: { model: "other" } } as never),
    ).toThrow(ZodError);
    expect(rawRow()).toEqual(before);
  });

  it("leaves the protected config bytes and execution columns exact", () => {
    const before = rawRow();
    dbPatchScheduleRuntime(TASK_ID, {
      enabled: false,
      nextRunAt: null,
      lastRunAt: "2026-07-10T00:30:00.000Z",
      lastCompletedAt: "2026-07-10T01:00:00.000Z",
      lastStatus: "failed",
      lastResult: null,
      lastError: "boom",
      updatedAt: "2026-07-10T01:00:00.000Z",
    });
    const after = rawRow();
    for (const column of [
      "id",
      "name",
      "prompt",
      "agent_kind",
      "config",
      "recurrence",
      "project_id",
      "created_at",
    ]) {
      expect(after[column]).toBe(before[column]);
    }
    expect(after.config).toBe(before.config);
    expect(after).toMatchObject({
      enabled: 0,
      next_run_at: null,
      last_status: "failed",
      last_error: "boom",
      updated_at: "2026-07-10T01:00:00.000Z",
    });
  });

  it("keeps the full-save guard refusing over protected raw bytes", () => {
    expect(() => dbUpsertSchedule(task({ prompt: "New prompt" }))).toThrow(
      "unsupported selection data",
    );
    // The persisted read keeps projecting; only writes are refused.
    expect(dbGetSchedule(TASK_ID)?.config).not.toHaveProperty("selectionBinding");
  });

  it("is a no-op for a deleted row instead of resurrecting it", () => {
    dbDeleteSchedule(TASK_ID);
    dbPatchScheduleRuntime(TASK_ID, {
      lastStatus: "succeeded",
      updatedAt: "2026-07-10T01:00:00.000Z",
    });
    expect(dbGetSchedule(TASK_ID)).toBeNull();
    expect(getSqlite().prepare("SELECT COUNT(*) AS n FROM scheduled_tasks").get()).toMatchObject({
      n: 0,
    });
  });
});
