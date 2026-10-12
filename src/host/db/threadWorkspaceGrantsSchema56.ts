import type Database from "better-sqlite3";
import { assertThreadWorkspaceGrantsSchema as assertSchema55 } from "./threadWorkspaceGrantsSchema55";

// These predicates match the owner fingerprint, including nullable values. Revision
// is also in that fingerprint, so an empty-scope A -> B -> A never restores authority.
const threadOwnerChanged = `NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id
  OR NEW.created_at IS NOT OLD.created_at OR NEW.worktree_path IS NOT OLD.worktree_path
  OR NEW.agent_kind IS NOT OLD.agent_kind OR NEW.agent_instance_id IS NOT OLD.agent_instance_id
  OR NEW.presentation_mode IS NOT OLD.presentation_mode
  OR json_extract(NEW.config, '$.executionEnvironment') IS NOT json_extract(OLD.config, '$.executionEnvironment')`;
const projectOwnerChanged = `NEW.id IS NOT OLD.id OR NEW.created_at IS NOT OLD.created_at
  OR NEW.location_kind IS NOT OLD.location_kind OR NEW.location_path IS NOT OLD.location_path
  OR NEW.location_distro IS NOT OLD.location_distro OR NEW.location_linux_path IS NOT OLD.location_linux_path
  OR NEW.location_unc_path IS NOT OLD.location_unc_path`;
const validRevision = (row: string) =>
  `typeof(${row}.workspace_grant_revision) = 'integer' AND ${row}.workspace_grant_revision BETWEEN 0 AND 9007199254740991`;

const triggers = {
  workspace_grant_owner_insert: `AFTER INSERT ON threads BEGIN
    UPDATE threads SET workspace_owner_incarnation = lower(hex(randomblob(16))) WHERE id = NEW.id;
  END`,
  workspace_grant_owner_immutable: `BEFORE UPDATE OF workspace_owner_incarnation ON threads
    WHEN OLD.workspace_owner_incarnation != '' AND NEW.workspace_owner_incarnation IS NOT OLD.workspace_owner_incarnation
    BEGIN SELECT RAISE(ABORT, 'Workspace owner incarnation is immutable'); END`,
  workspace_grant_metadata_insert: `BEFORE INSERT ON threads
    WHEN NEW.workspace_owner_incarnation != '' OR NEW.workspace_grants_initialized != 0
      OR NEW.workspace_grant_revision != 0 OR NEW.additional_directories != '[]'
    BEGIN SELECT RAISE(ABORT, 'Workspace grant metadata must be host minted'); END`,
  workspace_grant_metadata_update: `BEFORE UPDATE OF workspace_grant_revision, workspace_grants_initialized ON threads
    WHEN NOT (${validRevision("NEW")}) OR NEW.workspace_grant_revision < OLD.workspace_grant_revision
      OR typeof(NEW.workspace_grants_initialized) != 'integer' OR NEW.workspace_grants_initialized NOT IN (0, 1)
      OR NEW.workspace_grants_initialized < OLD.workspace_grants_initialized
      OR (NEW.workspace_grants_initialized = 1 AND NEW.workspace_grant_revision = 0)
    BEGIN SELECT RAISE(ABORT, 'Invalid workspace grant metadata'); END`,
  workspace_grant_thread_owner_advance: `AFTER UPDATE ON threads WHEN ${threadOwnerChanged}
    BEGIN
      SELECT CASE WHEN NOT (${validRevision("OLD")}) OR OLD.workspace_grant_revision >= 9007199254740991
        THEN RAISE(ABORT, 'Workspace grant revision exhausted or invalid') END;
      UPDATE threads SET workspace_grant_revision = OLD.workspace_grant_revision + 1 WHERE id = NEW.id;
    END`,
  workspace_grant_project_owner_advance: `AFTER UPDATE ON projects WHEN ${projectOwnerChanged}
    BEGIN
      SELECT CASE WHEN EXISTS (SELECT 1 FROM threads t WHERE t.project_id IN (OLD.id, NEW.id)
        AND (NOT (${validRevision("t")}) OR t.workspace_grant_revision >= 9007199254740991))
        THEN RAISE(ABORT, 'Workspace grant revision exhausted or invalid') END;
      UPDATE threads SET workspace_grant_revision = workspace_grant_revision + 1 WHERE project_id IN (OLD.id, NEW.id);
    END`,
} as const;

const triggerSql = (name: string, body: string) => `CREATE TRIGGER ${name} ${body}`;
const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim().replace(/;$/, "");

// Frozen schema55 owns these definitions; only the current boundary closes the
// inventory. Do not teach the historical creator about future trigger sets.
const schema55TriggerNames = [
  "workspace_grant_journal_bound",
  "workspace_grant_thread_delete",
  "workspace_grant_thread_retarget",
  "workspace_grant_project_delete",
  "workspace_grant_project_retarget",
] as const;

function assertPersistentTriggerInventory(
  sqlite: InstanceType<typeof Database>,
  version: 55 | 56,
): void {
  const expected = new Set<string>(schema55TriggerNames);
  if (version === 56) for (const name of Object.keys(triggers)) expected.add(name);
  // TEMP triggers belong to this connection (including deliberate rollback fault
  // injection), not to the persisted custody artifact validated at startup.
  const installed = sqlite
    .prepare(`SELECT name FROM main.sqlite_master WHERE type = 'trigger'
      AND tbl_name COLLATE NOCASE IN ('threads', 'projects', 'thread_workspace_grant_operations')`)
    .all() as { name: string }[];
  for (const { name } of installed) {
    if (!expected.has(name)) {
      throw new Error(`Database workspace grant custody schema has unexpected trigger: ${name}`);
    }
  }
}

/** Read-only admission before any safe repair or migration56 write. */
export function assertThreadWorkspaceGrantsPreflight(
  sqlite: InstanceType<typeof Database>,
): 55 | 56 | undefined {
  const columns = (sqlite.prepare("PRAGMA table_info(threads)").all() as { name: string }[]).map(
    ({ name }) => name.toLowerCase(),
  );
  const objects = (
    sqlite.prepare("SELECT name FROM main.sqlite_master").all() as { name: string }[]
  ).map(({ name }) => name.toLowerCase());
  const stored = objects.includes("app_state")
    ? (sqlite.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get() as
        | { value: string }
        | undefined)
    : undefined;
  const version = Number(stored?.value ?? 0);
  const current =
    version >= 56 ||
    columns.includes("workspace_owner_incarnation") ||
    columns.includes("workspace_grants_initialized") ||
    objects.some((name) => Object.hasOwn(triggers, name));
  if (current) {
    assertThreadWorkspaceGrantsSchema56(sqlite);
    return 56;
  }
  const legacy =
    version >= 55 ||
    columns.includes("additional_directories") ||
    columns.includes("workspace_grant_revision") ||
    objects.some(
      (name) => name === "thread_workspace_grant_operations" || name.startsWith("workspace_grant_"),
    );
  if (legacy) {
    assertSchema55(sqlite);
    assertPersistentTriggerInventory(sqlite, 55);
    return 55;
  }
  // Only a database with neither custody artifacts nor a custody version claim
  // can receive legacy safe defaults without workspace validation.
  return undefined;
}

/** Forward-only: no rewriting of schema55's journal, owner bytes, or cleanup evidence. */
export function createThreadWorkspaceGrantsSchema56(sqlite: InstanceType<typeof Database>): void {
  const boundary = assertThreadWorkspaceGrantsPreflight(sqlite);
  // A complete installed boundary may be revisited by registry repair. Never
  // remint identity or infer initialization again, including owner-only revisions.
  if (boundary === 56) return;
  // Direct creator callers must provide schema55 even when no custody exists.
  if (boundary === undefined) assertSchema55(sqlite);
  const invalid = sqlite
    .prepare(`SELECT id FROM threads t WHERE NOT (${validRevision("t")}) LIMIT 1`)
    .get();
  if (invalid) throw new Error("Invalid workspace grant revision before migration56");
  sqlite.exec(`ALTER TABLE threads ADD COLUMN workspace_owner_incarnation TEXT NOT NULL DEFAULT '';
    ALTER TABLE threads ADD COLUMN workspace_grants_initialized INTEGER NOT NULL DEFAULT 0;
    UPDATE threads SET workspace_owner_incarnation = lower(hex(randomblob(16))),
      workspace_grants_initialized = CASE WHEN workspace_grant_revision > 0 OR json_array_length(additional_directories) > 0 THEN 1 ELSE 0 END;`);
  for (const [name, body] of Object.entries(triggers)) sqlite.exec(triggerSql(name, body));
}

/** Startup validation deliberately excludes these columns and triggers from safe repair. */
export function assertThreadWorkspaceGrantsSchema56(sqlite: InstanceType<typeof Database>): void {
  assertSchema55(sqlite);
  const columns = sqlite.prepare("PRAGMA table_info(threads)").all() as {
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
  }[];
  for (const [name, type, value] of [
    ["workspace_owner_incarnation", "TEXT", "''"],
    ["workspace_grants_initialized", "INTEGER", "0"],
  ]) {
    const column = columns.find((entry) => entry.name === name);
    if (!column || column.type !== type || column.notnull !== 1 || column.dflt_value !== value) {
      throw new Error(`Invalid workspace grant column: ${name}`);
    }
  }
  const select = sqlite.prepare("SELECT type, sql FROM sqlite_master WHERE name = ?");
  for (const [name, body] of Object.entries(triggers)) {
    const row = select.get(name) as { type: string; sql: string | null } | undefined;
    if (
      !row ||
      row.type !== "trigger" ||
      !row.sql ||
      normalize(row.sql) !== normalize(triggerSql(name, body))
    ) {
      throw new Error(`Database workspace grant custody schema is incomplete or invalid: ${name}`);
    }
  }
  assertPersistentTriggerInventory(sqlite, 56);
}
