import { describe, expect, it } from "vitest";
import {
  assertMigrationRollbackClassifications,
  DATABASE_MIGRATIONS,
  describeMigrationRollbackPolicy,
  LATEST_SCHEMA_VERSION,
  MIGRATION_ROLLBACK_CLASSIFICATION_REQUIRED_FROM,
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
      [42, "main-created thread ownership"],
      [43, "terminal scrollback"],
      [44, "repair divergent schema 32 and 33"],
      [45, "checkpoint revert operations journal"],
      [46, "checkpoint revert provider anchor"],
      [47, "remote command receipt principal and request digest"],
      [48, "runtime durable canonical-gap evidence"],
      [49, "runtime history notice acknowledgement"],
    ]);
    expect(LATEST_SCHEMA_VERSION).toBe(49);
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

  it("requires an explicit rollback classification from the reviewed floor (F10)", () => {
    // The floor is the first migration added after the D4 review (schema 47).
    // It never needs to advance: every migration at or above it must declare
    // its data compatibility, so a new unclassified migration fails closed
    // instead of silently defaulting to rollback-compatible.
    expect(MIGRATION_ROLLBACK_CLASSIFICATION_REQUIRED_FROM).toBe(48);
    expect(describeMigrationRollbackPolicy().at(-1)).toEqual({
      version: 49,
      name: "runtime history notice acknowledgement",
      rollback: "forward-only",
    });
    // Migrations below the floor keep their reviewed defaults.
    expect(() =>
      assertMigrationRollbackClassifications([{ version: 47, name: "reviewed default" }]),
    ).not.toThrow();
    expect(() =>
      assertMigrationRollbackClassifications([{ version: 48, name: "unclassified" }]),
    ).toThrow(/does not declare/u);
    expect(() => validateMigrationRegistry([{ version: 48, name: "unclassified" }])).toThrow(
      /does not declare/u,
    );
    expect(() =>
      assertMigrationRollbackClassifications([
        { version: 48, name: "classified", rollback: "forward-only" },
      ]),
    ).not.toThrow();
  });
});
