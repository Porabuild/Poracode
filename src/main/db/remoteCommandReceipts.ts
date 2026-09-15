import { getSqlite } from "./connection";
import { safeParse } from "./rowMappers";

export type RemoteCommandClaim =
  | { state: "claimed" }
  | { state: "completed"; response: unknown }
  | { state: "in_progress" | "failed" }
  | { state: "conflict" };

export interface RemoteCommandClaimOptions {
  /** Route-specific compatibility for a legacy completed retryable response. */
  isCompletedResponseRetryable?(response: unknown): boolean;
}

export function dbClaimRemoteCommand(
  commandId: string,
  route: string,
  options: RemoteCommandClaimOptions = {},
): RemoteCommandClaim {
  const sqlite = getSqlite();
  const claim = sqlite.transaction((): RemoteCommandClaim => {
    const now = Date.now();
    const existing = sqlite
      .prepare("SELECT route, state, response FROM remote_command_receipts WHERE command_id = ?")
      .get(commandId) as { route: string; state: string; response: string | null } | undefined;
    if (existing) {
      if (existing.route !== route) return { state: "conflict" };
      if (existing.state === "completed") {
        const response = existing.response === null ? null : safeParse(existing.response);
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
        return {
          state: "completed",
          response,
        };
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
      return { state: existing.state === "failed" ? "failed" : "in_progress" };
    }
    sqlite
      .prepare(
        `INSERT INTO remote_command_receipts
           (command_id, route, state, response, created_at, updated_at)
         VALUES (?, ?, 'in_progress', NULL, ?, ?)`,
      )
      .run(commandId, route, now, now);
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
