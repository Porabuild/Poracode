import type { ScheduledTaskConfig } from "@/shared/contracts";
import { areSelectionBindingsEqual } from "@/shared/contracts";
import type { SelectionBinding } from "@/shared/selectionBinding.schemas";
import { msg } from "@/shared/messages";
import { hasUnsupportedSelectionBinding } from "@/shared/persistedSelectionBinding";
import { getSqlite } from "./connection";

/**
 * Fresh, synchronous execution admission for PR-watch fix launches.
 *
 * A watch read through the projected store API can be seconds old by the time
 * its fix thread actually launches, and the projected read strips unsupported
 * selection metadata, so projected equality is not a fresh raw check. This
 * reads the authoritative `pr_watches` row by key and refuses a launch when
 * the row is gone, when its raw config carries unsupported selection data, or
 * when any execution-defining field changed since capture: the branch,
 * worktree path, automation mode flags, the full opaque `agent_kind` (profile
 * kinds are one string, never decomposed), and the own-presence-sensitive
 * `model`/`effort`/`fast`/`thinking`/`contextSize`/`selectionBinding`
 * carriers. Presence is exact — `""`/`false` values are real values, and a
 * carrier or a recognized binding present on only one side is a change.
 *
 * Missing or changed rows cancel into the caller's recheck flow (the
 * {@link PrWatchExecutionAdmissionError} reason names which); unsupported raw
 * selection data throws the existing localized unsupportedStoredData refusal.
 * No instance id is inferred from a binding record, and the binding's owner
 * never substitutes for the row's actual `agent_kind`.
 */

export type PrWatchExecutionRefusalReason = "missing" | "stale" | "unsupported";

export class PrWatchExecutionAdmissionError extends Error {
  readonly reason: PrWatchExecutionRefusalReason;

  constructor(reason: PrWatchExecutionRefusalReason, message: string) {
    super(message);
    this.name = "PrWatchExecutionAdmissionError";
    this.reason = reason;
  }
}

/** The execution-defining identity of one watch row, read raw. */
export interface PrWatchExecutionSnapshot {
  projectId: string;
  prNumber: number;
  headBranch: string;
  worktreePath?: string;
  watchEnabled: boolean;
  autoMerge: boolean;
  /** Full opaque kind as stored — profile kinds are one string. */
  agentKind?: string;
  /**
   * The raw (unprojected) stored config controls. Only admission compares
   * this value; it is never written back or exposed as write authority.
   */
  config?: ScheduledTaskConfig;
}

/** The only columns admission compares; the row is read fresh and read-only. */
interface PrWatchExecutionRow {
  head_branch: string;
  worktree_path: string | null;
  watch_enabled: number;
  auto_merge: number;
  agent_kind: string | null;
  config: string | null;
}

const EXECUTION_SELECT =
  "SELECT head_branch, worktree_path, watch_enabled, auto_merge, agent_kind, config " +
  "FROM pr_watches WHERE project_id = ? AND pr_number = ?";

/**
 * Read the current raw execution identity of one watch, or null when the row
 * is gone. Throws {@link PrWatchExecutionAdmissionError} with reason
 * "unsupported" when the raw config carries unsupported selection data, so a
 * launch identity can never be captured from it.
 */
export function dbReadPrWatchExecutionSnapshot(
  projectId: string,
  prNumber: number,
): PrWatchExecutionSnapshot | null {
  const row = getSqlite().prepare(EXECUTION_SELECT).get(projectId, prNumber) as
    | PrWatchExecutionRow
    | undefined;
  if (!row) return null;
  return snapshotOf(projectId, prNumber, row, probeRawConfig(row.config));
}

/**
 * Admit one captured execution snapshot against the authoritative row, or
 * throw {@link PrWatchExecutionAdmissionError}. Synchronous by contract —
 * callers must be able to gate a launch with no interleaving. The final
 * authority for writes remains the guarded full-save recheck.
 */
export function dbAdmitPrWatchExecution(
  projectId: string,
  prNumber: number,
  captured: PrWatchExecutionSnapshot,
): void {
  const row = getSqlite().prepare(EXECUTION_SELECT).get(projectId, prNumber) as
    | PrWatchExecutionRow
    | undefined;
  if (!row) {
    throw new PrWatchExecutionAdmissionError(
      "missing",
      "The PR watch row was removed before its fix could launch.",
    );
  }
  const rawConfig = probeRawConfig(row.config);
  if (executionFieldsChanged(captured, row, rawConfig)) {
    throw new PrWatchExecutionAdmissionError(
      "stale",
      "The PR watch changed before its fix could launch.",
    );
  }
}

/**
 * Parse one stored config and refuse unsupported raw selection data with the
 * existing localized message. Malformed JSON surfaces its own SyntaxError —
 * read projection remains the parent lane's scope.
 */
function probeRawConfig(json: string | null): unknown {
  if (json == null) return undefined;
  const raw: unknown = JSON.parse(json);
  if (hasUnsupportedSelectionBinding(raw)) {
    throw new PrWatchExecutionAdmissionError(
      "unsupported",
      msg("modelSelection.unsupportedStoredData"),
    );
  }
  return raw;
}

function snapshotOf(
  projectId: string,
  prNumber: number,
  row: PrWatchExecutionRow,
  rawConfig: unknown,
): PrWatchExecutionSnapshot {
  return {
    projectId,
    prNumber,
    headBranch: row.head_branch,
    ...(row.worktree_path ? { worktreePath: row.worktree_path } : {}),
    watchEnabled: row.watch_enabled === 1,
    autoMerge: row.auto_merge === 1,
    ...(row.agent_kind ? { agentKind: row.agent_kind } : {}),
    ...(rawConfig !== undefined ? { config: rawConfig as ScheduledTaskConfig } : {}),
  };
}

function executionFieldsChanged(
  captured: PrWatchExecutionSnapshot,
  row: PrWatchExecutionRow,
  rawConfig: unknown,
): boolean {
  if (row.head_branch !== captured.headBranch) return true;
  if ((row.worktree_path ?? undefined) !== captured.worktreePath) return true;
  if ((row.watch_enabled === 1) !== captured.watchEnabled) return true;
  if ((row.auto_merge === 1) !== captured.autoMerge) return true;
  if ((row.agent_kind ?? undefined) !== captured.agentKind) return true;

  const raw = isJsonObject(rawConfig) ? rawConfig : undefined;
  const held = isJsonObject(captured.config) ? captured.config : undefined;
  if (!raw || !held) return (raw === undefined) !== (held === undefined);

  for (const key of ["model", "effort", "fast", "thinking", "contextSize"] as const) {
    if (ownDefined(raw, key) !== ownDefined(held, key)) return true;
    if (ownDefined(raw, key) && raw[key] !== held[key]) return true;
  }
  // Both sides are JSON-shaped here: the raw config was parsed from its
  // stored bytes, and an unsupported binding was already refused above, so a
  // present binding is a recognized record on both sides.
  return !areSelectionBindingsEqual(bindingOf(raw), bindingOf(held));
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Own, enumerable, defined — the only presence serialized JSON can carry. */
function ownDefined(record: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(record, key) && record[key] !== undefined;
}

function bindingOf(record: Record<string, unknown>): SelectionBinding | undefined {
  return ownDefined(record, "selectionBinding")
    ? (record.selectionBinding as SelectionBinding)
    : undefined;
}
