import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import {
  DATABASE_MIGRATIONS,
  LATEST_SCHEMA_VERSION,
  runDatabaseMigrations,
  validateMigrationRegistry,
} from "./migrations";

describe("database migration registry", () => {
  it("keeps the published migration history append-only", () => {
    expect(DATABASE_MIGRATIONS.map(({ version, name }) => [version, name])).toEqual([
      [2, "threads.done"],
      [3, "threads.group_id"],
      [4, "threads.group_name"],
      [5, "projects.search_settings"],
      [6, "threads.starred"],
      [7, "normalize model context suffixes"],
      [8, "thread presentation"],
      [9, "thread runtime items"],
      [10, "thread runtime parent item"],
      [11, "thread turn timestamps"],
      [12, "thread completed turns"],
      [13, "projects.disabled"],
      [14, "threads.done_at"],
      [15, "thread context usage"],
      [16, "project notes"],
      [19, "usage events"],
      [20, "thread status source"],
      [21, "scheduled tasks"],
      [22, "scheduled task runs"],
      [23, "scheduled task project"],
      [24, "project MCP servers"],
      [25, "remote command receipts"],
      [26, "thread parent"],
      [27, "token usage ledger"],
      [28, "pull request watches"],
      [29, "project workspace"],
      [30, "repair empty thread models"],
      [31, "project worktree location"],
      [32, "pr watch blocked reason"],
      [33, "project GitHub account"],
      [34, "projects.icon"],
      [35, "threads.archived_at"],
      [36, "runtime item stream chunks"],
      [37, "threads.workspace_id"],
      [38, "runtime item parent index"],
      [39, "adopt Antigravity ACP provider"],
      [40, "normalize Antigravity ACP model variants"],
      [41, "repair Antigravity persisted model variants"],
      [42, "deduplicate project locations"],
    ]);
    expect(LATEST_SCHEMA_VERSION).toBe(42);
    expect(() => validateMigrationRegistry()).not.toThrow();
  });

  it("rejects duplicate, reordered, or non-integer versions", () => {
    expect(() =>
      validateMigrationRegistry([
        { version: 2, name: "first" },
        { version: 2, name: "duplicate" },
      ]),
    ).toThrow(/strictly increasing/i);
    expect(() =>
      validateMigrationRegistry([
        { version: 3, name: "first" },
        { version: 2, name: "reordered" },
      ]),
    ).toThrow(/strictly increasing/i);
    expect(() => validateMigrationRegistry([{ version: 1.5, name: "fractional" }])).toThrow(
      /integer/i,
    );
  });

  it("rejects duplicate migration names", () => {
    expect(() =>
      validateMigrationRegistry([
        { version: 2, name: "same operation" },
        { version: 3, name: "same operation" },
      ]),
    ).toThrow(/name is duplicated/i);
  });

  it.each([
    { kind: "draft", projectId: "duplicate" },
    { kind: "experiment", projectId: "duplicate", experimentId: "e1" },
    {
      kind: "thread",
      panes: ["draft:duplicate#pane-1", "thread-1"],
      paneLayout: {
        kind: "split",
        axis: "vertical",
        children: [
          { kind: "leaf", paneId: "draft:duplicate#pane-1" },
          { kind: "leaf", paneId: "thread-1" },
        ],
      },
    },
  ])("repairs duplicate projects and their persisted $kind view", (view) => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE projects (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT, location_kind TEXT NOT NULL,
          location_path TEXT, location_distro TEXT, location_linux_path TEXT, location_unc_path TEXT,
          last_draft_config TEXT, scripts TEXT, search_settings TEXT, worktree_location TEXT,
          mcp_servers TEXT, gh_account TEXT, workspace_id TEXT, disabled INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
        );
        CREATE TABLE threads (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE);
        CREATE TABLE thread_runtime_items (thread_id TEXT REFERENCES threads(id) ON DELETE CASCADE, content TEXT);
        CREATE TABLE project_notes (project_id TEXT PRIMARY KEY, doc TEXT, todos TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE scheduled_tasks (id TEXT PRIMARY KEY, project_id TEXT);
        CREATE TABLE pr_watches (
          project_id TEXT NOT NULL REFERENCES projects(id), pr_number INTEGER NOT NULL,
          PRIMARY KEY (project_id, pr_number)
        );
      `);
      const insertProject = sqlite.prepare(
        `INSERT INTO projects (id, name, location_kind, location_path, sort_order, created_at)
         VALUES (?, ?, 'posix', ?, ?, '2026-01-01T00:00:00.000Z')`,
      );
      insertProject.run("canonical", "Canonical", "/repo", 0);
      insertProject.run("duplicate", "Duplicate", "/repo/", 1);
      insertProject.run(HOME_PROJECT_ID, "Home", "/repo", 2);
      sqlite.prepare("INSERT INTO threads VALUES (?, ?)").run("thread-1", "duplicate");
      sqlite
        .prepare("INSERT INTO thread_runtime_items VALUES (?, ?)")
        .run("thread-1", "saved reply");
      sqlite
        .prepare("INSERT INTO project_notes VALUES (?, ?, ?, ?)")
        .run("duplicate", "notes", "[]", "2026-01-01T00:00:00.000Z");
      sqlite
        .prepare("INSERT INTO project_notes VALUES (?, ?, ?, ?)")
        .run("canonical", null, "[]", "2026-01-01T00:00:00.000Z");
      sqlite.prepare("INSERT INTO scheduled_tasks VALUES (?, ?)").run("schedule-1", "duplicate");
      sqlite.prepare("INSERT INTO pr_watches VALUES (?, ?)").run("duplicate", 7);
      sqlite.prepare("INSERT INTO app_state VALUES (?, ?)").run("view", JSON.stringify(view));
      const groupLayouts = {
        group1: {
          panes: ["draft:duplicate#pane-2"],
          paneLayout: { kind: "leaf", paneId: "draft:duplicate#pane-2" },
        },
      };
      sqlite
        .prepare("INSERT INTO app_state VALUES (?, ?)")
        .run("groupLayouts", JSON.stringify(groupLayouts));
      sqlite.prepare("INSERT INTO app_state VALUES (?, ?)").run(
        "poracode-experiments-v1",
        JSON.stringify({
          state: { experiments: { e1: { projectId: "duplicate" } } },
          version: 1,
        }),
      );

      runDatabaseMigrations(sqlite, 41);

      expect(sqlite.prepare("SELECT id FROM projects ORDER BY id").all()).toEqual([
        { id: HOME_PROJECT_ID },
        { id: "canonical" },
      ]);
      expect(sqlite.prepare("SELECT content FROM thread_runtime_items").get()).toEqual({
        content: "saved reply",
      });
      for (const [key, original] of Object.entries({ view, groupLayouts })) {
        const persisted = sqlite.prepare("SELECT value FROM app_state WHERE key = ?").get(key) as {
          value: string;
        };
        expect(JSON.parse(persisted.value)).toEqual(
          JSON.parse(JSON.stringify(original).replaceAll("duplicate", "canonical")),
        );
      }
      expect(sqlite.prepare("SELECT project_id FROM threads").get()).toEqual({
        project_id: "canonical",
      });
      expect(sqlite.prepare("SELECT project_id FROM project_notes").get()).toEqual({
        project_id: "canonical",
      });
      expect(sqlite.prepare("SELECT doc FROM project_notes").get()).toEqual({ doc: "notes" });
      expect(sqlite.prepare("SELECT project_id FROM scheduled_tasks").get()).toEqual({
        project_id: "canonical",
      });
      expect(sqlite.prepare("SELECT project_id FROM pr_watches").get()).toEqual({
        project_id: "canonical",
      });
      expect(
        JSON.parse(
          (
            sqlite
              .prepare("SELECT value FROM app_state WHERE key = ?")
              .get("poracode-experiments-v1") as { value: string }
          ).value,
        ).state.experiments.e1.projectId,
      ).toBe("canonical");
    } finally {
      sqlite.close();
    }
  });
});
