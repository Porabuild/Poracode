/** Host-internal authority. Deliberately absent from database.ts/databaseRpc exports. */
import { z } from "zod";
import {
  parseSavedWorkspaceDirectories,
  workspaceDirectorySelectionSchema,
  workspaceGrantRevisionSchema,
} from "@/shared/workspaceDirectorySelection";
import { getSqlite } from "./connection";
import { notifyProjectThreadDataChanged } from "./projectThreadChanges";
import {
  MAX_WORKSPACE_GRANT_OWNER_CHARS,
  MAX_WORKSPACE_GRANT_TOKEN_CHARS,
} from "./threadWorkspaceGrantsSchema";

export type WorkspaceGrantOperationState =
  | "pending"
  | "dispatched"
  | "committed"
  | "ambiguous"
  | "failed";
export interface WorkspaceGrantOperation {
  threadId: string;
  operationToken: string;
  expectedRevision: number;
  /** Exact database owner snapshot, not a caller-supplied primary path. */
  owner: string;
  candidate: z.infer<typeof workspaceDirectorySelectionSchema>;
  state: WorkspaceGrantOperationState;
}
interface OperationRow {
  thread_id: string;
  operation_token: string;
  expected_revision: number;
  owner_json: string;
  candidate_json: string;
  state: WorkspaceGrantOperationState;
}

const tokenSchema = z
  .string()
  .min(1)
  .max(MAX_WORKSPACE_GRANT_TOKEN_CHARS)
  .regex(/^[A-Za-z0-9._:-]+$/);
const ownerSchema = z.string().min(1).max(MAX_WORKSPACE_GRANT_OWNER_CHARS);

/** Capture authoritative identity, project location, worktree and execution ownership. */
export function dbReadThreadWorkspaceGrantOwner(threadId: string): {
  owner: string;
  revision: number;
  /** Owner-only revisions never opt legacy threads into an explicitly committed scope. */
  hasCommittedScope: boolean;
  additionalDirectories: z.infer<typeof workspaceDirectorySelectionSchema>;
} {
  const row = getSqlite()
    .prepare(`SELECT
      t.additional_directories, t.workspace_grant_revision,
      t.workspace_owner_incarnation, t.workspace_grants_initialized,
      json_array(t.id, t.created_at, t.project_id, p.created_at,
        p.location_kind, p.location_path, p.location_distro, p.location_linux_path, p.location_unc_path,
        t.worktree_path, t.agent_kind, t.agent_instance_id, t.presentation_mode,
        json_extract(t.config, '$.executionEnvironment'),
        t.workspace_owner_incarnation, t.workspace_grant_revision) AS owner
    FROM threads t JOIN projects p ON p.id = t.project_id WHERE t.id = ?`)
    .get(threadId) as
    | {
        additional_directories: string;
        workspace_grant_revision: number;
        workspace_owner_incarnation: string;
        workspace_grants_initialized: number;
        owner: string;
      }
    | undefined;
  if (!row) throw new Error("Workspace grant owner does not exist");
  const revision = workspaceGrantRevisionSchema.parse(row.workspace_grant_revision);
  const additionalDirectories = parseSavedWorkspaceDirectories(row.additional_directories);
  if (
    typeof row.workspace_owner_incarnation !== "string" ||
    !/^[0-9a-f]{32}$/.test(row.workspace_owner_incarnation) ||
    (row.workspace_grants_initialized !== 0 && row.workspace_grants_initialized !== 1) ||
    (row.workspace_grants_initialized === 0 && additionalDirectories.length > 0) ||
    (row.workspace_grants_initialized === 1 && revision === 0)
  ) {
    throw new Error("Invalid workspace grant owner metadata");
  }
  return {
    owner: ownerSchema.parse(row.owner),
    revision,
    hasCommittedScope: row.workspace_grants_initialized === 1,
    additionalDirectories,
  };
}

export function dbGetThreadWorkspaceGrantOperation(
  threadId: string,
  operationToken: string,
): WorkspaceGrantOperation | null {
  const row = getSqlite()
    .prepare(
      "SELECT * FROM thread_workspace_grant_operations WHERE thread_id = ? AND operation_token = ?",
    )
    .get(threadId, tokenSchema.parse(operationToken)) as OperationRow | undefined;
  if (!row) return null;
  return {
    threadId: row.thread_id,
    operationToken: row.operation_token,
    expectedRevision: workspaceGrantRevisionSchema.parse(row.expected_revision),
    owner: ownerSchema.parse(row.owner_json),
    candidate: parseSavedWorkspaceDirectories(row.candidate_json),
    state: row.state,
  };
}

/** Recovery reads unresolved custody only; it must reconcile effects before releasing it. */
export function dbGetUnresolvedThreadWorkspaceGrantOperation(
  threadId: string,
): WorkspaceGrantOperation | null {
  const row = getSqlite()
    .prepare(`SELECT operation_token FROM thread_workspace_grant_operations
    WHERE thread_id = ? AND state IN ('pending', 'dispatched', 'ambiguous')`)
    .get(threadId) as { operation_token: string } | undefined;
  return row ? dbGetThreadWorkspaceGrantOperation(threadId, row.operation_token) : null;
}

function assertOwner(threadId: string, owner: string, revision: number): void {
  const current = dbReadThreadWorkspaceGrantOwner(threadId);
  if (current.owner !== owner || current.revision !== revision) {
    throw new Error("Workspace grant owner or revision conflict");
  }
}

/**
 * Inputs must already be canonically validated by the future host service/runtime.
 * This store checks structure/custody only; it never infers runtime open success.
 * Same-body replay returns its recorded state and never repeats runtime effects.
 */
export function dbBeginThreadWorkspaceGrantOperation(
  input: Omit<WorkspaceGrantOperation, "state">,
): WorkspaceGrantOperation {
  const operationToken = tokenSchema.parse(input.operationToken);
  const expectedRevision = workspaceGrantRevisionSchema
    .max(Number.MAX_SAFE_INTEGER - 1)
    .parse(input.expectedRevision);
  const owner = ownerSchema.parse(input.owner);
  const candidate = workspaceDirectorySelectionSchema.parse(input.candidate);
  return getSqlite()
    .transaction(() => {
      const existing = dbGetThreadWorkspaceGrantOperation(input.threadId, operationToken);
      if (existing) {
        if (
          existing.owner !== owner ||
          existing.expectedRevision !== expectedRevision ||
          JSON.stringify(existing.candidate) !== JSON.stringify(candidate)
        ) {
          throw new Error("Workspace grant operation token conflict");
        }
        return existing;
      }
      assertOwner(input.threadId, owner, expectedRevision);
      getSqlite()
        .prepare(`INSERT INTO thread_workspace_grant_operations
      (thread_id, operation_token, expected_revision, owner_json, candidate_json, state)
      VALUES (?, ?, ?, ?, ?, 'pending')`)
        .run(input.threadId, operationToken, expectedRevision, owner, JSON.stringify(candidate));
      return {
        threadId: input.threadId,
        operationToken,
        expectedRevision,
        owner,
        candidate,
        state: "pending" as const,
      };
    })
    .immediate();
}

function requireOperation(threadId: string, operationToken: string): WorkspaceGrantOperation {
  const operation = dbGetThreadWorkspaceGrantOperation(threadId, operationToken);
  if (!operation) throw new Error("Workspace grant operation token not found");
  return operation;
}

/** Mark before the first external effect. No retry or transition out of ambiguity to dispatch. */
export function dbMarkThreadWorkspaceGrantDispatched(
  threadId: string,
  operationToken: string,
): void {
  getSqlite()
    .transaction(() => {
      const operation = requireOperation(threadId, operationToken);
      if (operation.state !== "pending")
        throw new Error("Workspace grant operation is not pending");
      assertOwner(threadId, operation.owner, operation.expectedRevision);
      getSqlite()
        .prepare(
          "UPDATE thread_workspace_grant_operations SET state = 'dispatched' WHERE thread_id = ? AND operation_token = ? AND state = 'pending'",
        )
        .run(threadId, operationToken);
    })
    .immediate();
}

/** Atomic CAS publication. Caller must hold runtime reservation and confirmed quiescent open. */
export function dbCommitThreadWorkspaceGrants(threadId: string, operationToken: string): number {
  const revision = getSqlite()
    .transaction(() => {
      const operation = requireOperation(threadId, operationToken);
      if (operation.state !== "dispatched")
        throw new Error("Workspace grant operation is not dispatched");
      assertOwner(threadId, operation.owner, operation.expectedRevision);
      const result = getSqlite()
        .prepare(`UPDATE threads SET additional_directories = ?, workspace_grant_revision = workspace_grant_revision + 1,
        workspace_grants_initialized = 1
      WHERE id = ? AND workspace_grant_revision = ?`)
        .run(JSON.stringify(operation.candidate), threadId, operation.expectedRevision);
      if (result.changes !== 1) throw new Error("Workspace grant revision conflict");
      getSqlite()
        .prepare(
          "UPDATE thread_workspace_grant_operations SET state = 'committed' WHERE thread_id = ? AND operation_token = ? AND state = 'dispatched'",
        )
        .run(threadId, operationToken);
      return operation.expectedRevision + 1;
    })
    .immediate();
  notifyProjectThreadDataChanged();
  return revision;
}

/**
 * 'failed' asserts positive no-effect/retirement evidence, including during recovery.
 * Uncertain disposal MUST use 'ambiguous', which retains exclusive custody.
 * No error payload is persisted; candidates and tokens remain bounded.
 */
export function dbSettleThreadWorkspaceGrantFailure(
  threadId: string,
  operationToken: string,
  state: "ambiguous" | "failed",
): void {
  z.enum(["ambiguous", "failed"]).parse(state);
  getSqlite()
    .transaction(() => {
      const operation = requireOperation(threadId, operationToken);
      if (
        operation.state === "committed" ||
        operation.state === "failed" ||
        (state === "ambiguous" && operation.state !== "dispatched")
      ) {
        throw new Error("Invalid workspace grant failure transition");
      }
      getSqlite()
        .prepare(
          "UPDATE thread_workspace_grant_operations SET state = ? WHERE thread_id = ? AND operation_token = ? AND state = ?",
        )
        .run(state, threadId, operationToken, operation.state);
    })
    .immediate();
}
