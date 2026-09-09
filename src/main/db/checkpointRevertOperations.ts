import { getSqlite } from "./connection";

export type CheckpointRevertProviderPhase =
  | "pending"
  | "completed"
  | "failed"
  | "ambiguous"
  | "skipped_no_turns"
  | "skipped_missing_checkpoint";
export type CheckpointRevertFilesPhase =
  | "pending"
  | "completed"
  | "failed"
  | "skipped_no_location"
  | "skipped_missing_checkpoint";
export type CheckpointRevertTruncatePhase = "pending" | "completed" | "noop";
export type CheckpointRevertOutcome =
  | "running"
  | "completed"
  | "completed_local_only"
  | "ambiguous"
  | "failed";

export interface CheckpointRevertOperationRow {
  operationKey: string;
  threadId: string;
  checkpointItemId: string;
  numTurns: number;
  projectLocationJson: string | null;
  configJson: string | null;
  providerPhase: CheckpointRevertProviderPhase;
  filesPhase: CheckpointRevertFilesPhase;
  truncatePhase: CheckpointRevertTruncatePhase;
  removedAnchors: string[];
  outcome: CheckpointRevertOutcome;
  createdAt: number;
  updatedAt: number;
}

export type CheckpointRevertClaim =
  | { kind: "claimed"; row: CheckpointRevertOperationRow }
  | { kind: "resume"; row: CheckpointRevertOperationRow }
  | { kind: "replay"; row: CheckpointRevertOperationRow };

export interface ClaimCheckpointRevertOperationInput {
  operationKey: string;
  threadId: string;
  checkpointItemId: string;
  projectLocationJson: string | null;
  configJson: string | null;
}

const PROVIDER_PHASES: readonly CheckpointRevertProviderPhase[] = [
  "pending",
  "completed",
  "failed",
  "ambiguous",
  "skipped_no_turns",
  "skipped_missing_checkpoint",
];
const FILES_PHASES: readonly CheckpointRevertFilesPhase[] = [
  "pending",
  "completed",
  "failed",
  "skipped_no_location",
  "skipped_missing_checkpoint",
];
const TRUNCATE_PHASES: readonly CheckpointRevertTruncatePhase[] = ["pending", "completed", "noop"];
const OUTCOMES: readonly CheckpointRevertOutcome[] = [
  "running",
  "completed",
  "completed_local_only",
  "ambiguous",
  "failed",
];

function parseEnum<T extends string>(value: string, allowed: readonly T[]): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : allowed[0]!;
}

function rowToOperation(row: {
  operation_key: string;
  thread_id: string;
  checkpoint_item_id: string;
  num_turns: number;
  project_location_json: string | null;
  config_json: string | null;
  provider_phase: string;
  files_phase: string;
  truncate_phase: string;
  removed_anchors_json: string | null;
  outcome: string;
  created_at: number;
  updated_at: number;
}): CheckpointRevertOperationRow {
  let removedAnchors: string[] = [];
  try {
    const parsed: unknown =
      row.removed_anchors_json === null ? [] : JSON.parse(row.removed_anchors_json);
    removedAnchors = Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    removedAnchors = [];
  }
  return {
    operationKey: row.operation_key,
    threadId: row.thread_id,
    checkpointItemId: row.checkpoint_item_id,
    numTurns: row.num_turns,
    projectLocationJson: row.project_location_json,
    configJson: row.config_json,
    providerPhase: parseEnum(row.provider_phase, PROVIDER_PHASES),
    filesPhase: parseEnum(row.files_phase, FILES_PHASES),
    truncatePhase: parseEnum(row.truncate_phase, TRUNCATE_PHASES),
    removedAnchors,
    outcome: parseEnum(row.outcome, OUTCOMES),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface CheckpointPosition {
  position: number;
}

/**
 * Server-side equivalent of the renderer's rollback-turn count, computed from
 * durable state instead of a mounted transcript: completed-turn anchors after
 * the checkpoint when any completed turns exist, otherwise assistant messages
 * after it. The count is computed once, under the claim transaction's write
 * lock, and then frozen in the journal — a retry replays the stored number
 * instead of recounting a transcript the first attempt already mutated.
 */
export function dbCountRollbackTurnsAfterCheckpoint(
  threadId: string,
  checkpointItemId: string,
): number {
  const sqlite = getSqlite();
  const count = sqlite.transaction((): number => {
    const checkpoint = sqlite
      .prepare("SELECT position FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?")
      .get(threadId, checkpointItemId) as CheckpointPosition | undefined;
    if (!checkpoint) return 0;
    const completedTurnCount = sqlite
      .prepare("SELECT COUNT(*) AS n FROM thread_completed_turns WHERE thread_id = ?")
      .get(threadId) as { n: number };
    if (completedTurnCount.n > 0) {
      const anchored = sqlite
        .prepare(
          `SELECT COUNT(DISTINCT c.anchor_item_id) AS n
           FROM thread_completed_turns c
           JOIN thread_runtime_items i
             ON i.thread_id = c.thread_id AND i.item_id = c.anchor_item_id
           WHERE c.thread_id = ? AND i.position > ?`,
        )
        .get(threadId, checkpoint.position) as { n: number };
      return anchored.n;
    }
    const assistantMessages = sqlite
      .prepare(
        `SELECT COUNT(*) AS n FROM thread_runtime_items
         WHERE thread_id = ? AND position > ? AND type = 'assistant_message'`,
      )
      .get(threadId, checkpoint.position) as { n: number };
    return assistantMessages.n;
  });
  return count.immediate() as number;
}

export function dbHasThreadRuntimeItem(threadId: string, itemId: string): boolean {
  return (
    getSqlite()
      .prepare("SELECT position FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?")
      .get(threadId, itemId) !== undefined
  );
}

/**
 * Claims the compound revert for `operationKey` inside one immediate
 * transaction. A fresh claim freezes the server-derived turn count; a row
 * whose phases are mid-flight is resumed exactly as recorded; a settled row
 * replays its stored outcome. Reusing a key for a different checkpoint is a
 * hard conflict — the stored plan would not describe the requested revert.
 */
export function dbClaimCheckpointRevertOperation(
  input: ClaimCheckpointRevertOperationInput,
): CheckpointRevertClaim {
  const sqlite = getSqlite();
  const now = Date.now();
  const claim = sqlite.transaction((): CheckpointRevertClaim => {
    const existing = sqlite
      .prepare("SELECT * FROM checkpoint_revert_operations WHERE operation_key = ?")
      .get(input.operationKey) as Record<string, unknown> | undefined;
    if (existing) {
      const row = rowToOperation(existing as Parameters<typeof rowToOperation>[0]);
      if (row.threadId !== input.threadId || row.checkpointItemId !== input.checkpointItemId) {
        throw new Error(
          `Checkpoint revert operation key "${input.operationKey}" was already used for a different target.`,
        );
      }
      // Settled outcomes replay verbatim. `running` (crash mid-operation) and
      // `failed` (a retryable phase, e.g. the file restore) resume from the
      // recorded phases; the destructive provider phase is never re-run
      // regardless, because it is no longer `pending`.
      if (
        row.outcome === "completed" ||
        row.outcome === "completed_local_only" ||
        row.outcome === "ambiguous"
      ) {
        return { kind: "replay", row };
      }
      return { kind: "resume", row };
    }
    const numTurns = dbCountRollbackTurnsAfterCheckpoint(input.threadId, input.checkpointItemId);
    sqlite
      .prepare(
        `INSERT INTO checkpoint_revert_operations
           (operation_key, thread_id, checkpoint_item_id, num_turns,
            project_location_json, config_json, provider_phase, files_phase,
            truncate_phase, removed_anchors_json, outcome, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', 'pending', 'pending', NULL, 'running', ?, ?)`,
      )
      .run(
        input.operationKey,
        input.threadId,
        input.checkpointItemId,
        numTurns,
        input.projectLocationJson,
        input.configJson,
        now,
        now,
      );
    const row = dbGetCheckpointRevertOperation(input.operationKey);
    if (!row) throw new Error("Failed to read back the claimed checkpoint revert operation.");
    return { kind: "claimed", row };
  });
  return claim.immediate() as CheckpointRevertClaim;
}

export function dbGetCheckpointRevertOperation(
  operationKey: string,
): CheckpointRevertOperationRow | null {
  const row = getSqlite()
    .prepare("SELECT * FROM checkpoint_revert_operations WHERE operation_key = ?")
    .get(operationKey) as Record<string, unknown> | undefined;
  return row ? rowToOperation(row as Parameters<typeof rowToOperation>[0]) : null;
}

export interface CheckpointRevertPhaseUpdate {
  providerPhase?: CheckpointRevertProviderPhase;
  filesPhase?: CheckpointRevertFilesPhase;
  truncatePhase?: CheckpointRevertTruncatePhase;
  removedAnchors?: string[];
  outcome?: CheckpointRevertOutcome;
}

/** Phase writes happen before the matching side effect is attempted, so a
 * crash leaves the journal describing exactly what the next attempt must not
 * redo. */
export function dbUpdateCheckpointRevertPhases(
  operationKey: string,
  update: CheckpointRevertPhaseUpdate,
): void {
  const sets: string[] = ["updated_at = ?"];
  const values: unknown[] = [Date.now()];
  if (update.providerPhase !== undefined) {
    sets.push("provider_phase = ?");
    values.push(update.providerPhase);
  }
  if (update.filesPhase !== undefined) {
    sets.push("files_phase = ?");
    values.push(update.filesPhase);
  }
  if (update.truncatePhase !== undefined) {
    sets.push("truncate_phase = ?");
    values.push(update.truncatePhase);
  }
  if (update.removedAnchors !== undefined) {
    sets.push("removed_anchors_json = ?");
    values.push(JSON.stringify(update.removedAnchors));
  }
  if (update.outcome !== undefined) {
    sets.push("outcome = ?");
    values.push(update.outcome);
  }
  values.push(operationKey);
  getSqlite()
    .prepare(`UPDATE checkpoint_revert_operations SET ${sets.join(", ")} WHERE operation_key = ?`)
    .run(...values);
}
