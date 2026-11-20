import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { nativeBindingEnv } from "./runtimeItems.testFixtures";
import { dbUpsertProject } from "./projectsThreads";
import { dbCompareAndSetProjectNotes, dbGetProjectNotes, dbSetProjectNotes } from "./notes";
import { runDatabaseMigrations } from "./migrations";
import { rehomeProjectReferences } from "./projectDeduplication";

const projectId = "project";
const updatedAt = "2026-01-01T00:00:00.000Z";
const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

beforeEach(() => {
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  initDatabase(":memory:");
  dbUpsertProject(
    {
      id: projectId,
      name: "Project",
      location: { kind: "posix", path: "/fixture" },
      createdAt: updatedAt,
    },
    0,
  );
});

afterEach(() => {
  closeDatabase();
  delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
});

describe("guarded Project Notes", () => {
  it("upgrades schema 77 notes without changing their legacy data", () => {
    const db = new Database(
      ":memory:",
      nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : {},
    );
    try {
      db.exec(`
        CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE project_notes (project_id TEXT PRIMARY KEY, doc TEXT, todos TEXT, updated_at TEXT);
      `);
      db.prepare("INSERT INTO project_notes VALUES (?, ?, ?, ?)").run(
        projectId,
        JSON.stringify(doc("old")),
        "[]",
        updatedAt,
      );
      runDatabaseMigrations(db, 77);
      expect(db.prepare("SELECT * FROM project_notes").get()).toEqual({
        project_id: projectId,
        doc: JSON.stringify(doc("old")),
        todos: "[]",
        updated_at: updatedAt,
        revision: null,
      });
    } finally {
      db.close();
    }
  });

  it("detects legacy edits with the same timestamp and protects guarded notes from older writers", () => {
    const legacy = { projectId, doc: doc("original"), todos: [], updatedAt };
    dbSetProjectNotes(legacy);
    const first = dbGetProjectNotes(projectId)!;
    dbSetProjectNotes({ ...legacy, doc: doc("newer legacy edit") });
    expect(
      dbCompareAndSetProjectNotes({
        projectId,
        baseRevision: first.revision!,
        replacement: { doc: doc("stale"), todos: [] },
      }),
    ).toMatchObject({ status: "conflict", notes: { doc: doc("newer legacy edit") } });

    const current = dbGetProjectNotes(projectId)!;
    const saved = dbCompareAndSetProjectNotes({
      projectId,
      baseRevision: current.revision!,
      replacement: { doc: doc("guarded"), todos: [] },
    });
    expect(saved).toMatchObject({ status: "saved", notes: { doc: doc("guarded") } });
    expect(() => dbSetProjectNotes(legacy)).toThrow("Project Notes changed");
    dbSetProjectNotes({ ...legacy, doc: doc("guarded") });
    expect(dbGetProjectNotes(projectId)).toEqual(saved.notes);
  });

  it("rejects the second creation from an empty revision", () => {
    const input = { projectId, baseRevision: null, replacement: { doc: null, todos: [] } };
    const saved = dbCompareAndSetProjectNotes(input);
    expect(saved.status).toBe("saved");
    expect(
      dbCompareAndSetProjectNotes({
        ...input,
        replacement: { doc: doc("other"), todos: [] },
      }),
    ).toEqual({ status: "conflict", notes: saved.notes });
  });

  it("keeps protection when merging notes from a duplicate project", () => {
    const duplicateId = "duplicate";
    dbUpsertProject(
      {
        id: duplicateId,
        name: "Duplicate",
        location: { kind: "posix", path: "/other" },
        createdAt: updatedAt,
      },
      1,
    );
    const legacy = { projectId, doc: doc("first"), todos: [], updatedAt };
    dbSetProjectNotes(legacy);
    const original = dbGetProjectNotes(projectId)!;
    dbCompareAndSetProjectNotes({
      projectId: duplicateId,
      baseRevision: null,
      replacement: { doc: doc("guarded second"), todos: [] },
    });
    rehomeProjectReferences(getSqlite(), new Map([[duplicateId, projectId]]));
    const merged = dbGetProjectNotes(projectId)!;
    expect(merged.revision).not.toBe(original.revision);
    expect(merged.doc).toMatchObject({
      content: [...doc("first").content, ...doc("guarded second").content],
    });
    expect(() => dbSetProjectNotes(legacy)).toThrow("Project Notes changed");
  });
});
