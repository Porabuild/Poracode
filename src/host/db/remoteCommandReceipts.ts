import { getSqlite } from "./connection";
import { safeParse } from "./rowMappers";

/**
 * Identity a receipt is bound to. `principalId` is the stable remote auth
 * session id (it survives access-token refresh and socket reconnect), `route`
 * is the canonical operation+target pathname, and `requestDigest` is the
 * canonical validated request body digest. A row written before this binding
 * existed has NULL identity columns and is never attributed to a later caller.
 */
export interface RemoteCommandReceiptIdentity {
  readonly route: string;
  readonly principalId: string | null;
  readonly requestDigest: string | null;
}

export type RemoteCommandClaim =
  | { state: "claimed" }
  | { state: "completed"; response: unknown }
  | { state: "in_progress" | "failed" | "conflict" }
  /**
   * The command was interrupted (or predates identity binding) and no durable
   * proof of its external outcome exists. `bound` is true only when the
   * receipt's stored principal+digest matched this request; only then may a
   * route reconcile hook run.
   */
  | { state: "uncertain"; bound: boolean };

export interface RemoteCommandClaimOptions {
  /** Route-specific compatibility for a legacy completed retryable response. */
  isCompletedResponseRetryable?(response: unknown): boolean;
  /**
   * Vouches for an unbound (pre-binding) completed receipt: return true only
   * when an independent durable journal proves the frozen response belongs to
   * this exact request. Row presence alone is never proof. A vouched replay is
   * served without binding the row to the claiming principal.
   */
  isLegacyCompletedResponseReplayable?(response: unknown): boolean;
}

interface ReceiptRow {
  route: string;
  state: string;
  response: string | null;
  principal_id: string | null;
  request_digest: string | null;
}

function readResponse(row: ReceiptRow): unknown {
  return row.response === null ? null : safeParse(row.response);
}

export function dbClaimRemoteCommand(
  commandId: string,
  identity: RemoteCommandReceiptIdentity,
  options: RemoteCommandClaimOptions = {},
): RemoteCommandClaim {
  const sqlite = getSqlite();
  const claim = sqlite.transaction((): RemoteCommandClaim => {
    const now = Date.now();
    const existing = sqlite
      .prepare(
        `SELECT route, state, response, principal_id, request_digest
         FROM remote_command_receipts WHERE command_id = ?`,
      )
      .get(commandId) as ReceiptRow | undefined;
    if (existing) {
      if (existing.route !== identity.route) return { state: "conflict" };
      if (existing.principal_id !== null) {
        // Bound row: identity must match exactly. A different principal or a
        // different validated body never sees the cached response.
        if (
          identity.principalId === null ||
          identity.principalId !== existing.principal_id ||
          identity.requestDigest === null ||
          existing.request_digest !== identity.requestDigest
        ) {
          return { state: "conflict" };
        }
      } else if (identity.principalId !== null) {
        // Bound claim against a pre-binding row. Never attribute the legacy
        // row to this principal; only an explicit route validator may vouch
        // for replaying its frozen response.
        switch (existing.state) {
          case "completed": {
            const response = readResponse(existing);
            if (options.isCompletedResponseRetryable?.(response)) {
              // The operation journal owns retryable phases; the same-ID retry
              // resumes them instead of replaying the stale failure.
              return { state: "claimed" };
            }
            if (options.isLegacyCompletedResponseReplayable?.(response)) {
              return { state: "completed", response };
            }
            return { state: "uncertain", bound: false };
          }
          case "retryable":
            // An explicit application-level release: the journal owns the
            // resume, exactly like the retryable-response path above.
            return { state: "claimed" };
          case "failed":
            return { state: "failed" };
          default:
            // Legacy `in_progress` (preserved as `uncertain` by v47/startup)
            // and `uncertain` rows have no provable outcome.
            return { state: "uncertain", bound: false };
        }
      }
      if (existing.state === "completed") {
        const response = readResponse(existing);
        if (options.isCompletedResponseRetryable?.(response)) {
          sqlite
            .prepare(
              `UPDATE remote_command_receipts
               SET state = 'in_progress', response = NULL, updated_at = ?
               WHERE command_id = ?`,
            )
            .run(now, commandId);
          return { state: "claimed" };
        }
        return { state: "completed", response };
      }
      if (existing.state === "retryable") {
        sqlite
          .prepare(
            `UPDATE remote_command_receipts
             SET state = 'in_progress', response = NULL, updated_at = ?
             WHERE command_id = ?`,
          )
          .run(now, commandId);
        return { state: "claimed" };
      }
      if (existing.state === "failed") return { state: "failed" };
      if (existing.state === "uncertain") {
        return { state: "uncertain", bound: existing.principal_id !== null };
      }
      return { state: "in_progress" };
    }
    sqlite
      .prepare(
        `INSERT INTO remote_command_receipts
           (command_id, route, state, response, principal_id, request_digest, created_at, updated_at)
         VALUES (?, ?, 'in_progress', NULL, ?, ?, ?, ?)`,
      )
      .run(commandId, identity.route, identity.principalId, identity.requestDigest, now, now);
    return { state: "claimed" };
  });
  return claim.immediate();
}

export function dbCompleteRemoteCommand(commandId: string, response: unknown): void {
  getSqlite()
    .prepare(
      `UPDATE remote_command_receipts
       SET state = 'completed', response = ?, updated_at = ?
       WHERE command_id = ?`,
    )
    .run(JSON.stringify(response ?? null), Date.now(), commandId);
}

export function dbFailRemoteCommand(commandId: string): void {
  getSqlite()
    .prepare(
      `UPDATE remote_command_receipts
       SET state = 'failed', updated_at = ?
       WHERE command_id = ?`,
    )
    .run(Date.now(), commandId);
}

/**
 * Records that a dispatched operation's external outcome could not be
 * established (crash or failure after the dispatch boundary). The row keeps
 * its bound identity and stays blocked until a route reconcile hook or a new
 * explicit command id resolves it — it is never re-executed blindly.
 */
export function dbMarkRemoteCommandUncertain(commandId: string): void {
  getSqlite()
    .prepare(
      `UPDATE remote_command_receipts
       SET state = 'uncertain', updated_at = ?
       WHERE command_id = ? AND state IN ('in_progress', 'uncertain')`,
    )
    .run(Date.now(), commandId);
}

/**
 * Release a receipt whose operation returned a retryable application failure.
 * The operation's own journal remains authoritative, so a deterministic retry
 * can reclaim the same command ID and resume its idempotent phases.
 */
export function dbResetRemoteCommand(commandId: string): void {
  getSqlite()
    .prepare(
      `UPDATE remote_command_receipts
       SET state = 'retryable', response = NULL, updated_at = ?
       WHERE command_id = ?`,
    )
    .run(Date.now(), commandId);
}
