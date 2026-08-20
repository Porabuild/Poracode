import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXPERIMENT_STORE_KEY, type Thread } from "@/shared/contracts";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { LATEST_SCHEMA_VERSION } from "./migrations";
import {
  dbDeleteThread,
  dbGetThread,
  dbGetState,
  dbGetProject,
  dbGetThreads,
  dbMarkLiveThreadsInactive,
  dbSetState,
  dbUpsertProject,
  dbUpsertThread,
} from "./projectsThreads";
import { onProjectThreadDataChanged } from "./projectThreadChanges";
import {
  dbClaimRemoteCommand,
  dbCompleteRemoteCommand,
  dbFailRemoteCommand,
} from "./remoteCommandReceipts";
import { dbPersistExperimentState, dbSyncAll } from "./sync";

// node_modules/better-sqlite3 may be compiled for Electron's ABI. Fall back to
// the Node-ABI binding used by the headless server, preparing it on demand so
// these real-database tests never silently skip on Electron development installs.
const serverNativeBinding = join(process.cwd(), "dist", "server-native", "better_sqlite3.node");
let nativeBindingEnv: string | undefined;

function databaseOpens(nativeBinding?: string): boolean {
  if (nativeBinding && !existsSync(nativeBinding)) return false;
  try {
    const database = nativeBinding
      ? new Database(":memory:", { nativeBinding })
      : new Database(":memory:");
    database.close();
    return true;
  } catch {
    return false;
  }
}

if (!databaseOpens()) {
  if (!databaseOpens(serverNativeBinding)) {
    execFileSync(process.execPath, [join(process.cwd(), "scripts", "prepare-server-native.mjs")], {
      stdio: "inherit",
    });
  }
  if (!databaseOpens(serverNativeBinding)) {
    throw new Error("Unable to prepare a Node-compatible better-sqlite3 binding for tests.");
  }
  nativeBindingEnv = serverNativeBinding;
}

function testThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Test thread",
    agentKind: "claude",
    config: { model: "sonnet" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("projectsThreads (real sqlite round-trip)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "lc-db-test-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Test project",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("round-trips threadStatusSource through the threads table", () => {
    dbUpsertThread(testThread({ threadStatusSource: "server" }), 0);
    expect(dbGetThread("thread-1")?.threadStatusSource).toBe("server");

    dbUpsertThread(testThread({ threadStatusSource: "cli_hook" }), 0);
    expect(dbGetThread("thread-1")?.threadStatusSource).toBe("cli_hook");

    dbUpsertThread(testThread(), 0);
    expect(dbGetThread("thread-1")?.threadStatusSource).toBeUndefined();
  });

  it("round-trips project MCP servers through the projects table", () => {
    dbUpsertProject(
      {
        id: "project-1",
        name: "Test project",
        location: { kind: "posix", path: "/tmp/project" },
        mcpServers: [
          {
            id: "memory-id",
            name: "memory",
            description: "Memory tools",
            enabled: true,
            timeoutMs: 30_000,
            transport: { type: "stdio", command: "node", args: ["server.js"], env: {} },
          },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );

    expect(dbGetProject("project-1")?.mcpServers?.[0]).toMatchObject({
      id: "memory-id",
      name: "memory",
    });
  });

  it("round-trips the project worktree location through the projects table", () => {
    dbUpsertProject(
      {
        id: "project-1",
        name: "Test project",
        location: { kind: "posix", path: "/tmp/project" },
        worktreeLocation: { mode: "global", basePath: "/tmp/worktrees" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );

    expect(dbGetProject("project-1")?.worktreeLocation).toEqual({
      mode: "global",
      basePath: "/tmp/worktrees",
    });
  });

  it("round-trips the project workspace through the projects table", () => {
    const project = {
      id: "project-1",
      name: "Test project",
      location: { kind: "posix" as const, path: "/tmp/project" },
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    // Unfiled by default — a project created before workspaces existed must not
    // come back pinned to some arbitrary group.
    expect(dbGetProject("project-1")?.workspaceId).toBeUndefined();

    dbUpsertProject({ ...project, workspaceId: "ws-work" }, 0);
    expect(dbGetProject("project-1")?.workspaceId).toBe("ws-work");

    dbUpsertProject({ ...project, workspaceId: "ws-side" }, 0);
    expect(dbGetProject("project-1")?.workspaceId).toBe("ws-side");

    // Unfiling clears the column rather than leaving the previous value behind.
    dbUpsertProject(project, 0);
    expect(dbGetProject("project-1")?.workspaceId).toBeUndefined();
  });

  it("repairs a schema-v28 database that is missing the workspace column", () => {
    closeDatabase();
    const databasePath = join(dir, "partial-v28.sqlite");
    const legacy = nativeBindingEnv
      ? new Database(databasePath, { nativeBinding: nativeBindingEnv })
      : new Database(databasePath);
    legacy.exec(`
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
        search_settings TEXT,
        mcp_servers TEXT,
        disabled INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO app_state (key, value) VALUES ('schema_version', '28');
    `);
    legacy.close();

    initDatabase(databasePath);

    const columns = getSqlite().prepare("PRAGMA table_info(projects)").all() as {
      name: string;
    }[];
    expect(columns.some((column) => column.name === "workspace_id")).toBe(true);
    expect(dbGetState("schema_version")).toBe(String(LATEST_SCHEMA_VERSION));
  });

  it("repairs safe schema drift even when the database claims the latest version", () => {
    closeDatabase();
    const databasePath = join(dir, "corrupt-v29.sqlite");
    const corrupt = nativeBindingEnv
      ? new Database(databasePath, { nativeBinding: nativeBindingEnv })
      : new Database(databasePath);
    corrupt.exec(`
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
        search_settings TEXT,
        mcp_servers TEXT,
        disabled INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO projects (
        id, name, location_kind, location_path, disabled, sort_order, created_at
      ) VALUES (
        'legacy-project', 'Legacy project', 'posix', '/tmp/legacy-project', 0, 0,
        '2026-01-01T00:00:00.000Z'
      );
      INSERT INTO app_state (key, value) VALUES ('schema_version', '29');
    `);
    corrupt.close();

    initDatabase(databasePath);

    const columns = getSqlite().prepare("PRAGMA table_info(projects)").all() as {
      name: string;
    }[];
    expect(columns.some((column) => column.name === "workspace_id")).toBe(true);
    expect(dbGetState("schema_version")).toBe(String(LATEST_SCHEMA_VERSION));
    expect(dbGetProject("legacy-project")).toMatchObject({
      id: "legacy-project",
      name: "Legacy project",
      location: { kind: "posix", path: "/tmp/legacy-project" },
    });
  });

  it("repairs blank legacy thread models from schema v29 without changing valid configs", () => {
    const sqlite = getSqlite();
    const insert = sqlite.prepare(`
      INSERT INTO threads (
        id, project_id, title, agent_kind, config, status, attention,
        can_resume_with_config, archived, done, starred, presentation_mode,
        sort_order, created_at, updated_at
      ) VALUES (
        @id, 'project-1', @title, 'claude', @config, 'idle', 'none',
        0, 0, 0, 0, 'gui', @sortOrder,
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
      )
    `);
    insert.run({
      id: "legacy-empty-model",
      title: "Legacy",
      config: JSON.stringify({ model: "", effort: "high" }),
      sortOrder: 0,
    });
    insert.run({
      id: "valid-model",
      title: "Valid",
      config: JSON.stringify({ model: "sonnet", effort: "low" }),
      sortOrder: 1,
    });
    dbSetState("schema_version", "29");

    closeDatabase();
    initDatabase(join(dir, "state.sqlite"));

    expect(dbGetState("schema_version")).toBe(String(LATEST_SCHEMA_VERSION));
    expect(dbGetThread("legacy-empty-model")?.config).toEqual({
      model: "auto",
      effort: "high",
    });
    expect(dbGetThread("valid-model")?.config).toEqual({
      model: "sonnet",
      effort: "low",
    });
  });

  it("round-trips the project workspace through the bulk renderer sync", () => {
    const project = {
      id: "project-bulk",
      name: "Bulk project",
      location: { kind: "posix" as const, path: "/tmp/project-bulk" },
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const viewJson = JSON.stringify({ kind: "home" });

    dbSyncAll([{ ...project, workspaceId: "ws-work" }], [], viewJson);
    expect(dbGetProject(project.id)?.workspaceId).toBe("ws-work");

    dbSyncAll([{ ...project, workspaceId: "ws-side" }], [], viewJson);
    expect(dbGetProject(project.id)?.workspaceId).toBe("ws-side");

    dbSyncAll([project], [], viewJson);
    expect(dbGetProject(project.id)?.workspaceId).toBeUndefined();
  });

  it("persists candidate threads and the experiment record atomically", () => {
    const existing = testThread({ id: "candidate-existing" });
    dbPersistExperimentState({
      upsertThreads: [{ thread: existing, sortOrder: 0 }],
      deletedThreadIds: [],
      experiments: {},
    });
    const originalState = dbGetState(EXPERIMENT_STORE_KEY);

    expect(() =>
      dbPersistExperimentState({
        upsertThreads: [
          {
            thread: testThread({ id: "candidate-invalid", projectId: "missing-project" }),
            sortOrder: 0,
          },
        ],
        deletedThreadIds: [existing.id],
        experiments: {},
      }),
    ).toThrow(/foreign key/i);

    expect(dbGetThread(existing.id)).toBeDefined();
    expect(dbGetThread("candidate-invalid")).toBeNull();
    expect(dbGetState(EXPERIMENT_STORE_KEY)).toBe(originalState);
  });

  it("notifies subscribers after single and bulk project or thread writes", () => {
    let notificationCount = 0;
    const unsubscribe = onProjectThreadDataChanged(() => {
      notificationCount += 1;
    });

    dbUpsertThread(testThread(), 0);
    expect(notificationCount).toBe(1);

    dbSyncAll(
      [dbGetProject("project-1")!],
      [testThread({ title: "Synced thread" })],
      JSON.stringify({ kind: "home" }),
    );
    expect(notificationCount).toBe(2);

    unsubscribe();
    dbDeleteThread("thread-1");
    expect(notificationCount).toBe(2);
  });

  it("replays durable remote command receipts without reclaiming them", () => {
    expect(dbClaimRemoteCommand("command-1", "/api/threads/start")).toEqual({
      state: "claimed",
    });
    dbCompleteRemoteCommand("command-1", { threadId: "thread-1" });
    expect(dbClaimRemoteCommand("command-1", "/api/threads/start")).toEqual({
      state: "completed",
      response: { threadId: "thread-1" },
    });
    expect(dbClaimRemoteCommand("command-1", "/api/threads/thread-1/send")).toEqual({
      state: "conflict",
    });

    expect(dbClaimRemoteCommand("command-2", "/api/threads/thread-1/send")).toEqual({
      state: "claimed",
    });
    dbFailRemoteCommand("command-2");
    expect(dbClaimRemoteCommand("command-2", "/api/threads/thread-1/send")).toEqual({
      state: "failed",
    });
  });

  it("marks live threads inactive on launch but leaves settled ones alone", () => {
    dbUpsertThread(
      testThread({
        id: "t-working",
        status: "working",
        attention: "working",
        activeTurnStartedAt: "2026-01-01T00:00:00.000Z",
      }),
      0,
    );
    dbUpsertThread(testThread({ id: "t-launching", status: "launching" }), 1);
    dbUpsertThread(testThread({ id: "t-inactive", status: "inactive" }), 2);
    dbUpsertThread(testThread({ id: "t-error", status: "error" }), 3);

    dbMarkLiveThreadsInactive();

    const byId = new Map(dbGetThreads().map((thread) => [thread.id, thread]));
    expect(byId.get("t-working")).toMatchObject({ status: "inactive", attention: "none" });
    expect(byId.get("t-working")?.activeTurnStartedAt).toBeUndefined();
    expect(byId.get("t-launching")?.status).toBe("inactive");
    expect(byId.get("t-inactive")?.status).toBe("inactive");
    expect(byId.get("t-error")?.status).toBe("error");
  });
});
