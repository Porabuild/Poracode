import type Database from "better-sqlite3";
import { MAX_WORKSPACE_DIRECTORY_SERIALIZED_CHARS } from "@/shared/workspaceDirectorySelection";

/** No automatic eviction: bounded history must never make an old token executable again. */
export const MAX_THREAD_WORKSPACE_GRANT_OPERATIONS = 32;
export const MAX_WORKSPACE_GRANT_TOKEN_CHARS = 128;
export const MAX_WORKSPACE_GRANT_OWNER_CHARS = 32_768;

const unresolved = "state IN ('pending', 'dispatched', 'ambiguous')";
const protectedThread = `(OLD.additional_directories != '[]' OR EXISTS (
  SELECT 1 FROM thread_workspace_grant_operations WHERE thread_id = OLD.id AND ${unresolved}
))`;
const projectHasCustody = `EXISTS (SELECT 1 FROM threads t WHERE t.project_id = OLD.id AND (
  t.additional_directories != '[]' OR EXISTS (SELECT 1 FROM thread_workspace_grant_operations o
    WHERE o.thread_id = t.id AND ${unresolved})))`;

const entries = [
  {
    name: "thread_workspace_grant_operations",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS thread_workspace_grant_operations (
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
      operation_token TEXT NOT NULL CHECK(length(operation_token) BETWEEN 1 AND ${MAX_WORKSPACE_GRANT_TOKEN_CHARS} AND instr(operation_token, char(0)) = 0),
      expected_revision INTEGER NOT NULL CHECK(typeof(expected_revision) = 'integer' AND expected_revision BETWEEN 0 AND 9007199254740990),
      owner_json TEXT NOT NULL CHECK(length(owner_json) BETWEEN 1 AND ${MAX_WORKSPACE_GRANT_OWNER_CHARS} AND json_valid(owner_json)),
      candidate_json TEXT NOT NULL CHECK(length(candidate_json) <= ${MAX_WORKSPACE_DIRECTORY_SERIALIZED_CHARS} AND json_valid(candidate_json) AND json_type(candidate_json) = 'array'),
      state TEXT NOT NULL CHECK(state IN ('pending', 'dispatched', 'committed', 'ambiguous', 'failed')),
      PRIMARY KEY(thread_id, operation_token)
    ) WITHOUT ROWID;`,
  },
  {
    name: "workspace_grant_one_unresolved",
    type: "index",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS workspace_grant_one_unresolved
      ON thread_workspace_grant_operations(thread_id) WHERE ${unresolved};`,
  },
  {
    name: "workspace_grant_journal_bound",
    type: "trigger",
    sql: `CREATE TRIGGER IF NOT EXISTS workspace_grant_journal_bound
      BEFORE INSERT ON thread_workspace_grant_operations
      WHEN (SELECT count(*) FROM thread_workspace_grant_operations WHERE thread_id = NEW.thread_id) >= ${MAX_THREAD_WORKSPACE_GRANT_OPERATIONS}
      BEGIN SELECT RAISE(ABORT, 'Workspace grant journal is full'); END;`,
  },
  {
    name: "workspace_grant_thread_delete",
    type: "trigger",
    sql: `CREATE TRIGGER IF NOT EXISTS workspace_grant_thread_delete BEFORE DELETE ON threads
      WHEN ${protectedThread}
      BEGIN SELECT RAISE(ABORT, 'Workspace grant custody prevents thread deletion'); END;`,
  },
  {
    name: "workspace_grant_thread_retarget",
    type: "trigger",
    sql: `CREATE TRIGGER IF NOT EXISTS workspace_grant_thread_retarget BEFORE UPDATE ON threads
      WHEN ${protectedThread} AND (
        NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.created_at IS NOT OLD.created_at
        OR NEW.worktree_path IS NOT OLD.worktree_path OR NEW.agent_kind IS NOT OLD.agent_kind
        OR NEW.agent_instance_id IS NOT OLD.agent_instance_id OR NEW.presentation_mode IS NOT OLD.presentation_mode
        OR json_extract(NEW.config, '$.executionEnvironment') IS NOT json_extract(OLD.config, '$.executionEnvironment'))
      BEGIN SELECT RAISE(ABORT, 'Workspace grant custody prevents thread retarget'); END;`,
  },
  {
    name: "workspace_grant_project_delete",
    type: "trigger",
    sql: `CREATE TRIGGER IF NOT EXISTS workspace_grant_project_delete BEFORE DELETE ON projects
      WHEN ${projectHasCustody}
      BEGIN SELECT RAISE(ABORT, 'Workspace grant custody prevents project deletion'); END;`,
  },
  {
    name: "workspace_grant_project_retarget",
    type: "trigger",
    sql: `CREATE TRIGGER IF NOT EXISTS workspace_grant_project_retarget BEFORE UPDATE ON projects
      WHEN ${projectHasCustody} AND (
        NEW.id IS NOT OLD.id OR NEW.created_at IS NOT OLD.created_at OR NEW.location_kind IS NOT OLD.location_kind
        OR NEW.location_path IS NOT OLD.location_path OR NEW.location_distro IS NOT OLD.location_distro
        OR NEW.location_linux_path IS NOT OLD.location_linux_path OR NEW.location_unc_path IS NOT OLD.location_unc_path)
      BEGIN SELECT RAISE(ABORT, 'Workspace grant custody prevents project retarget'); END;`,
  },
] as const;

/** Called by migration 55 and fresh bootstrap through the migration registry. */
export function createThreadWorkspaceGrantsSchema(sqlite: InstanceType<typeof Database>): void {
  const columns = sqlite.prepare("PRAGMA table_info(threads)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "additional_directories")) {
    sqlite.exec("ALTER TABLE threads ADD COLUMN additional_directories TEXT NOT NULL DEFAULT '[]'");
  }
  if (!columns.some((column) => column.name === "workspace_grant_revision")) {
    sqlite.exec(
      "ALTER TABLE threads ADD COLUMN workspace_grant_revision INTEGER NOT NULL DEFAULT 0",
    );
  }
  for (const entry of entries) sqlite.exec(entry.sql);
}

const normalize = (sql: string) =>
  sql
    .replace(/\bIF NOT EXISTS\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/;$/, "");

/** Missing custody is not safe additive drift: never replace it with empty authorization. */
export function assertThreadWorkspaceGrantsSchema(sqlite: InstanceType<typeof Database>): void {
  const select = sqlite.prepare("SELECT type, sql FROM sqlite_master WHERE name = ?");
  for (const entry of entries) {
    const row = select.get(entry.name) as { type: string; sql: string | null } | undefined;
    if (
      !row ||
      row.type !== entry.type ||
      !row.sql ||
      normalize(row.sql) !== normalize(entry.sql)
    ) {
      throw new Error(
        `Database workspace grant custody schema is incomplete or invalid: ${entry.name}`,
      );
    }
  }
  const columns = sqlite.prepare("PRAGMA table_info(threads)").all() as {
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
  }[];
  for (const [name, type, value] of [
    ["additional_directories", "TEXT", "'[]'"],
    ["workspace_grant_revision", "INTEGER", "0"],
  ]) {
    const column = columns.find((entry) => entry.name === name);
    if (!column || column.type !== type || column.notnull !== 1 || column.dflt_value !== value) {
      throw new Error(`Invalid workspace grant column: ${name}`);
    }
  }
}
