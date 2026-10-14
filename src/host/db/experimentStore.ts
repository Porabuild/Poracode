import { createHash } from "node:crypto";
import {
  EXPERIMENT_STORE_KEY,
  EXPERIMENT_STORE_VERSION,
  MAX_EXPERIMENT_STATE_BYTES,
  experimentSchema,
  type Experiment,
} from "@/shared/contracts";
import { getSqlite } from "./connection";

/**
 * Raw experiment-store primitives for the experiment authority intents.
 *
 * The store is the renderer's Zustand document at
 * `app_state[EXPERIMENT_STORE_KEY]` (`{state:{experiments},version}`). Every
 * writer here reads it RAW exactly once, splices only the target key's JSON
 * value, and leaves every untouched record's JSON value intact — unknown
 * future fields survive as values (never a claim about literal bytes).
 *
 * The revision token is derived, never persisted: `xh1:sha256(raw value)`,
 * with the absent store hashing the empty string. It is STORE-wide by
 * construction; there is no new key, no migration, and
 * `EXPERIMENT_STORE_VERSION` stays 1.
 */

export interface ExperimentStoreSnapshot {
  readonly rawValue: string | null;
  readonly records: Map<string, unknown>;
  readonly revision: string;
}

/** Raw threads row columns the experiment intents and preflight read. */
export interface ExperimentThreadRow {
  id: string;
  project_id: string;
  title: string;
  agent_kind: string;
  agent_instance_id: string | null;
  config: string;
  status: string;
  attention: string;
  thread_status_source: string | null;
  can_resume_with_config: number;
  session_ref: string | null;
  worktree_path: string | null;
  worktree_branch: string | null;
  group_id: string | null;
  group_name: string | null;
  parent_thread_id: string | null;
  presentation_mode: string | null;
  done: number;
}

export type DbExperimentStateReadOutcome =
  | {
      readonly status: "ok";
      readonly revision: string;
      readonly experiments: readonly Experiment[];
    }
  | { readonly status: "unavailable" }
  | { readonly status: "too_large" };

const THREAD_ROW_COLUMNS = `id, project_id, title, agent_kind, agent_instance_id, config, status,
  attention, thread_status_source, can_resume_with_config, session_ref, worktree_path,
  worktree_branch, group_id, group_name, parent_thread_id, presentation_mode, done`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sqlite(): ReturnType<typeof getSqlite> {
  return getSqlite();
}

/** Derived store-wide revision; the absent store hashes the empty string. */
export function experimentStoreRevision(rawValue: string | null): string {
  return `xh1:${createHash("sha256")
    .update(rawValue ?? "")
    .digest("hex")}`;
}

/**
 * Read the raw stored value without parsing it. `unavailable` separates a DB
 * failure from an absent store, so the byte-capped read can refuse an oversized
 * value BEFORE any `JSON.parse`.
 */
export function readExperimentStoreRawValue():
  | { readonly status: "ok"; readonly rawValue: string | null }
  | { readonly status: "unavailable" } {
  try {
    const row = sqlite()
      .prepare("SELECT value FROM app_state WHERE key = ?")
      .get(EXPERIMENT_STORE_KEY) as { value: string } | undefined;
    return { status: "ok", rawValue: row?.value ?? null };
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * Parse a raw store value that was read once. Returns null when the store
 * exists but is unreadable (malformed JSON, unknown document version, missing
 * envelope) so every caller fails closed rather than overwriting a document it
 * cannot read.
 */
function parseExperimentStoreSnapshot(rawValue: string | null): ExperimentStoreSnapshot | null {
  if (rawValue === null) {
    return { rawValue: null, records: new Map(), revision: experimentStoreRevision(null) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== EXPERIMENT_STORE_VERSION) return null;
  const state = parsed.state;
  if (!isRecord(state) || !isRecord(state.experiments)) return null;
  const records = new Map<string, unknown>();
  for (const [id, value] of Object.entries(state.experiments)) records.set(id, value);
  return { rawValue, records, revision: experimentStoreRevision(rawValue) };
}

/** Read + parse the whole store once (used by the intents and CAS checks). */
export function readExperimentStoreSnapshot(): ExperimentStoreSnapshot | null {
  const read = readExperimentStoreRawValue();
  if (read.status !== "ok") return null;
  return parseExperimentStoreSnapshot(read.rawValue);
}

/** Serialize the exact document the shared write primitive persists. */
export function serializeExperimentStoreRecords(records: ReadonlyMap<string, unknown>): string {
  return JSON.stringify({
    state: { experiments: Object.fromEntries(records) },
    version: EXPERIMENT_STORE_VERSION,
  });
}

/**
 * Enforced write budget: a serialized value at or below `MAX_EXPERIMENT_STATE_BYTES`
 * is always writable; an over-budget value is writable only while it strictly
 * shrinks an already over-budget store (the removal/shrink recovery path). A
 * write that would keep or grow over-budget data is refused, never truncated
 * and never republished with survivor values dropped.
 */
export function experimentStoreWriteTooLarge(
  serialized: string,
  previousRawValue: string | null,
): boolean {
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes <= MAX_EXPERIMENT_STATE_BYTES) return false;
  return bytes >= Buffer.byteLength(previousRawValue ?? "", "utf8");
}

export type ExperimentStoreWriteOutcome =
  | { readonly status: "written"; readonly revision: string }
  | { readonly status: "too_large" };

/** Serialize + persist the spliced document; the only experiment-store writer. */
export function writeExperimentStoreRecords(
  records: ReadonlyMap<string, unknown>,
): ExperimentStoreWriteOutcome {
  const serialized = serializeExperimentStoreRecords(records);
  const read = readExperimentStoreRawValue();
  if (experimentStoreWriteTooLarge(serialized, read.status === "ok" ? read.rawValue : null)) {
    return { status: "too_large" };
  }
  sqlite()
    .prepare(
      `INSERT INTO app_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(EXPERIMENT_STORE_KEY, serialized);
  return { status: "written", revision: experimentStoreRevision(serialized) };
}

export function parseStoredExperimentRecord(value: unknown): Experiment | null {
  if (value === undefined) return null;
  const parsed = experimentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function dbProjectExists(projectId: string): boolean {
  return sqlite().prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId) !== undefined;
}

export function readExperimentThreadRow(threadId: string): ExperimentThreadRow | undefined {
  return sqlite()
    .prepare(`SELECT ${THREAD_ROW_COLUMNS} FROM threads WHERE id = ?`)
    .get(threadId) as ExperimentThreadRow | undefined;
}

/** Any candidate row still linked to this experiment id via its group id. */
export function dbExperimentGroupHasRows(experimentId: string): boolean {
  return (
    sqlite().prepare("SELECT 1 FROM threads WHERE group_id = ? LIMIT 1").get(experimentId) !==
    undefined
  );
}

/**
 * Canonical read of the whole store (fail closed per record). The raw byte
 * length is checked BEFORE `JSON.parse`, so an over-budget value cannot drive
 * parse work or memory on the served read path.
 */
export function dbReadExperimentState(): DbExperimentStateReadOutcome {
  const read = readExperimentStoreRawValue();
  if (read.status !== "ok") return { status: "unavailable" };
  if (Buffer.byteLength(read.rawValue ?? "", "utf8") > MAX_EXPERIMENT_STATE_BYTES) {
    return { status: "too_large" };
  }
  const store = parseExperimentStoreSnapshot(read.rawValue);
  if (!store) return { status: "unavailable" };
  const experiments: Experiment[] = [];
  for (const [id, value] of store.records) {
    const record = parseStoredExperimentRecord(value);
    if (!record || record.id !== id) return { status: "unavailable" };
    experiments.push(record);
  }
  return { status: "ok", revision: store.revision, experiments };
}

/** Next head block start for `count` new rows, deterministic per project. */
export function nextExperimentHeadSortOrder(projectId: string, count: number): number {
  const min =
    (
      sqlite()
        .prepare("SELECT MIN(sort_order) AS value FROM threads WHERE project_id = ?")
        .get(projectId) as { value: number | null }
    ).value ?? 0;
  return min - count;
}
