import { describe, expect, it } from "vitest";
import { runDatabaseMigrations } from "./migrations";
import {
  createSchema53PayloadOriginDatabase,
  migrateSchema53FixtureThrough,
} from "./runtimePayloadOrigins.testFixtures";

describe("schema 58 schedule upgrade", () => {
  it("preserves selection custody and cadence while making historical failures reviewable", () => {
    const sqlite = createSchema53PayloadOriginDatabase(":memory:");
    try {
      migrateSchema53FixtureThrough(sqlite, 58);
      const config =
        '{"model":"future","thinking":"adaptive","contextSize":"large","selectionBinding":{"version":999,"opaque":"retain exact bytes"}}';
      const recurrence = '{"kind":"weekly","days":[1],"time":"09:00"}';
      sqlite
        .prepare(
          "INSERT INTO scheduled_tasks(id,name,prompt,agent_kind,config,recurrence,next_run_at,created_at,updated_at) VALUES (?, 'Fixture', 'Review', 'fixture', ?, ?, ?, '2026-01-01', '2026-01-01')",
        )
        .run("task", config, recurrence, "2026-10-20T07:00:00.000Z");
      const insert = sqlite.prepare(
        "INSERT INTO scheduled_task_runs(id,schedule_id,thread_id,started_at,completed_at,status,summary,error) VALUES (?, 'task', 'thread', '2026-10-13T07:00:00.000Z', ?, ?, ?, ?)",
      );
      insert.run("failed", "2026-10-13T07:01:00.000Z", "failed", null, "existing diagnostic");
      insert.run("success", "2026-10-13T07:01:00.000Z", "succeeded", "Saved answer", null);
      insert.run("active", null, "running", null, null);
      runDatabaseMigrations(sqlite, 58);
      expect(
        sqlite.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get(),
      ).toEqual({ value: "69" });
      expect(
        sqlite
          .prepare(
            "SELECT config, recurrence, next_run_at, automation, iteration_count FROM scheduled_tasks",
          )
          .get(),
      ).toEqual({
        config,
        recurrence,
        next_run_at: "2026-10-20T07:00:00.000Z",
        automation: null,
        iteration_count: 0,
      });
      const failed = sqlite
        .prepare(
          "SELECT error, unread, archived_at, result, scheduled_for FROM scheduled_task_runs WHERE id = 'failed'",
        )
        .get() as {
        error: string;
        unread: number;
        archived_at: string | null;
        result: string;
        scheduled_for: string;
      };
      expect(failed).toMatchObject({
        error: "existing diagnostic",
        unread: 1,
        archived_at: null,
        scheduled_for: "2026-10-13T07:00:00.000Z",
      });
      expect(JSON.parse(failed.result)).toMatchObject({
        outcome: "needs-attention",
        unread: true,
        stopReason: "legacy-run",
      });
      expect(
        sqlite
          .prepare("SELECT unread, archived_at FROM scheduled_task_runs WHERE id = 'success'")
          .get(),
      ).toEqual({ unread: 0, archived_at: "2026-10-13T07:01:00.000Z" });
      expect(
        sqlite.prepare("SELECT result FROM scheduled_task_runs WHERE id = 'active'").get(),
      ).toEqual({ result: null });
    } finally {
      sqlite.close();
    }
  });
});
