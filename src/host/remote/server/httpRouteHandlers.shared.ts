import type { IncomingMessage, ServerResponse } from "node:http";
import type { RemoteHttpRouteId } from "@/shared/remote/contract";
import {
  REMOTE_COMMAND_ID_HEADER,
  REMOTE_PROJECT_COMMAND_RESULT_DECLARATION,
  REMOTE_PROJECT_COMMAND_RESULT_HEADER,
} from "@/shared/remote";
import { dbGetCheckpointRevertOperation } from "@/host/db";
import { RemoteHttpError, type AuthenticatedRemoteSession } from "../auth";
import {
  REMOTE_AUDIT_LOG_VERSION,
  type RemoteAuditEvent,
  type RemoteAuditEventDetail,
} from "./auditLog";
import type { ForwardOriginIdentity } from "../portForward/forwardOriginIdentity";
import type { IngressReadClass } from "../remoteAccessServerTypes";
import type { RemoteServerContext } from "./context";

/**
 * Per-route arguments handed to {@link HttpRouteHandler}s.
 *
 * `params` holds the RAW (still percent-encoded) values captured by the route's
 * `{param}` path template; each handler decodes them with exactly the
 * semantics its pre-registry implementation used.
 *
 * `bearerToken` is the authenticated access token when the dispatcher enforced
 * the route's registry scopes (`auth: "bearer"` without procedure-defined
 * scope resolution), and null for every route that owns its own
 * authentication flow. `session` is the authenticated session for the same
 * routes (null otherwise) — the audit trail uses its id to attribute events.
 */
export interface HttpRouteCall {
  readonly ctx: RemoteServerContext;
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly url: URL;
  readonly forwardOrigin: ForwardOriginIdentity | null;
  readonly bearerToken: string | null;
  readonly session: AuthenticatedRemoteSession | null;
  /**
   * B4 read class: `legacy-bulk` marks the unbounded legacy read variants, and
   * the `shell-snapshot` / `thread-history` handlers admit them explicitly
   * (2 global / 1 principal + stored-byte reservation pre-check). Bounded and
   * declared reads stay `normal` on the ordinary B3 budgets.
   */
  readonly readClass: IngressReadClass;
  readonly params: Readonly<Record<string, string>>;
}

export type HttpRouteHandler = (call: HttpRouteCall) => Promise<void> | void;

/**
 * Gate 6 item 4.7 (S7): appends one audit line for a security-relevant route
 * event. The sink is optional (hosts opt in via `RemoteAccessServerOptions
 * .audit`); events are attributed to the authenticated session when the
 * dispatcher enforced one. Recorded before the operation runs, so an append
 * for an event that later fails still reflects the authenticated attempt.
 */
export function auditRouteEvent(
  call: Pick<HttpRouteCall, "ctx" | "session">,
  kind: RemoteAuditEvent["kind"],
  detail?: RemoteAuditEventDetail,
): void {
  call.ctx.options.audit?.record({
    v: REMOTE_AUDIT_LOG_VERSION,
    at: new Date().toISOString(),
    kind,
    ...(call.session ? { sessionId: call.session.sessionId } : {}),
    ...(detail ? { detail } : {}),
  });
}

/**
 * The complete HTTP handler table, keyed by the registry's CLOSED route-id
 * union. This is the structural drift gate: a registry route without a handler
 * here fails typecheck (missing property), and a handler for a route that is
 * not in the registry fails typecheck (excess property). Dispatch iterates the
 * registry's route contracts and looks handlers up by id, so an HTTP path that
 * is not registered can never reach a handler.
 */
export type HttpRouteHandlerTable = {
  readonly [RouteId in RemoteHttpRouteId]: HttpRouteHandler;
};

/**
 * Decodes a matched `{param}` value with the historical thread/project path
 * helpers' semantics: a malformed escape or an encoded "/" produces the same
 * canonical 404 the unmatched-path fallback always produced.
 */
export function requirePathParam(params: Readonly<Record<string, string>>, name: string): string {
  const raw = params[name];
  if (raw) {
    try {
      const decoded = decodeURIComponent(raw);
      if (!decoded.includes("/")) return decoded;
    } catch {
      // Fall through to the canonical not_found below.
    }
  }
  throw new RemoteHttpError("not_found", "Remote endpoint not found.", 404);
}

/**
 * Client-supplied idempotency key for a receipt-guarded mutation. Returns null
 * when the caller did not send one (the command is then not deduped); a
 * malformed value is a definite 400.
 */
export function remoteCommandId(req: IncomingMessage): string | null {
  const raw = req.headers[REMOTE_COMMAND_ID_HEADER];
  const commandId = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!commandId) return null;
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(commandId)) {
    throw new RemoteHttpError("invalid_command_id", "Remote command id is invalid.", 400);
  }
  return commandId;
}

/**
 * Required idempotency key for the unreleased catalog-mutation kinds: their
 * relative semantics are only retry-safe under the caller's per-action id, so
 * the host refuses a missing header BEFORE any effect. The same before-effect
 * requirement covers EVERY kind when the request declares the bounded result
 * mode ({@link remoteProjectCommandResultIsBounded}): the declaration opts into
 * the receipt as the only retry-safety identity. Legacy kinds keep their
 * historical optional behavior; a catalog command is never executed without a
 * durable receipt identity.
 */
export function requireRemoteCommandId(req: IncomingMessage, commandKind: string): string {
  const commandId = remoteCommandId(req);
  if (!commandId) {
    throw new RemoteHttpError(
      "command_id_required",
      `Command "${commandKind}" requires the ${REMOTE_COMMAND_ID_HEADER} header in this mode.`,
      400,
    );
  }
  return commandId;
}

/**
 * Exact per-request declaration of the bounded project-command result mode.
 * Only the exact header value counts (fail closed): an absent, unknown or
 * malformed declaration keeps the complete legacy result, so an old host that
 * ignores the header is never mistaken for a bounded responder by this host
 * path (the client gates on the advertised capability). A declared request
 * requires the command-id header for every kind (see
 * {@link requireRemoteCommandId}), refused before any effect when missing.
 */
export function remoteProjectCommandResultIsBounded(req: IncomingMessage): boolean {
  const raw = req.headers[REMOTE_PROJECT_COMMAND_RESULT_HEADER];
  return (Array.isArray(raw) ? raw[0] : raw) === REMOTE_PROJECT_COMMAND_RESULT_DECLARATION;
}

/**
 * Canonical target validation for a checkpoint-revert outer-receipt hit.
 * The outer `remote_command_receipts` row is keyed by
 * `checkpoint-revert:${operationKey}` and routed by thread path; it does not
 * store the checkpoint item. Before replaying it, bind to the inner journal's
 * frozen target: a same-ID request for a different checkpoint (or thread)
 * conflicts exactly like the journal's hard conflict, with zero side effects.
 * A missing inner row (retention-aged or pre-journal legacy receipt) replays
 * the outer frozen result rather than starting a new mutation. The replay
 * marks `replayed:true` so HTTP agrees with local-direct replay semantics.
 */
export function mapCheckpointRevertCompletedResponse<T>(
  payload: { threadId: string; checkpointItemId: string; operationKey: string },
  cached: T,
): T {
  const inner = dbGetCheckpointRevertOperation(payload.operationKey);
  if (inner) {
    if (
      inner.threadId !== payload.threadId ||
      inner.checkpointItemId !== payload.checkpointItemId
    ) {
      throw new RemoteHttpError(
        "command_id_conflict",
        "Remote command id was already used for another operation.",
        409,
      );
    }
  }
  if (cached !== null && typeof cached === "object" && "replayed" in cached) {
    return { ...(cached as Record<string, unknown>), replayed: true } as T;
  }
  return cached;
}
