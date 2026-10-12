import { afterEach, describe, expect, it } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { closeDatabase, initDatabase } from "./connection";
import {
  assertRequiredDatabaseSchema,
  LATEST_SCHEMA_VERSION,
  runDatabaseMigrations,
} from "./migrations";
import { dbGetProjects, dbGetThread, dbUpsertProject, dbUpsertThread } from "./projectsThreads";

/**
 * Master published a schema-42 project repair while v2 used 42 for
 * main-created thread ownership. This fixture removes that v2-only table and
 * reopens at the master version, then proves the append-only repair joins both
 * lineages without losing a duplicate's thread.
 */
describe("schema-42 lineage join", () => {
  afterEach(() => closeDatabase());

  it("reasserts ownership and rehomes duplicate-project threads", () => {
    const sqlite = initDatabase(":memory:");
    const canonical: Project = {
      id: "older",
      name: "Original",
      location: { kind: "posix", path: "/tmp/schema42-project" },
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const duplicate: Project = {
      ...canonical,
      id: "newer",
      name: "Readded",
      location: { kind: "posix", path: "/tmp/schema42-project/" },
      createdAt: "2026-01-01T00:00:00.000Z",
      scripts: { setupScript: "keep me", actions: [] },
    };
    dbUpsertProject(canonical, 1);
    dbUpsertProject(duplicate, 0);
    const thread: Thread = {
      id: "surviving-thread",
      projectId: duplicate.id,
      title: "Work",
      agentKind: "claude",
      config: { model: "default" },
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    dbUpsertThread(thread, 0);

    sqlite.exec("DROP TABLE main_created_threads");
    sqlite.prepare("UPDATE app_state SET value = '42' WHERE key = 'schema_version'").run();
    expect(() => assertRequiredDatabaseSchema(sqlite)).toThrow(/main_created_threads/);

    runDatabaseMigrations(sqlite, 42);

    expect(
      sqlite.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get(),
    ).toEqual({
      value: String(LATEST_SCHEMA_VERSION),
    });
    expect(
      sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'main_created_threads'").get(),
    ).toEqual({ name: "main_created_threads" });
    expect(dbGetProjects()).toEqual([
      expect.objectContaining({ id: canonical.id, scripts: duplicate.scripts }),
    ]);
    expect(dbGetThread(thread.id)?.projectId).toBe(canonical.id);
    expect(() => assertRequiredDatabaseSchema(sqlite)).not.toThrow();
  });
});
