import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { expect, it } from "vitest";
import { closeDatabase, initDatabase } from "./connection";
import { runDatabaseMigrations } from "./migrations";
import { dbGetProjects, dbGetThreads } from "./projectsThreads";
import {
  createSchema53PayloadOriginDatabase,
  migrateSchema53FixtureThrough,
} from "./runtimePayloadOrigins.testFixtures";

it("upgrades schema65 without rewriting rows and seeks both manual catalog orders", () => {
  const dir = mkdtempSync(join("tmp", "catalog-schema66-"));
  let db: InstanceType<typeof Database> | undefined;
  try {
    db = createSchema53PayloadOriginDatabase(join(dir, "state.sqlite"));
    migrateSchema53FixtureThrough(db, 65);
    const before = ["threads", "projects", "thread_runtime_items"].map((table) =>
      db!.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    );
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%catalog_manual'").all(),
    ).toEqual([]);
    runDatabaseMigrations(db, 65);
    expect(db.prepare("SELECT value FROM app_state WHERE key='schema_version'").get()).toEqual({
      value: "69",
    });
    expect(
      ["threads", "projects", "thread_runtime_items"].map((table) =>
        db!.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      ),
    ).toEqual(before);
    for (const table of ["threads", "projects"]) {
      const plan = db
        .prepare(
          `EXPLAIN QUERY PLAN SELECT id FROM ${table} WHERE (sort_order,id) > (?,?) ORDER BY sort_order,id LIMIT 51`,
        )
        .all(100, "old-cursor") as { detail: string }[];
      const detail = plan.map((row) => row.detail).join(" ");
      expect(detail).toContain(`SEARCH ${table} USING COVERING INDEX idx_${table}_catalog_manual`);
      expect(detail).not.toContain("TEMP B-TREE");
    }
  } finally {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it("preserves legacy full-reader tie order when upgrading schema65", () => {
  const dir = mkdtempSync(join("tmp", "catalog-legacy-order-"));
  const databasePath = join(dir, "state.sqlite");
  let db: InstanceType<typeof Database> | undefined;
  try {
    db = createSchema53PayloadOriginDatabase(databasePath);
    migrateSchema53FixtureThrough(db, 65);
    for (const suffix of ["z", "a", "m"]) {
      db.prepare(
        `INSERT INTO projects (id, name, location_kind, location_path, created_at, sort_order)
         VALUES (?, ?, 'posix', ?, '2026-01-01', 0)`,
      ).run(`tie-${suffix}`, suffix, `/fixture/${suffix}`);
      db.prepare(
        `INSERT INTO threads (id, project_id, title, agent_kind, config, status, attention,
          created_at, updated_at, sort_order)
         VALUES (?, 'project-1', ?, 'fixture', '{}', 'idle', 'none',
          '2026-01-01', '2026-01-01', 0)`,
      ).run(`tie-${suffix}`, suffix);
    }
    const legacyIds = (table: string) =>
      (
        db!.prepare(`SELECT id FROM ${table} ORDER BY sort_order ASC`).all() as { id: string }[]
      ).map((row) => row.id);
    const projectsBefore = legacyIds("projects");
    const threadsBefore = legacyIds("threads");
    expect(projectsBefore.filter((id) => id.startsWith("tie-"))).toEqual([
      "tie-z",
      "tie-a",
      "tie-m",
    ]);
    expect(threadsBefore.filter((id) => id.startsWith("tie-"))).toEqual([
      "tie-z",
      "tie-a",
      "tie-m",
    ]);
    db.close();
    db = undefined;
    initDatabase(databasePath);
    expect(dbGetProjects().map((project) => project.id)).toEqual(projectsBefore);
    expect(dbGetThreads().map((thread) => thread.id)).toEqual(threadsBefore);
  } finally {
    db?.close();
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
  }
});
