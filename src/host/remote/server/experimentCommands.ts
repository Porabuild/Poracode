import {
  experimentSchema,
  remoteExperimentCommandResultSchema,
  type ExperimentCandidateThreadCreation,
  type RemoteExperimentCommand,
  type RemoteExperimentCommandResult,
  type RemoteExperimentState,
} from "@/shared/contracts";
import {
  dbApplyExperimentIntent,
  dbPreflightExperimentIntent,
  dbReadExperimentState,
  dbReconcileExperimentIntent,
  MAX_EXPERIMENT_CUSTODY_THREADS,
  type DbExperimentIntentCommand,
  type DbExperimentIntentOutcome,
} from "@/host/db";
import { RemoteHttpError } from "../auth";
import type { RemoteExperimentAuthority } from "../remoteAccessServerTypes";
import { runRemoteCommand } from "./remoteCommandIdempotency";
import type { RemoteServerContext } from "./context";

/**
 * Experiment authority orchestration (capabilities.experiments v1).
 *
 * Ordering per command:
 * 1. canonical domain parse (the wire carries the portable structural twin);
 * 2. a read-only preflight that produces the SAME typed refusal the
 *    transaction would (definite, zero effect) or the exact candidate ids that
 *    need confirmed retirement;
 * 3. receipt-guarded execution: the receipt dispatch mark fires BEFORE the
 *    first retirement (a possible external effect) and also from the intent's
 *    post-commit signal, so a throwing listener/publication after the SQLite
 *    commit is may-have-committed, never a definite failure;
 * 4. the transaction re-reads record, ownership and the store-wide CAS after
 *    every custody await, and an uncertain receipt reconciles only when the
 *    full intended post-state (record AND requested row effects) is proven.
 *
 * The mutation-locality check lives in the HTTP handler: it is a documented
 * LOCALITY gate (a direct loopback peer, never a relay-proxied dial; a
 * co-located paired client or an SSH forward can still satisfy it), not an
 * authentication guarantee. Custody and validation stay correct for any
 * admitted authenticated caller.
 */

export function requireExperimentAuthority(ctx: RemoteServerContext): RemoteExperimentAuthority {
  const authority = ctx.options.experimentAuthority;
  if (!authority) {
    throw new RemoteHttpError(
      "experiment_authority_unavailable",
      "This host does not compose the experiment authority.",
      501,
    );
  }
  return authority;
}

function refusal(code: string, message: string, status: number): RemoteHttpError {
  return new RemoteHttpError(code, message, status);
}

/**
 * Canonicalize the wire command: re-parse the record with `experimentSchema`
 * (the canonical refinements are host-side by design), enforce the path/record
 * identity, and validate the structural thread/row references that need no
 * stored state. Any failure is a definite 400 before any effect.
 */
export function canonicalizeExperimentCommand(
  command: RemoteExperimentCommand,
): DbExperimentIntentCommand {
  if (command.kind === "remove") {
    return {
      kind: "remove",
      experimentId: command.experimentId,
      revision: command.revision,
      candidateDisposition: command.candidateDisposition,
    };
  }

  const parsed = experimentSchema.safeParse(command.record);
  if (!parsed.success || parsed.data.id !== command.experimentId) {
    throw refusal(
      "invalid_experiment",
      "The experiment record is invalid or does not match the request path id.",
      400,
    );
  }
  const record = parsed.data;

  switch (command.kind) {
    case "create": {
      const candidateByThreadId = new Map(
        record.candidates.map((candidate) => [candidate.threadId, candidate]),
      );
      const seen = new Set<string>();
      for (const spec of command.threads) {
        if (seen.has(spec.threadId)) {
          throw refusal("invalid_experiment_threads", "Duplicate candidate thread ids.", 400);
        }
        seen.add(spec.threadId);
        const candidate = candidateByThreadId.get(spec.threadId);
        if (
          !candidate ||
          spec.projectId !== record.projectId ||
          spec.worktreeBranch !== candidate.worktreeBranch
        ) {
          throw refusal(
            "invalid_experiment_threads",
            "Candidate threads must match the record's candidate ids, project, and branches.",
            400,
          );
        }
      }
      if (seen.size !== record.candidates.length) {
        throw refusal(
          "invalid_experiment_threads",
          "Candidate threads must cover exactly the record's candidate ids.",
          400,
        );
      }
      const threads: ExperimentCandidateThreadCreation[] = command.threads.map((spec) => ({
        threadId: spec.threadId,
        projectId: spec.projectId,
        title: spec.title,
        agentKind: spec.agentKind,
        ...(spec.agentInstanceId ? { agentInstanceId: spec.agentInstanceId } : {}),
        config: spec.config,
        ...(spec.presentationMode ? { presentationMode: spec.presentationMode } : {}),
        worktreeBranch: spec.worktreeBranch,
        ...(spec.parentThreadId ? { parentThreadId: spec.parentThreadId } : {}),
      }));
      return { kind: "create", experimentId: command.experimentId, record, threads };
    }
    case "replace": {
      const candidateIds = new Set(record.candidates.map((candidate) => candidate.threadId));
      const rows = command.rows ?? [];
      const seen = new Set<string>();
      for (const row of rows) {
        if (seen.has(row.threadId) || !candidateIds.has(row.threadId)) {
          throw refusal(
            "invalid_candidate_row_update",
            "Candidate row updates must target distinct candidates of the record.",
            400,
          );
        }
        seen.add(row.threadId);
      }
      return {
        kind: "replace",
        experimentId: command.experimentId,
        revision: command.revision,
        record,
        rows,
      };
    }
  }
}

export function readRemoteExperimentState(ctx: RemoteServerContext): RemoteExperimentState {
  requireExperimentAuthority(ctx);
  const read = dbReadExperimentState();
  switch (read.status) {
    case "ok":
      return {
        revision: read.revision,
        experiments: Object.fromEntries(read.experiments.map((record) => [record.id, record])),
      };
    case "unavailable":
      throw refusal(
        "experiment_state_unavailable",
        "The experiment state could not be verified.",
        503,
      );
    case "too_large":
      throw refusal(
        "experiments_too_large",
        "The experiment state exceeds the served byte budget.",
        413,
      );
  }
}

type RefusedOutcome = Exclude<DbExperimentIntentOutcome, { status: "applied" }>;

function outcomeError(outcome: RefusedOutcome): RemoteHttpError {
  switch (outcome.status) {
    case "state_unavailable":
      return refusal(
        "experiment_state_unavailable",
        "The experiment state could not be verified.",
        503,
      );
    case "already_exists":
      return refusal("experiment_exists", "An experiment with this id already exists.", 409);
    case "not_found":
      return refusal("experiment_not_found", "Experiment not found.", 404);
    case "project_missing":
      return refusal("project_not_found", "Project not found.", 404);
    case "project_mismatch":
      return refusal(
        "experiment_project_mismatch",
        "The experiment record's project cannot change.",
        409,
      );
    case "project_removing":
      return refusal("project_removing", "The project is being removed.", 409);
    case "experiment_state_too_large":
      return refusal(
        "experiments_too_large",
        "The experiment state would exceed the accepted byte budget.",
        413,
      );
    case "revision_conflict":
      return refusal(
        "experiment_revision_conflict",
        "The experiment state changed; re-read and rebase the intended change.",
        409,
      );
    case "thread_exists":
      return refusal("thread_exists", "A candidate thread id already exists.", 409);
    case "thread_not_candidate":
      return refusal(
        "thread_not_candidate",
        "The thread is not a candidate of this experiment.",
        409,
      );
    case "thread_project_mismatch":
      return refusal(
        "thread_project_mismatch",
        "The candidate thread belongs to another project.",
        409,
      );
    case "candidate_row_missing":
      return refusal("candidate_row_missing", "A requested candidate row no longer exists.", 409);
    case "candidate_ownership_changed":
      return refusal(
        "candidate_ownership_changed",
        "Candidate ownership is immutable and did not match the stored record.",
        409,
      );
    case "candidate_session_present":
      return refusal(
        "candidate_session_present",
        "The candidate carries a session reference and cannot take a never-launched failure.",
        409,
      );
    case "checkpoint_revert_running":
      return refusal(
        "checkpoint_revert_running",
        "A candidate has a running checkpoint revert and cannot be deleted.",
        409,
      );
  }
}

/** Nested per-thread custody held across retirement AND the final DB mutation. */
async function withCandidateCustody<Result>(
  authority: RemoteExperimentAuthority,
  threadIds: readonly string[],
  run: (ordered: readonly string[]) => Promise<Result>,
): Promise<Result> {
  const ordered = [...new Set(threadIds)].sort();
  if (ordered.length > MAX_EXPERIMENT_CUSTODY_THREADS) {
    throw refusal(
      "too_many_candidates",
      "The custody set exceeds the experiment candidate maximum.",
      400,
    );
  }
  const acquire = (index: number): Promise<Result> => {
    const threadId = ordered[index];
    if (threadId === undefined) return run(ordered);
    return authority.runThreadMutation(threadId, () => acquire(index + 1));
  };
  return acquire(0);
}

async function retireCandidates(
  authority: RemoteExperimentAuthority,
  threadIds: readonly string[],
): Promise<void> {
  for (const threadId of threadIds) {
    const confirmed = await authority.retireThread(threadId);
    if (!confirmed) {
      throw refusal(
        "candidate_retirement_unconfirmed",
        "A candidate runtime could not be confirmed retired; nothing was deleted.",
        409,
      );
    }
  }
}

async function executeExperimentIntent(
  authority: RemoteExperimentAuthority,
  command: DbExperimentIntentCommand,
  retiringThreadIds: readonly string[],
  onCommitted: () => void,
): Promise<DbExperimentIntentOutcome> {
  // Non-retiring commands take the intent's own post-commit signal as the
  // receipt effect boundary (the atomic SQLite write IS the effect).
  if (retiringThreadIds.length === 0) return dbApplyExperimentIntent(command, onCommitted);
  // Retiring commands must mark BEFORE the first possible external effect
  // (confirmed retirement) so a later refusal is never reported as a
  // zero-effect failure merely because the transaction has not committed.
  return withCandidateCustody(authority, retiringThreadIds, async (ordered) => {
    await retireCandidates(authority, ordered);
    return dbApplyExperimentIntent(command, onCommitted);
  });
}

export interface ExperimentCommandReceiptContext {
  readonly commandId: string;
  readonly route: string;
  readonly principalId: string | null;
  readonly requestPayload: unknown;
}

/** Applies one canonical experiment command under the command-id receipt. */
export async function applyRemoteExperimentCommand(
  ctx: RemoteServerContext,
  command: DbExperimentIntentCommand,
  receipt: ExperimentCommandReceiptContext,
): Promise<RemoteExperimentCommandResult> {
  const authority = requireExperimentAuthority(ctx);
  return runRemoteCommand({
    commandId: receipt.commandId,
    route: receipt.route,
    principalId: receipt.principalId,
    requestPayload: receipt.requestPayload,
    operation: async (markDispatched) => {
      // The preflight runs INSIDE the receipt claim: an existing `uncertain`
      // receipt is reconciled (and may answer the typed uncertain 409) before
      // any current-state validation, so a retry of a may-have-committed
      // command is never misreported as a fresh definite refusal. A fresh
      // command's preflight refusal is a definite zero-effect failure (the
      // dispatch mark has not fired).
      const plan = dbPreflightExperimentIntent(command);
      if (plan.status !== "plan") throw outcomeError(plan);
      let marked = false;
      const mark = (): void => {
        if (marked) return;
        marked = true;
        markDispatched();
      };
      if (plan.retiringThreadIds.length > 0) mark();
      const outcome = await executeExperimentIntent(
        authority,
        command,
        plan.retiringThreadIds,
        mark,
      );
      if (outcome.status !== "applied") throw outcomeError(outcome);
      // Publication is post-commit (the intent already fired the commit
      // signal) and exactly once per real execution: a replayed receipt never
      // re-enters the operation.
      if (outcome.touchedThreadIds.length > 0) {
        ctx.publishThreadsChanged(outcome.touchedThreadIds);
      }
      return { ok: true as const, revision: outcome.revision };
    },
    // A receipt written by another build must never leak a non-wire shape.
    mapCompletedResponse: (cached) => remoteExperimentCommandResultSchema.parse(cached),
    reconcileUncertain: () => dbReconcileExperimentIntent(command),
  });
}
