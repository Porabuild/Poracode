import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrWatch } from "@/shared/contracts";
import { closeDatabase, initDatabase } from "./connection";
import { dbUpsertProject } from "./projectsThreads";
import { dbDeletePrWatch, dbGetPrWatch, dbGetPrWatches, dbUpsertPrWatch } from "./prWatches";

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

function watch(overrides: Partial<PrWatch> = {}): PrWatch {
  return {
    projectId: "project-1",
    prNumber: 42,
    headBranch: "feature/pr-watch",
    watchEnabled: true,
    autoMerge: false,
    agentKind: "codex",
    config: { model: "gpt-5.6", effort: "high" },
    lastCommentCursor: null,
    lastReviewCommentCursor: null,
    lastReviewCursor: null,
    lastCheckKey: null,
    activeThreadId: null,
    lastError: null,
    blockedReason: null,
    ...overrides,
  };
}

describe.skipIf(!sqliteAvailable)("prWatches (real sqlite round-trip)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "poracode-pr-watch-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Poracode",
        location: { kind: "posix", path: "/repo" },
        createdAt: "2026-07-25T00:00:00.000Z",
      },
      0,
    );
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("persists, updates, lists, and deletes a PR watch", () => {
    dbUpsertPrWatch(watch());
    expect(dbGetPrWatch("project-1", 42)).toEqual(watch());

    dbUpsertPrWatch(watch({ autoMerge: true }));
    expect(dbGetPrWatches()).toEqual([watch({ autoMerge: true })]);

    dbDeletePrWatch("project-1", 42);
    expect(dbGetPrWatch("project-1", 42)).toBeNull();
  });

  it("round-trips a blocked reason", () => {
    dbUpsertPrWatch(watch({ blockedReason: "worktree-unavailable" }));
    expect(dbGetPrWatch("project-1", 42)?.blockedReason).toBe("worktree-unavailable");

    dbUpsertPrWatch(watch({ blockedReason: null }));
    expect(dbGetPrWatch("project-1", 42)?.blockedReason).toBeNull();
  });
});

describe.skipIf(!sqliteAvailable)("prWatches (upgrade from a pre-blocked-reason database)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "poracode-pr-watch-upgrade-"));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("adds blocked_reason to a table created before schema 32", () => {
    const dbPath = join(dir, "state.sqlite");
    // A schema-31 database: pr_watches exists without blocked_reason, and
    // app_state claims the migrations are done, so `CREATE TABLE IF NOT EXISTS`
    // will not fix the shape on its own.
    const legacy = new Database(
      dbPath,
      nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : {},
    );
    legacy.exec(`
      CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        location_kind TEXT NOT NULL,
        location_path TEXT,
        location_distro TEXT,
        location_linux_path TEXT,
        location_unc_path TEXT,
        last_draft_config TEXT,
        scripts TEXT,
        worktree_location TEXT,
        workspace_id TEXT,
        mcp_servers TEXT,
        disabled INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE pr_watches (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        pr_number INTEGER NOT NULL,
        head_branch TEXT NOT NULL,
        worktree_path TEXT,
        watch_enabled INTEGER NOT NULL DEFAULT 1,
        auto_merge INTEGER NOT NULL DEFAULT 0,
        agent_kind TEXT,
        config TEXT,
        last_comment_cursor TEXT,
        last_review_comment_cursor TEXT,
        last_review_cursor TEXT,
        last_check_key TEXT,
        active_thread_id TEXT,
        last_error TEXT,
        PRIMARY KEY (project_id, pr_number)
      );
      INSERT INTO app_state (key, value) VALUES ('schema_version', '31');
      INSERT INTO projects (id, name, location_kind, location_path, created_at)
        VALUES ('project-1', 'Poracode', 'posix', '/repo', '2026-07-25T00:00:00.000Z');
      INSERT INTO pr_watches (project_id, pr_number, head_branch, agent_kind, config)
        VALUES ('project-1', 42, 'feature/pr-watch', 'codex', '{"model":"gpt-5.6"}');
    `);
    legacy.close();

    initDatabase(dbPath);

    const migrated = dbGetPrWatch("project-1", 42);
    expect(migrated?.blockedReason).toBeNull();
    dbUpsertPrWatch({ ...migrated!, blockedReason: "agent-unavailable" });
    expect(dbGetPrWatch("project-1", 42)?.blockedReason).toBe("agent-unavailable");
  });
});
