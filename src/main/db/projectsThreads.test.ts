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

  it("round-trips and clears the thread archive timestamp", () => {
    dbUpsertThread(
      testThread({
        archived: true,
        archivedAt: "2026-02-02T03:04:05.000Z",
      }),
      0,
    );
    expect(dbGetThread("thread-1")?.archivedAt).toBe("2026-02-02T03:04:05.000Z");

    dbUpsertThread(testThread(), 0);
    expect(dbGetThread("thread-1")?.archivedAt).toBeUndefined();
  });

  it("backfills archive timestamps when upgrading schema v34", () => {
    dbUpsertThread(
      testThread({
        archived: true,
        updatedAt: "2026-02-03T04:05:06.000Z",
      }),
      0,
    );
    dbSetState("schema_version", "34");

    closeDatabase();
    initDatabase(join(dir, "state.sqlite"));

    expect(dbGetThread("thread-1")?.archivedAt).toBe("2026-02-03T04:05:06.000Z");
    expect(dbGetState("schema_version")).toBe(String(LATEST_SCHEMA_VERSION));
  });

  it("round-trips the thread workspace through the threads table", () => {
    dbUpsertThread(testThread({ workspaceId: "ws-work" }), 0);
    expect(dbGetThread("thread-1")?.workspaceId).toBe("ws-work");

    // Conflict-update path: "Move to Workspace" must survive a full re-sync.
    dbUpsertThread(testThread({ workspaceId: "ws-side" }), 0);
    expect(dbGetThread("thread-1")?.workspaceId).toBe("ws-side");

    // Un-filing ("All workspaces") clears the column rather than leaving the
    // previous value behind.
    dbUpsertThread(testThread(), 0);
    expect(dbGetThread("thread-1")?.workspaceId).toBeUndefined();
  });

  it("keeps pre-upgrade threads untagged after the v37 workspace migration", () => {
    dbUpsertThread(testThread(), 0);
    // Simulate a pre-v37 database: the column absent, the version rewound.
    getSqlite().exec("ALTER TABLE threads DROP COLUMN workspace_id");
    dbSetState("schema_version", "36");

    closeDatabase();
    initDatabase(join(dir, "state.sqlite"));

    expect(dbGetState("schema_version")).toBe(String(LATEST_SCHEMA_VERSION));
    const columns = getSqlite().prepare("PRAGMA table_info(threads)").all() as {
      name: string;
    }[];
    expect(columns.some((column) => column.name === "workspace_id")).toBe(true);
    // Untagged = visible in every workspace, so upgraded threads keep today's
    // behavior instead of vanishing from sidebars.
    expect(dbGetThread("thread-1")?.workspaceId).toBeUndefined();
  });

  it("adopts generic Antigravity ACP threads during the v39 migration", () => {
    dbUpsertThread(
      testThread({
        agentKind: "acp-generic:antigravity-acp",
        agentInstanceId: "antigravity-acp",
        presentationMode: "gui",
      }),
      0,
    );
    getSqlite()
      .prepare(
        `INSERT INTO scheduled_tasks
          (id, name, prompt, agent_kind, config, recurrence, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "schedule-antigravity",
        "Antigravity",
        "Run",
        "acp-generic:antigravity-acp",
        JSON.stringify({ model: "gemini" }),
        JSON.stringify({ type: "daily", hour: 9, minute: 0 }),
        "2026-08-01T00:00:00.000Z",
        "2026-08-01T00:00:00.000Z",
      );
    getSqlite()
      .prepare(
        `INSERT INTO pr_watches (project_id, pr_number, head_branch, agent_kind, config)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        "project-1",
        42,
        "feature",
        "acp-generic:antigravity-acp",
        JSON.stringify({ model: "gemini" }),
      );
    getSqlite()
      .prepare("UPDATE projects SET last_draft_config = ? WHERE id = ?")
      .run(
        JSON.stringify({ agentKind: "acp-generic:antigravity-acp", model: "gemini-3-pro" }),
        "project-1",
      );
    getSqlite()
      .prepare(
        `INSERT INTO scheduled_tasks
          (id, name, prompt, agent_kind, config, recurrence, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "schedule-antigravity-v39",
        "Antigravity",
        "Run",
        "antigravity",
        JSON.stringify({ model: "gemini-3.5-flash-low" }),
        JSON.stringify({ type: "daily", hour: 9, minute: 0 }),
        "2026-08-01T00:00:00.000Z",
        "2026-08-01T00:00:00.000Z",
      );
    getSqlite()
      .prepare(
        `INSERT INTO pr_watches (project_id, pr_number, head_branch, agent_kind, config)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        "project-1",
        43,
        "feature-v39",
        "antigravity",
        JSON.stringify({ model: "gemini-3.5-flash-low" }),
      );
    dbSetState("schema_version", "37");

    closeDatabase();
    initDatabase(join(dir, "state.sqlite"));

    expect(dbGetThread("thread-1")).toMatchObject({
      agentKind: "antigravity",
      presentationMode: "gui",
    });
    expect(dbGetThread("thread-1")?.agentInstanceId).toBeUndefined();
    expect(dbGetProject("project-1")?.lastDraftConfig).toMatchObject({
      agentKind: "antigravity",
      model: "gemini-3-pro",
      presentationMode: "gui",
    });
    expect(
      JSON.parse(
        (
          getSqlite()
            .prepare("SELECT config FROM scheduled_tasks WHERE id = ?")
            .get("schedule-antigravity-v39") as { config: string }
        ).config,
      ),
    ).toMatchObject({ model: "gemini-3.5-flash", effort: "Medium" });
    expect(
      JSON.parse(
        (
          getSqlite()
            .prepare("SELECT config FROM pr_watches WHERE project_id = ? AND pr_number = ?")
            .get("project-1", 43) as { config: string }
        ).config,
      ),
    ).toMatchObject({ model: "gemini-3.5-flash", effort: "Medium" });
    expect(
      getSqlite()
        .prepare("SELECT agent_kind FROM scheduled_tasks WHERE id = ?")
        .get("schedule-antigravity"),
    ).toEqual({ agent_kind: "antigravity" });
    expect(
      getSqlite()
        .prepare("SELECT agent_kind FROM pr_watches WHERE project_id = ? AND pr_number = ?")
        .get("project-1", 42),
    ).toEqual({ agent_kind: "antigravity" });
    expect(dbGetState("schema_version")).toBe(String(LATEST_SCHEMA_VERSION));
  });

  it("normalizes persisted Antigravity ACP model variants during the v40 migration", () => {
    dbUpsertThread(
      testThread({
        agentKind: "antigravity",
        config: { model: "gemini-3.7-flash-high" },
        presentationMode: "gui",
      }),
      0,
    );
    dbUpsertThread(
      testThread({
        id: "terminal-thread",
        agentKind: "antigravity",
        config: { model: "gemini-3.5-flash-low", effort: "Low" },
        presentationMode: "terminal",
      }),
      0,
    );
    getSqlite()
      .prepare("UPDATE projects SET last_draft_config = ? WHERE id = ?")
      .run(
        JSON.stringify({
          agentKind: "antigravity",
          model: "gemini-3-flash-agent",
          presentationMode: "gui",
        }),
        "project-1",
      );
    dbSetState("schema_version", "38");

    closeDatabase();
    initDatabase(join(dir, "state.sqlite"));

    expect(dbGetThread("thread-1")?.config).toMatchObject({
      model: "gemini-3.7-flash",
      effort: "High",
    });
    expect(dbGetThread("terminal-thread")?.config).toMatchObject({
      model: "gemini-3.5-flash-low",
      effort: "Low",
    });
    expect(dbGetProject("project-1")?.lastDraftConfig).toMatchObject({
      model: "gemini-3.5-flash",
      effort: "High",
      presentationMode: "gui",
    });
    expect(dbGetState("schema_version")).toBe(String(LATEST_SCHEMA_VERSION));
  });

  it("repairs Antigravity project drafts for databases that already recorded v39", () => {
    getSqlite()
      .prepare("UPDATE projects SET last_draft_config = ? WHERE id = ?")
      .run(
        JSON.stringify({
          agentKind: "antigravity",
          model: "gemini-3-flash-agent",
          presentationMode: "gui",
        }),
        "project-1",
      );
    dbSetState("schema_version", "39");

    closeDatabase();
    initDatabase(join(dir, "state.sqlite"));

    expect(dbGetProject("project-1")?.lastDraftConfig).toMatchObject({
      model: "gemini-3.5-flash",
      effort: "High",
      presentationMode: "gui",
    });
    expect(dbGetState("schema_version")).toBe(String(LATEST_SCHEMA_VERSION));
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

  it("round-trips the project GitHub account through the projects table", () => {
    dbUpsertProject(
      {
        id: "project-1",
        name: "Test project",
        location: { kind: "posix", path: "/tmp/project" },
        ghAccount: { host: "github.com", login: "octocat" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );

    expect(dbGetProject("project-1")?.ghAccount).toEqual({
      host: "github.com",
      login: "octocat",
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

  it("round-trips the project icon through the projects table", () => {
    const project = {
      id: "project-1",
      name: "Test project",
      location: { kind: "posix" as const, path: "/tmp/project" },
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    // Projects created before icons existed keep the default glyph.
    expect(dbGetProject("project-1")?.icon).toBeUndefined();

    dbUpsertProject({ ...project, icon: "lucide:rocket" }, 0);
    expect(dbGetProject("project-1")?.icon).toBe("lucide:rocket");

    dbUpsertProject({ ...project, icon: "auto" }, 0);
    expect(dbGetProject("project-1")?.icon).toBe("auto");

    // Clearing the icon removes the field rather than leaving the old value.
    dbUpsertProject(project, 0);
    expect(dbGetProject("project-1")?.icon).toBeUndefined();
  });

  it("migrates a schema-v32 project before persisting its GitHub account", () => {
    closeDatabase();
    const databasePath = join(dir, "schema-v32.sqlite");
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
        worktree_location TEXT,
        mcp_servers TEXT,
        workspace_id TEXT,
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
      INSERT INTO app_state (key, value) VALUES ('schema_version', '32');
    `);
    legacy.close();

    initDatabase(databasePath);

    expect(dbGetState("schema_version")).toBe(String(LATEST_SCHEMA_VERSION));
    const legacyProject = dbGetProject("legacy-project");
    expect(legacyProject).toMatchObject({
      id: "legacy-project",
      name: "Legacy project",
      location: { kind: "posix", path: "/tmp/legacy-project" },
    });
    expect(legacyProject?.ghAccount).toBeUndefined();

    dbUpsertProject({ ...legacyProject!, ghAccount: { host: "github.com", login: "octocat" } }, 0);
    expect(dbGetProject("legacy-project")?.ghAccount).toEqual({
      host: "github.com",
      login: "octocat",
    });
    dbUpsertProject(legacyProject!, 0);
    expect(dbGetProject("legacy-project")?.ghAccount).toBeUndefined();
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

  it("repairs and backfills archived_at when schema v35 is missing the column", () => {
    closeDatabase();
    const databasePath = join(dir, "corrupt-v35.sqlite");
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
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        agent_kind TEXT NOT NULL,
        agent_instance_id TEXT,
        config TEXT NOT NULL,
        status TEXT NOT NULL,
        attention TEXT NOT NULL,
        thread_status_source TEXT,
        can_resume_with_config INTEGER NOT NULL DEFAULT 0,
        session_ref TEXT,
        terminal_prompt TEXT,
        worktree_path TEXT,
        worktree_branch TEXT,
        pr_number INTEGER,
        group_id TEXT,
        group_name TEXT,
        parent_thread_id TEXT,
        archived INTEGER NOT NULL DEFAULT 0,
        done INTEGER NOT NULL DEFAULT 0,
        done_at TEXT,
        starred INTEGER NOT NULL DEFAULT 0,
        presentation_mode TEXT NOT NULL DEFAULT 'terminal',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        active_turn_started_at TEXT,
        last_turn_started_at TEXT,
        last_turn_ended_at TEXT
      );
      CREATE TABLE app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO projects (
        id, name, location_kind, location_path, sort_order, created_at
      ) VALUES (
        'legacy-project', 'Legacy project', 'posix', '/tmp/legacy-project', 0,
        '2026-01-01T00:00:00.000Z'
      );
      INSERT INTO threads (
        id, project_id, title, agent_kind, config, status, attention,
        can_resume_with_config, archived, done, starred, presentation_mode,
        sort_order, created_at, updated_at
      ) VALUES (
        'legacy-archived', 'legacy-project', 'Legacy archived', 'claude',
        '{"model":"sonnet"}', 'inactive', 'none', 0, 1, 0, 0, 'gui', 0,
        '2026-01-01T00:00:00.000Z', '2026-02-03T04:05:06.000Z'
      );
      INSERT INTO app_state (key, value) VALUES ('schema_version', '35');
    `);
    corrupt.close();

    initDatabase(databasePath);

    expect(dbGetThread("legacy-archived")?.archivedAt).toBe("2026-02-03T04:05:06.000Z");
    expect(dbGetState("schema_version")).toBe(String(LATEST_SCHEMA_VERSION));
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

    dbSyncAll(
      [
        {
          ...project,
          workspaceId: "ws-work",
          ghAccount: { host: "github.com", login: "octocat" },
        },
      ],
      [],
      viewJson,
    );
    expect(dbGetProject(project.id)?.workspaceId).toBe("ws-work");
    expect(dbGetProject(project.id)?.ghAccount).toEqual({
      host: "github.com",
      login: "octocat",
    });

    dbSyncAll([{ ...project, workspaceId: "ws-side" }], [], viewJson);
    expect(dbGetProject(project.id)?.workspaceId).toBe("ws-side");
    expect(dbGetProject(project.id)?.ghAccount).toBeUndefined();

    dbSyncAll([project], [], viewJson);
    expect(dbGetProject(project.id)?.workspaceId).toBeUndefined();
  });

  it("round-trips the project icon through the bulk renderer sync", () => {
    const project = {
      id: "project-bulk-icon",
      name: "Bulk icon project",
      location: { kind: "posix" as const, path: "/tmp/project-bulk-icon" },
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const viewJson = JSON.stringify({ kind: "home" });

    dbSyncAll([{ ...project, icon: "lucide:rocket" }], [], viewJson);
    expect(dbGetProject(project.id)?.icon).toBe("lucide:rocket");

    dbSyncAll([{ ...project, icon: "auto" }], [], viewJson);
    expect(dbGetProject(project.id)?.icon).toBe("auto");

    dbSyncAll([project], [], viewJson);
    expect(dbGetProject(project.id)?.icon).toBeUndefined();
  });

  it("upgrades a schema-v32 database to carry the projects.icon column", () => {
    closeDatabase();
    const databasePath = join(dir, "upgrade-v32.sqlite");
    const legacy = nativeBindingEnv
      ? new Database(databasePath, { nativeBinding: nativeBindingEnv })
      : new Database(databasePath);
    // The exact v32 shape: every projects column except the v33 `icon`.
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
        worktree_location TEXT,
        mcp_servers TEXT,
        workspace_id TEXT,
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
        'v32-project', 'Pre-icon project', 'posix', '/tmp/v32-project', 0, 0,
        '2026-01-01T00:00:00.000Z'
      );
      INSERT INTO app_state (key, value) VALUES ('schema_version', '32');
    `);
    legacy.close();

    initDatabase(databasePath);

    const columns = getSqlite().prepare("PRAGMA table_info(projects)").all() as {
      name: string;
    }[];
    expect(columns.some((column) => column.name === "icon")).toBe(true);
    expect(dbGetState("schema_version")).toBe(String(LATEST_SCHEMA_VERSION));
    expect(dbGetProject("v32-project")).toMatchObject({
      id: "v32-project",
      name: "Pre-icon project",
      location: { kind: "posix", path: "/tmp/v32-project" },
    });
    expect(dbGetProject("v32-project")?.icon).toBeUndefined();
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
