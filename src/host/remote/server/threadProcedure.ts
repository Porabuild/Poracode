import { REMOTE_AUDIT_LOG_VERSION } from "./auditLog";
import type { IncomingMessage } from "node:http";
import {
  REMOTE_PROCEDURE_SPECS,
  isRemoteProcedure,
  remoteGitCallPayloadSchema,
} from "@/shared/remote";
import type { Project, ProjectLocation, Thread } from "@/shared/contracts";
import type { IpcProcedurePayload, SupervisorProcedureName } from "@/shared/ipc";
import { ipcProcedureMap, parseRemoteProcedureResultValue } from "@/shared/ipc";
import { FILE_SAVE_CONFLICT_MESSAGE } from "@/shared/fileSaveErrors";
import { isHostResourceAdmissionRefusal } from "@/shared/hostResourceAdmission";
import { dbGetProjects, dbGetThreads } from "@/host/db";
import { RemoteHttpError } from "../auth";
import { buildWorktreeLocation } from "@/shared/worktree";
import { assertRemoteGitMutationExperimentSafe } from "../experimentOwnership";
import type { RemoteServerContext } from "./context";
import { remoteCommandId } from "./httpRouteHandlers.shared";
import { readJsonBody } from "./requestBody";
import { runRemoteCommand } from "./remoteCommandIdempotency";

/**
 * Generic desktop-supervisor passthrough. The PWA reuses desktop-backed
 * surfaces which call bridge methods directly; rather than a REST route per
 * method, the client posts `{ procedure, payload }` here. Only allowlisted
 * procedures are accepted, each gated by its required scope and validated
 * against its own payload schema before reaching the supervisor.
 */
export async function runRemoteProcedure(
  ctx: RemoteServerContext,
  req: IncomingMessage,
): Promise<unknown> {
  // Reject unauthenticated callers BEFORE reading/parsing the body or revealing
  // whether a procedure is allowlisted. Otherwise an unauthenticated request can
  // distinguish a known-but-invalid procedure (403) from a known one (401) — a
  // pre-auth enumeration oracle — and forces the server to buffer+parse up to
  // 1MB per unauthenticated request. `[]` requires only a valid token (no scope);
  // the per-procedure scope is still enforced below once the procedure is known.
  ctx.security.requireBearer(req, []);
  const { procedure, payload } = remoteGitCallPayloadSchema.parse(await readJsonBody(req));
  if (!isRemoteProcedure(procedure)) {
    throw new RemoteHttpError(
      "git_procedure_not_allowed",
      `Procedure "${procedure}" is not available to remote clients.`,
      403,
    );
  }
  ctx.security.requireBearer(req, [REMOTE_PROCEDURE_SPECS[procedure].scope]);
  // Deep-review fix (S7 coverage): the procedure passthrough is the remote
  // surface's most powerful route (pushes, PR merges, project/file writes,
  // deletions) and previously recorded no audit line while far weaker events
  // did. One line per call, attributed to the authenticated session.
  ctx.options.audit?.record({
    v: REMOTE_AUDIT_LOG_VERSION,
    at: new Date().toISOString(),
    kind: "procedure",
    sessionId: ctx.security.requireBearerSession(req, []).session.sessionId,
    detail: { procedure },
  });
  // R1: the allowlist is supervisor-typed (`REMOTE_PROCEDURE_SPECS` is
  // constrained to `SupervisorProcedureName`), so no main-local IPC procedure
  // can reach this dispatch anymore. The check below is the fail-closed
  // runtime backstop for that invariant: if a future regression re-admits a
  // main-local name, it is refused typed instead of being cast to a supervisor
  // procedure the supervisor cannot answer (the old silent HTTP 500).
  if (ipcProcedureMap[procedure].transport !== "supervisor") {
    throw new RemoteHttpError(
      "git_procedure_not_allowed",
      `Procedure "${procedure}" is not a supervisor procedure.`,
      403,
    );
  }
  // Annotated (not cast) on purpose: the assignment only type-checks while the
  // allowlist stays supervisor-typed.
  const name: SupervisorProcedureName = procedure;
  const parsedPayload = ipcProcedureMap[name].payloadSchema.parse(payload) as IpcProcedurePayload<
    typeof name
  >;
  assertRegisteredProjectEntryLocation(procedure, parsedPayload);
  assertRemoteGitMutationExperimentSafe(procedure, parsedPayload);
  const resultSchema = ipcProcedureMap[name].resultSchema;
  if (!resultSchema) {
    throw new RemoteHttpError(
      "git_procedure_result_schema_missing",
      `Procedure "${procedure}" is missing an authoritative result schema.`,
      500,
    );
  }
  let raw: unknown;
  try {
    // `startThread` is delivered through this generic passthrough on the
    // managed-loopback and browser legs. Wrap that one effect in the same
    // crash-aware receipt authority its dedicated route uses, keyed by the
    // client's stable command id and this session: a crash after dispatch
    // surfaces as the typed uncertain outcome and is never blindly repeated.
    // No reconcile hook exists for a start (no durable provider-acceptance
    // proof), so an unresolved receipt stays uncertain. Every other procedure
    // keeps the existing unwrapped passthrough semantics.
    if (name === "startThread") {
      // `name === "startThread"` already selected the start payload schema, so
      // the validated union narrows to the start payload here.
      const startPayload = parsedPayload as IpcProcedurePayload<"startThread">;
      const principalId = ctx.security.requireBearerSession(req, []).session.sessionId;
      raw = await runRemoteCommand({
        commandId: remoteCommandId(req),
        route: `procedure:${name}`,
        principalId,
        requestPayload: startPayload,
        // The whole operation is the supervisor call: the B1 pre-launch touch
        // is evidence, not a command effect, and the supervisor refuses a
        // capacity/policy admission before teardown or queue mutation. An
        // admission refusal here is therefore a definite failure (429).
        isPreEffectFailure: isHostResourceAdmissionRefusal,
        operation: (markDispatched) => {
          markDispatched();
          return ctx.options.callSupervisor("startThread", startPayload);
        },
      });
    } else {
      raw = await ctx.options.callSupervisor(name, parsedPayload);
    }
  } catch (error) {
    throw mapSupervisorProcedureError(name, error);
  }
  try {
    // `unknown` is explicit: the schema here is the supervisor allowlist's
    // result-schema union, and inference over that union is not stable — the
    // route's own return type is `unknown` anyway.
    return parseRemoteProcedureResultValue<unknown>(resultSchema, raw);
  } catch {
    throw new RemoteHttpError(
      "invalid_procedure_result",
      `Procedure "${procedure}" returned a result that does not match its contract.`,
      500,
    );
  }
}

/** The only procedures whose known domain error is mapped for remote clients. */
const FILE_SAVE_PROCEDURES = new Set<string>(["writeProjectFile", "writeExternalFile"]);

/**
 * Supervisor IPC preserves typed admission refusals and otherwise serializes
 * failures as plain `error.message` strings (see `handleSupervisorIpcFailure`).
 * Typed admission errors pass through for the central HTTP mapper. For the
 * editor-save procedures only, the save-conflict domain message is recognized
 * by exact equality with the canonical constant and re-emitted as an
 * actionable `409 file_save_conflict`. Every other failure is returned
 * untouched so `writeError` keeps redacting it as a generic 500; supervisor
 * internals must never leak through this boundary.
 */
function mapSupervisorProcedureError(procedure: string, error: unknown): unknown {
  if (
    FILE_SAVE_PROCEDURES.has(procedure) &&
    error instanceof Error &&
    error.message === FILE_SAVE_CONFLICT_MESSAGE
  ) {
    return new RemoteHttpError("file_save_conflict", FILE_SAVE_CONFLICT_MESSAGE, 409);
  }
  return error;
}

const PROJECT_ENTRY_PROCEDURES = new Set([
  "createProjectEntry",
  "renameProjectEntry",
  "moveProjectEntry",
  "deleteProjectEntry",
]);

function assertRegisteredProjectEntryLocation(procedure: string, payload: unknown): void {
  if (!PROJECT_ENTRY_PROCEDURES.has(procedure)) return;
  const location = (payload as { projectLocation?: ProjectLocation }).projectLocation;
  if (!location) {
    throw new RemoteHttpError(
      "project_location_not_registered",
      "Project location is missing.",
      403,
    );
  }
  let projects: Project[];
  let threads: Thread[];
  try {
    projects = dbGetProjects();
    threads = dbGetThreads();
  } catch {
    throw new RemoteHttpError(
      "project_registry_unavailable",
      "Project ownership could not be verified.",
      503,
    );
  }
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const registered = projects.some((project) => sameProjectLocation(project.location, location));
  const ownedWorktree = threads.some((thread) => {
    const project = projectById.get(thread.projectId);
    return Boolean(
      project &&
      thread.worktreePath &&
      sameProjectLocation(buildWorktreeLocation(project.location, thread.worktreePath), location),
    );
  });
  if (!registered && !ownedWorktree) {
    throw new RemoteHttpError(
      "project_location_not_registered",
      "Project location is not registered on this desktop.",
      403,
    );
  }
}

function sameProjectLocation(left: ProjectLocation, right: ProjectLocation): boolean {
  if (left.kind !== right.kind || left.remoteServerId !== right.remoteServerId) return false;
  if (left.kind === "wsl" && right.kind === "wsl") {
    return (
      left.distro.toLowerCase() === right.distro.toLowerCase() &&
      normalizeOwnedPath(left.linuxPath, false) === normalizeOwnedPath(right.linuxPath, false)
    );
  }
  if (left.kind === "windows" && right.kind === "windows") {
    return normalizeOwnedPath(left.path, true) === normalizeOwnedPath(right.path, true);
  }
  return (
    left.kind === "posix" &&
    right.kind === "posix" &&
    normalizeOwnedPath(left.path, false) === normalizeOwnedPath(right.path, false)
  );
}

function normalizeOwnedPath(path: string, caseInsensitive: boolean): string {
  const normalized = path.replace(/\\/gu, "/").replace(/\/+$/u, "") || "/";
  return caseInsensitive ? normalized.toLowerCase() : normalized;
}
