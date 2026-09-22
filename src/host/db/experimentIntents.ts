import {
  MAX_EXPERIMENT_CANDIDATES,
  type Experiment,
  type ExperimentCandidateRowUpdate,
  type ExperimentCandidateThreadCreation,
} from "@/shared/contracts";
import {
  dbAssertNoRunningCheckpointRevert,
  ThreadCheckpointRevertActiveError,
} from "./checkpointRevertOperations";
import { getSqlite } from "./connection";
import type { CatalogIntentCommittedSignal } from "./catalogIntents";
import {
  dbExperimentGroupHasRows,
  dbProjectExists,
  experimentStoreWriteTooLarge,
  nextExperimentHeadSortOrder,
  parseStoredExperimentRecord,
  readExperimentStoreSnapshot,
  readExperimentThreadRow,
  sameJsonValue,
  serializeExperimentStoreRecords,
  writeExperimentStoreRecords,
  type ExperimentStoreSnapshot,
  type ExperimentThreadRow,
} from "./experimentStore";
import { forgetMainCreatedThread } from "./mainCreatedThreads";
import { notifyThreadsDeleted } from "./deletedThreadNotifications";
import { notifyProjectThreadDataChanged } from "./projectThreadChanges";
import { isProjectRemoving } from "./projectLifecycleGuard";
import { dbDiscardThreadRuntimeWrites } from "./runtimeItems";
import { forgetRuntimeThreadDurableGap } from "./runtimePersistenceRuntime";

/**
 * Experiment authority intents (host core, capabilities.experiments v1).
 *
 * `create` is insert-only and never launches: record plus candidate rows in one
 * transaction, creation fields only, host defaults, and a host-assigned
 * sort-order block at the head of the project. `replace` is a store-wide CAS
 * plus narrow allowlisted row updates; creation fields are never rewritten and
 * immutable candidate ownership changes are refused. `remove` deletes or
 * releases candidate rows under confirmed-retirement custody (route phase) and
 * splices the record out of the raw store.
 *
 * Postconditions include the record AND every requested row effect: an
 * idempotent retry (same command id, same body, receipt replay or uncertain
 * resume) skips effects whose postcondition already holds, so `done_at` /
 * `updated_at` are never re-stamped under a newer baseline. Destructive row
 * effects run through custody delete semantics: a running checkpoint revert
 * refuses the whole transaction with zero effect, and runtime-write /
 * durable-gap / main-created obligations are forgotten only AFTER the
 * transaction is known committed.
 */

export type DbExperimentIntentCommand =
  | {
      readonly kind: "create";
      readonly experimentId: string;
      readonly record: Experiment;
      readonly threads: readonly ExperimentCandidateThreadCreation[];
    }
  | {
      readonly kind: "replace";
      readonly experimentId: string;
      readonly revision: string;
      readonly record: Experiment;
      readonly rows: readonly ExperimentCandidateRowUpdate[];
    }
  | {
      readonly kind: "remove";
      readonly experimentId: string;
      readonly revision: string;
      readonly candidateDisposition: "delete" | "release";
    };

export type DbExperimentIntentStage = "created" | "replaced" | "removed" | "unchanged";

export type DbExperimentIntentOutcome =
  | {
      readonly status: "applied";
      readonly revision: string;
      readonly stage: DbExperimentIntentStage;
      readonly touchedThreadIds: readonly string[];
    }
  | { readonly status: "state_unavailable" }
  | { readonly status: "already_exists" }
  | { readonly status: "not_found" }
  | { readonly status: "project_missing" }
  | { readonly status: "project_mismatch" }
  | { readonly status: "project_removing" }
  | { readonly status: "experiment_state_too_large" }
  | { readonly status: "revision_conflict" }
  | { readonly status: "thread_exists"; readonly threadIds: readonly string[] }
  | { readonly status: "thread_not_candidate"; readonly threadIds: readonly string[] }
  | { readonly status: "thread_project_mismatch"; readonly threadIds: readonly string[] }
  | { readonly status: "candidate_row_missing"; readonly threadIds: readonly string[] }
  | { readonly status: "candidate_ownership_changed"; readonly threadIds: readonly string[] }
  | { readonly status: "candidate_session_present"; readonly threadIds: readonly string[] }
  | { readonly status: "checkpoint_revert_running"; readonly threadIds: readonly string[] };

export type DbExperimentReconcileOutcome =
  | { readonly kind: "resume" }
  | { readonly kind: "unresolved" };

/** Custody plan returned by the read-only preflight for an admissible command. */
export interface DbExperimentIntentPlan {
  readonly status: "plan";
  /** Candidate ids whose runtime must be confirmed-retired before the transaction. */
  readonly retiringThreadIds: readonly string[];
}

/** The typed non-applied outcomes (definite refusals / conflicts). */
type RefusedExperimentOutcome = Exclude<DbExperimentIntentOutcome, { status: "applied" }>;

/** Internal applied result; `deletedThreadIds` are released only post-commit. */
interface AppliedExperimentOutcome {
  readonly status: "applied";
  readonly revision: string;
  readonly stage: DbExperimentIntentStage;
  readonly touchedThreadIds: readonly string[];
  readonly deletedThreadIds?: readonly string[];
}

/** Upper bound any intent's retirement custody may hold. */
export const MAX_EXPERIMENT_CUSTODY_THREADS = MAX_EXPERIMENT_CANDIDATES;

/**
 * Whether the prospective spliced document would be refused by the shared
 * budget writer. Preflight uses the same serialization the commit will use, so
 * an over-budget request is a definite refusal BEFORE any custody/retirement.
 */
function storeWriteWouldBeTooLarge(
  store: ExperimentStoreSnapshot,
  records: ReadonlyMap<string, unknown>,
): boolean {
  return experimentStoreWriteTooLarge(serializeExperimentStoreRecords(records), store.rawValue);
}

function sqlite(): ReturnType<typeof getSqlite> {
  return getSqlite();
}

function candidateIds(record: Experiment): Set<string> {
  return new Set(record.candidates.map((candidate) => candidate.threadId));
}

function immutableOwnershipChanged(stored: Experiment, incoming: Experiment): boolean {
  const storedById = new Map(stored.candidates.map((candidate) => [candidate.threadId, candidate]));
  if (storedById.size !== incoming.candidates.length) return true;
  for (const candidate of incoming.candidates) {
    const existing = storedById.get(candidate.threadId);
    if (!existing) return true;
    if (
      existing.agentKind !== candidate.agentKind ||
      existing.worktreeBranch !== candidate.worktreeBranch ||
      existing.worktreeOwnerToken !== candidate.worktreeOwnerToken
    ) {
      return true;
    }
  }
  return false;
}

function creationProjectionMatches(
  row: ExperimentThreadRow,
  record: Experiment,
  spec: ExperimentCandidateThreadCreation,
): boolean {
  return (
    row.project_id === record.projectId &&
    row.title === spec.title &&
    row.agent_kind === spec.agentKind &&
    row.agent_instance_id === (spec.agentInstanceId ?? null) &&
    row.config === JSON.stringify(spec.config) &&
    row.presentation_mode === (spec.presentationMode ?? "terminal") &&
    row.worktree_branch === spec.worktreeBranch &&
    row.group_id === record.id &&
    row.group_name === record.title &&
    row.parent_thread_id === (spec.parentThreadId ?? null) &&
    row.status === "inactive" &&
    row.session_ref === null
  );
}

const INSERT_CANDIDATE_THREAD_SQL = `INSERT INTO threads (
    id, project_id, workspace_id, title, agent_kind, agent_instance_id, config, status, attention,
    thread_status_source, can_resume_with_config, session_ref, terminal_prompt, worktree_path,
    worktree_branch, pr_number, group_id, group_name, parent_thread_id, archived, archived_at, done,
    done_at, starred, presentation_mode, sort_order, created_at, updated_at, active_turn_started_at,
    last_turn_started_at, last_turn_ended_at
  ) VALUES (
    @id, @projectId, NULL, @title, @agentKind, @agentInstanceId, @config, 'inactive', 'none',
    @threadStatusSource, 0, NULL, NULL, NULL,
    @worktreeBranch, NULL, @groupId, @groupName, @parentThreadId, 0, NULL, 0,
    NULL, 0, @presentationMode, @sortOrder, @now, @now, NULL,
    NULL, NULL
  ) ON CONFLICT(id) DO NOTHING`;

function insertCandidateThread(
  record: Experiment,
  spec: ExperimentCandidateThreadCreation,
  sortOrder: number,
  now: string,
): number {
  const presentationMode = spec.presentationMode ?? "terminal";
  return sqlite()
    .prepare(INSERT_CANDIDATE_THREAD_SQL)
    .run({
      id: spec.threadId,
      projectId: record.projectId,
      title: spec.title,
      agentKind: spec.agentKind,
      agentInstanceId: spec.agentInstanceId ?? null,
      config: JSON.stringify(spec.config),
      threadStatusSource: presentationMode === "terminal" ? null : "server",
      worktreeBranch: spec.worktreeBranch,
      groupId: record.id,
      groupName: record.title,
      parentThreadId: spec.parentThreadId ?? null,
      presentationMode,
      sortOrder,
      now,
    }).changes;
}

/**
 * Transactional rollback sentinel. A typed refusal raised after a write must
 * still abort the whole SQLite transaction, so refusals inside the three apply
 * functions are thrown and converted back to a typed outcome at the boundary
 * (better-sqlite3 commits on a normal return).
 */
class ExperimentIntentRefusal extends Error {
  constructor(readonly outcome: RefusedExperimentOutcome) {
    super("Experiment intent refused.");
  }
}

function refuse(outcome: RefusedExperimentOutcome): never {
  throw new ExperimentIntentRefusal(outcome);
}

/**
 * Persist the spliced store through the single budget-enforcing writer. A
 * refusal raised here aborts the whole transaction, so no candidate-row effect
 * from the same intent survives an over-budget commit; the check runs at
 * commit time against the raw value the transaction is about to replace.
 */
function writeStoreOrRefuse(records: ReadonlyMap<string, unknown>): string {
  const written = writeExperimentStoreRecords(records);
  if (written.status === "too_large") refuse({ status: "experiment_state_too_large" });
  return written.revision;
}

function applyCreate(
  command: Extract<DbExperimentIntentCommand, { kind: "create" }>,
): RefusedExperimentOutcome | AppliedExperimentOutcome {
  const { record, experimentId } = command;
  const store = readExperimentStoreSnapshot();
  if (!store) refuse({ status: "state_unavailable" });
  if (isProjectRemoving(record.projectId)) refuse({ status: "project_removing" });

  const existing = store.records.get(experimentId);
  if (existing !== undefined) {
    const stored = parseStoredExperimentRecord(existing);
    if (!stored) refuse({ status: "state_unavailable" });
    if (!sameJsonValue(stored, record)) refuse({ status: "already_exists" });
    const mismatched: string[] = [];
    for (const spec of command.threads) {
      const row = readExperimentThreadRow(spec.threadId);
      if (!row || !creationProjectionMatches(row, record, spec)) mismatched.push(spec.threadId);
    }
    if (mismatched.length > 0) refuse({ status: "thread_exists", threadIds: mismatched });
    return {
      status: "applied",
      revision: store.revision,
      stage: "unchanged",
      touchedThreadIds: [],
    };
  }

  if (!dbProjectExists(record.projectId)) refuse({ status: "project_missing" });

  const conflicts: string[] = [];
  const now = new Date().toISOString();
  const head = nextExperimentHeadSortOrder(record.projectId, command.threads.length);
  command.threads.forEach((spec, index) => {
    const row = readExperimentThreadRow(spec.threadId);
    if (row) {
      if (!creationProjectionMatches(row, record, spec)) conflicts.push(spec.threadId);
      return;
    }
    if (insertCandidateThread(record, spec, head + index, now) !== 1) conflicts.push(spec.threadId);
  });
  if (conflicts.length > 0) refuse({ status: "thread_exists", threadIds: conflicts });

  store.records.set(experimentId, record);
  const revision = writeStoreOrRefuse(store.records);
  return {
    status: "applied",
    revision,
    stage: "created",
    touchedThreadIds: command.threads.map((spec) => spec.threadId),
  };
}

/** Requested non-null worktree branch of a row update, or null when absent/cleared. */
function rowUpdateBranch(update: ExperimentCandidateRowUpdate): string | null {
  if (update.worktree === undefined || update.worktree === null) return null;
  return update.worktree.branch;
}

function rowPostconditionHolds(
  row: ExperimentThreadRow,
  update: ExperimentCandidateRowUpdate,
): boolean {
  if (update.worktree !== undefined) {
    const path = update.worktree === null ? null : update.worktree.path;
    const branch = update.worktree === null ? null : update.worktree.branch;
    if (row.worktree_path !== path || row.worktree_branch !== branch) return false;
  }
  if (update.groupName !== undefined && row.group_name !== update.groupName) return false;
  if (update.retire === "done" && row.done === 0) return false;
  if (
    update.fail === true &&
    !(
      row.status === "error" &&
      row.attention === "error" &&
      row.can_resume_with_config === 0 &&
      row.done === 1
    )
  ) {
    return false;
  }
  return true;
}

type RowUpdateOutcome =
  | { readonly status: "applied"; readonly changed: boolean }
  | { readonly status: "candidate_row_missing" }
  | { readonly status: "candidate_session_present" }
  | { readonly status: "candidate_ownership_changed" };

function applyRowUpdate(
  row: ExperimentThreadRow,
  update: ExperimentCandidateRowUpdate,
  storedCandidateBranch: string,
  now: string,
): RowUpdateOutcome {
  if (update.worktree !== undefined) {
    const path = update.worktree === null ? null : update.worktree.path;
    const branch = update.worktree === null ? null : update.worktree.branch;
    if (branch !== null && branch !== storedCandidateBranch) {
      return { status: "candidate_ownership_changed" };
    }
    if (row.worktree_path !== path || row.worktree_branch !== branch) {
      const changes = sqlite()
        .prepare(
          `UPDATE threads SET worktree_path = ?, worktree_branch = ?, updated_at = ?
           WHERE id = ? AND project_id = ?`,
        )
        .run(path, branch, now, row.id, row.project_id).changes;
      if (changes === 0) return { status: "candidate_row_missing" };
      return { status: "applied", changed: true };
    }
  }
  if (update.groupName !== undefined && row.group_name !== update.groupName) {
    const changes = sqlite()
      .prepare(`UPDATE threads SET group_name = ?, updated_at = ? WHERE id = ? AND project_id = ?`)
      .run(update.groupName, now, row.id, row.project_id).changes;
    if (changes === 0) return { status: "candidate_row_missing" };
    return { status: "applied", changed: true };
  }
  // `retire`/`fail` are absolute effects: when the postcondition already holds
  // (retry, or a lost receipt) the write is skipped so timestamps are never
  // re-stamped.
  if (update.retire === "done" && row.done === 0) {
    const changes = sqlite()
      .prepare(
        `UPDATE threads SET done = 1, done_at = ?, updated_at = ? WHERE id = ? AND project_id = ?`,
      )
      .run(now, now, row.id, row.project_id).changes;
    if (changes === 0) return { status: "candidate_row_missing" };
    return { status: "applied", changed: true };
  }
  if (update.fail === true) {
    const failed =
      row.status === "error" &&
      row.attention === "error" &&
      row.can_resume_with_config === 0 &&
      row.done === 1;
    if (!failed) {
      // A live/starting candidate is never failed: the never-launched failure
      // path requires no recorded session, and the route additionally requires
      // confirmed retirement before this call.
      if (row.session_ref !== null) return { status: "candidate_session_present" };
      const changes = sqlite()
        .prepare(
          `UPDATE threads SET status = 'error', attention = 'error', can_resume_with_config = 0,
                              done = 1, done_at = ?, updated_at = ?
           WHERE id = ? AND project_id = ? AND session_ref IS NULL`,
        )
        .run(now, now, row.id, row.project_id).changes;
      if (changes === 0) return { status: "candidate_row_missing" };
      return { status: "applied", changed: true };
    }
  }
  return { status: "applied", changed: false };
}

function applyReplace(
  command: Extract<DbExperimentIntentCommand, { kind: "replace" }>,
): RefusedExperimentOutcome | AppliedExperimentOutcome {
  const { record, experimentId } = command;
  const store = readExperimentStoreSnapshot();
  if (!store) refuse({ status: "state_unavailable" });
  if (isProjectRemoving(record.projectId)) refuse({ status: "project_removing" });

  const stored = parseStoredExperimentRecord(store.records.get(experimentId));
  if (!stored) refuse({ status: "not_found" });
  if (stored.projectId !== record.projectId) refuse({ status: "project_mismatch" });
  // Recheck the project after any custody await: an experiment whose project
  // row is gone is an interrupted removal, never a replace target.
  if (!dbProjectExists(record.projectId)) refuse({ status: "project_missing" });
  const storedIds = candidateIds(stored);
  const incomingIds = candidateIds(record);
  if (storedIds.size !== incomingIds.size || [...incomingIds].some((id) => !storedIds.has(id))) {
    refuse({ status: "candidate_ownership_changed", threadIds: [...incomingIds] });
  }
  if (immutableOwnershipChanged(stored, record)) {
    refuse({ status: "candidate_ownership_changed", threadIds: [...incomingIds] });
  }

  const storedById = new Map(stored.candidates.map((candidate) => [candidate.threadId, candidate]));
  const now = new Date().toISOString();
  const notCandidate: string[] = [];
  const projectMismatch: string[] = [];
  const missing: string[] = [];
  const sessionPresent: string[] = [];
  const ownershipChanged: string[] = [];
  let rowsChanged = false;

  for (const update of command.rows) {
    const candidate = storedById.get(update.threadId);
    if (!candidate) {
      notCandidate.push(update.threadId);
      continue;
    }
    const row = readExperimentThreadRow(update.threadId);
    if (!row) {
      missing.push(update.threadId);
      continue;
    }
    if (row.project_id !== stored.projectId) {
      projectMismatch.push(update.threadId);
      continue;
    }
    // Immutable candidate ownership is validated BEFORE the postcondition
    // skip: a row whose host-owned branch drifted must not accept a request
    // that merely agrees with the drifted value.
    if (rowUpdateBranch(update) !== null && rowUpdateBranch(update) !== candidate.worktreeBranch) {
      ownershipChanged.push(update.threadId);
      continue;
    }
    if (rowPostconditionHolds(row, update)) continue;
    const outcome = applyRowUpdate(row, update, candidate.worktreeBranch, now);
    switch (outcome.status) {
      case "applied":
        rowsChanged = rowsChanged || outcome.changed;
        break;
      case "candidate_row_missing":
        missing.push(update.threadId);
        break;
      case "candidate_session_present":
        sessionPresent.push(update.threadId);
        break;
      case "candidate_ownership_changed":
        ownershipChanged.push(update.threadId);
        break;
    }
  }

  if (notCandidate.length > 0) refuse({ status: "thread_not_candidate", threadIds: notCandidate });
  if (projectMismatch.length > 0) {
    refuse({ status: "thread_project_mismatch", threadIds: projectMismatch });
  }
  if (ownershipChanged.length > 0) {
    refuse({ status: "candidate_ownership_changed", threadIds: ownershipChanged });
  }
  if (sessionPresent.length > 0) {
    refuse({ status: "candidate_session_present", threadIds: sessionPresent });
  }
  if (missing.length > 0) refuse({ status: "candidate_row_missing", threadIds: missing });

  const recordEqual = sameJsonValue(stored, record);
  // Store-wide CAS: a stale token conflicts unless the intended record state
  // is already present (an idempotent retry may still apply row effects whose
  // postcondition does not hold).
  if (store.revision !== command.revision && !recordEqual) {
    refuse({ status: "revision_conflict" });
  }

  let revision = store.revision;
  if (!recordEqual) {
    store.records.set(experimentId, record);
    revision = writeStoreOrRefuse(store.records);
  }
  return {
    status: "applied",
    revision,
    stage: rowsChanged || !recordEqual ? "replaced" : "unchanged",
    touchedThreadIds: command.rows.map((update) => update.threadId),
  };
}

function applyRemove(
  command: Extract<DbExperimentIntentCommand, { kind: "remove" }>,
): RefusedExperimentOutcome | AppliedExperimentOutcome {
  const { experimentId } = command;
  const store = readExperimentStoreSnapshot();
  if (!store) refuse({ status: "state_unavailable" });

  const existing = store.records.get(experimentId);
  if (existing === undefined) {
    // The record is gone. Candidate rows are linkable through the experiment
    // id they were created with (`group_id`): when none remain, the requested
    // post-state already holds (idempotent success); when some remain, this is
    // not provably this experiment's post-state and the caller gets a truthful
    // 404 instead of a blind row action.
    return dbExperimentGroupHasRows(experimentId)
      ? refuse({ status: "not_found" })
      : { status: "applied", revision: store.revision, stage: "unchanged", touchedThreadIds: [] };
  }
  const stored = parseStoredExperimentRecord(existing);
  if (!stored) refuse({ status: "state_unavailable" });
  if (isProjectRemoving(stored.projectId)) refuse({ status: "project_removing" });
  if (store.revision !== command.revision) refuse({ status: "revision_conflict" });

  const ids = [...candidateIds(stored)];
  const deletedThreadIds: string[] = [];
  if (command.candidateDisposition === "delete") {
    try {
      dbAssertNoRunningCheckpointRevert(ids);
    } catch (error) {
      if (error instanceof ThreadCheckpointRevertActiveError) {
        refuse({ status: "checkpoint_revert_running", threadIds: ids });
      }
      throw error;
    }
    const projectMismatch: string[] = [];
    for (const threadId of ids) {
      const row = readExperimentThreadRow(threadId);
      if (!row) continue;
      // Destructive removal is refused for a row that no longer belongs to the
      // record's project; the delete itself is scoped to the same project.
      if (row.project_id !== stored.projectId) {
        projectMismatch.push(threadId);
        continue;
      }
      deletedThreadIds.push(threadId);
    }
    if (projectMismatch.length > 0) {
      refuse({ status: "thread_project_mismatch", threadIds: projectMismatch });
    }
    for (const threadId of deletedThreadIds) {
      sqlite()
        .prepare(`DELETE FROM threads WHERE id = ? AND project_id = ?`)
        .run(threadId, stored.projectId);
    }
  } else {
    const missing: string[] = [];
    const now = new Date().toISOString();
    for (const threadId of ids) {
      const row = readExperimentThreadRow(threadId);
      if (!row) {
        missing.push(threadId);
        continue;
      }
      if (row.group_id === null && row.group_name === null) continue;
      sqlite()
        .prepare(
          `UPDATE threads SET group_id = NULL, group_name = NULL, updated_at = ?
           WHERE id = ? AND project_id = ?`,
        )
        .run(now, threadId, row.project_id);
    }
    if (missing.length > 0) refuse({ status: "candidate_row_missing", threadIds: missing });
  }

  store.records.delete(experimentId);
  const revision = writeStoreOrRefuse(store.records);
  return {
    status: "applied",
    revision,
    stage: "removed",
    touchedThreadIds: ids,
    ...(deletedThreadIds.length > 0 ? { deletedThreadIds } : {}),
  };
}

/**
 * Apply one canonical experiment intent. Refusals are typed outcomes with zero
 * effect. A committing outcome fires `onCommitted` immediately after the
 * commit and before the post-commit callbacks, so a throwing listener or
 * publication is classified may-have-committed, never a definite failure; the
 * deleted rows' runtime obligations are forgotten only past that point.
 */
export function dbApplyExperimentIntent(
  command: DbExperimentIntentCommand,
  onCommitted?: CatalogIntentCommittedSignal,
): DbExperimentIntentOutcome {
  const connection = sqlite();
  let applied: RefusedExperimentOutcome | AppliedExperimentOutcome;
  try {
    applied = connection
      .transaction((): RefusedExperimentOutcome | AppliedExperimentOutcome => {
        switch (command.kind) {
          case "create":
            return applyCreate(command);
          case "replace":
            return applyReplace(command);
          case "remove":
            return applyRemove(command);
        }
      })
      .immediate();
  } catch (error) {
    // A refusal raised after a partial write aborts (rolls back) the whole
    // transaction and surfaces as the same typed zero-effect outcome.
    if (error instanceof ExperimentIntentRefusal) return error.outcome;
    throw error;
  }

  if (applied.status !== "applied") return applied;
  const deletedThreadIds = applied.deletedThreadIds ?? [];
  // The retirement transaction committed; announce the deleted candidates so
  // the composition's reclaimer can retire their attachment directories.
  notifyThreadsDeleted(deletedThreadIds);
  if (applied.stage !== "unchanged") onCommitted?.();
  for (const threadId of deletedThreadIds) {
    dbDiscardThreadRuntimeWrites(threadId);
    forgetRuntimeThreadDurableGap(threadId);
    forgetMainCreatedThread(threadId);
  }
  if (applied.stage !== "unchanged") notifyProjectThreadDataChanged();
  return applied;
}

/**
 * Reconcile an `uncertain` receipt. `resume` means re-executing the same
 * command is provably safe: either the full intended post-state (record AND
 * every requested row effect) already holds, or nothing about the store
 * changed since dispatch so the absolute effects can continue. Anything else
 * is `unresolved` — never re-apply under a newer baseline.
 */
export function dbReconcileExperimentIntent(
  command: DbExperimentIntentCommand,
): DbExperimentReconcileOutcome {
  const store = readExperimentStoreSnapshot();
  if (!store) return { kind: "unresolved" };
  switch (command.kind) {
    case "create": {
      const existing = store.records.get(command.experimentId);
      if (existing === undefined) {
        const rowExists = command.threads.some(
          (spec) => readExperimentThreadRow(spec.threadId) !== undefined,
        );
        return rowExists ? { kind: "unresolved" } : { kind: "resume" };
      }
      const stored = parseStoredExperimentRecord(existing);
      if (!stored || !sameJsonValue(stored, command.record)) return { kind: "unresolved" };
      for (const spec of command.threads) {
        const row = readExperimentThreadRow(spec.threadId);
        if (!row || !creationProjectionMatches(row, command.record, spec)) {
          return { kind: "unresolved" };
        }
      }
      return { kind: "resume" };
    }
    case "replace": {
      const stored = parseStoredExperimentRecord(store.records.get(command.experimentId));
      if (!stored) {
        return store.revision === command.revision ? { kind: "resume" } : { kind: "unresolved" };
      }
      if (sameJsonValue(stored, command.record)) {
        const storedById = new Map(
          stored.candidates.map((candidate) => [candidate.threadId, candidate]),
        );
        for (const update of command.rows) {
          const candidate = storedById.get(update.threadId);
          const row = readExperimentThreadRow(update.threadId);
          if (!candidate || !row) return { kind: "unresolved" };
          if (!rowPostconditionHolds(row, update)) return { kind: "unresolved" };
        }
        return { kind: "resume" };
      }
      return store.revision === command.revision ? { kind: "resume" } : { kind: "unresolved" };
    }
    case "remove": {
      if (store.records.get(command.experimentId) === undefined) {
        return dbExperimentGroupHasRows(command.experimentId)
          ? { kind: "unresolved" }
          : { kind: "resume" };
      }
      return store.revision === command.revision ? { kind: "resume" } : { kind: "unresolved" };
    }
  }
}

/**
 * Read-only preflight for one canonical experiment intent. Returns either the
 * same typed refusal the transaction would produce (a definite, zero-effect
 * failure the route may answer before any custody) or the custody plan: the
 * exact candidate ids whose confirmed retirement must precede the final
 * transaction. The plan is not a reservation — the transaction re-reads and
 * re-checks every ownership/CAS condition after the custody awaits.
 */
export function dbPreflightExperimentIntent(
  command: DbExperimentIntentCommand,
): RefusedExperimentOutcome | DbExperimentIntentPlan {
  const store = readExperimentStoreSnapshot();
  if (!store) return { status: "state_unavailable" };
  switch (command.kind) {
    case "create": {
      const { record, experimentId } = command;
      if (isProjectRemoving(record.projectId)) return { status: "project_removing" };
      const existing = store.records.get(experimentId);
      if (existing !== undefined) {
        const stored = parseStoredExperimentRecord(existing);
        if (!stored) return { status: "state_unavailable" };
        if (!sameJsonValue(stored, record)) return { status: "already_exists" };
        const mismatched = command.threads
          .filter((spec) => {
            const row = readExperimentThreadRow(spec.threadId);
            return !row || !creationProjectionMatches(row, record, spec);
          })
          .map((spec) => spec.threadId);
        if (mismatched.length > 0) return { status: "thread_exists", threadIds: mismatched };
        return { status: "plan", retiringThreadIds: [] };
      }
      if (!dbProjectExists(record.projectId)) return { status: "project_missing" };
      const conflicts = command.threads
        .filter((spec) => {
          const row = readExperimentThreadRow(spec.threadId);
          return row !== undefined && !creationProjectionMatches(row, record, spec);
        })
        .map((spec) => spec.threadId);
      if (conflicts.length > 0) return { status: "thread_exists", threadIds: conflicts };
      const prospective = new Map(store.records);
      prospective.set(experimentId, record);
      if (storeWriteWouldBeTooLarge(store, prospective)) {
        return { status: "experiment_state_too_large" };
      }
      return { status: "plan", retiringThreadIds: [] };
    }
    case "replace": {
      const { record, experimentId } = command;
      if (isProjectRemoving(record.projectId)) return { status: "project_removing" };
      const stored = parseStoredExperimentRecord(store.records.get(experimentId));
      if (!stored) return { status: "not_found" };
      if (stored.projectId !== record.projectId) return { status: "project_mismatch" };
      if (!dbProjectExists(record.projectId)) return { status: "project_missing" };
      const storedIds = candidateIds(stored);
      const incomingIds = candidateIds(record);
      if (
        storedIds.size !== incomingIds.size ||
        [...incomingIds].some((id) => !storedIds.has(id))
      ) {
        return { status: "candidate_ownership_changed", threadIds: [...incomingIds] };
      }
      if (immutableOwnershipChanged(stored, record)) {
        return { status: "candidate_ownership_changed", threadIds: [...incomingIds] };
      }
      const storedById = new Map(
        stored.candidates.map((candidate) => [candidate.threadId, candidate]),
      );
      const retiring = new Set<string>();
      for (const update of command.rows) {
        const candidate = storedById.get(update.threadId);
        if (!candidate) return { status: "thread_not_candidate", threadIds: [update.threadId] };
        const row = readExperimentThreadRow(update.threadId);
        if (!row) return { status: "candidate_row_missing", threadIds: [update.threadId] };
        if (row.project_id !== stored.projectId) {
          return { status: "thread_project_mismatch", threadIds: [update.threadId] };
        }
        if (
          rowUpdateBranch(update) !== null &&
          rowUpdateBranch(update) !== candidate.worktreeBranch
        ) {
          return { status: "candidate_ownership_changed", threadIds: [update.threadId] };
        }
        if (rowPostconditionHolds(row, update)) continue;
        if (update.fail === true && row.session_ref !== null) {
          return { status: "candidate_session_present", threadIds: [update.threadId] };
        }
        if (update.retire === "done" || update.fail === true) retiring.add(update.threadId);
      }
      const recordEqual = sameJsonValue(stored, record);
      if (store.revision !== command.revision && !recordEqual) {
        return { status: "revision_conflict" };
      }
      if (!recordEqual) {
        const prospective = new Map(store.records);
        prospective.set(experimentId, record);
        if (storeWriteWouldBeTooLarge(store, prospective)) {
          return { status: "experiment_state_too_large" };
        }
      }
      return { status: "plan", retiringThreadIds: [...retiring] };
    }
    case "remove": {
      const stored = parseStoredExperimentRecord(store.records.get(command.experimentId));
      if (!stored) {
        return dbExperimentGroupHasRows(command.experimentId)
          ? { status: "not_found" }
          : { status: "plan", retiringThreadIds: [] };
      }
      if (isProjectRemoving(stored.projectId)) return { status: "project_removing" };
      if (store.revision !== command.revision) return { status: "revision_conflict" };
      const ids = [...candidateIds(stored)];
      if (command.candidateDisposition === "delete") {
        try {
          dbAssertNoRunningCheckpointRevert(ids);
        } catch (error) {
          if (error instanceof ThreadCheckpointRevertActiveError) {
            return { status: "checkpoint_revert_running", threadIds: ids };
          }
          throw error;
        }
        const projectMismatch = ids.filter((threadId) => {
          const row = readExperimentThreadRow(threadId);
          return row !== undefined && row.project_id !== stored.projectId;
        });
        if (projectMismatch.length > 0) {
          return { status: "thread_project_mismatch", threadIds: projectMismatch };
        }
        return {
          status: "plan",
          retiringThreadIds: ids.filter(
            (threadId) => readExperimentThreadRow(threadId) !== undefined,
          ),
        };
      }
      const missing = ids.filter((threadId) => readExperimentThreadRow(threadId) === undefined);
      if (missing.length > 0) return { status: "candidate_row_missing", threadIds: missing };
      return { status: "plan", retiringThreadIds: [] };
    }
  }
}

/**
 * Exact-id project-removal helper. Removes only the captured record ids whose
 * parsed record still belongs to `projectId`; every other record keeps its
 * JSON value. Called while the project-removal guard is held (the guard blocks
 * new same-project commits), so the captured id set is complete.
 */
export function dbRemoveProjectExperiments(
  projectId: string,
  recordIds: readonly string[],
  onCommitted?: CatalogIntentCommittedSignal,
):
  | { readonly status: "ok"; readonly removedIds: readonly string[] }
  | { readonly status: "unavailable" } {
  const connection = sqlite();
  let removedIds: string[] = [];
  let unavailable = false;
  const applied = connection
    .transaction(() => {
      const store = readExperimentStoreSnapshot();
      if (!store) {
        unavailable = true;
        return false;
      }
      for (const id of recordIds) {
        const value = store.records.get(id);
        if (value === undefined) continue;
        const record = parseStoredExperimentRecord(value);
        if (!record || record.projectId !== projectId) continue;
        store.records.delete(id);
        removedIds.push(id);
      }
      if (removedIds.length === 0) return false;
      const written = writeExperimentStoreRecords(store.records);
      // Removing records strictly shrinks the document, so the budget writer
      // can never refuse here; a `too_large` would mean the shrink rule broke.
      if (written.status !== "written") {
        throw new Error("Experiment store removal exceeded the byte budget.");
      }
      return true;
    })
    .immediate();
  if (unavailable) return { status: "unavailable" };
  if (applied) {
    onCommitted?.();
    notifyProjectThreadDataChanged();
  }
  return { status: "ok", removedIds };
}
