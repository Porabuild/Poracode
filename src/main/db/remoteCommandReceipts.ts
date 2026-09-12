import { getSqlite } from "./connection";
import { safeParse } from "./rowMappers";

export type RemoteCommandClaim =
  | { state: "claimed" }
  | { state: "completed"; response: unknown }
  | { state: "in_progress" | "failed" }
  | { state: "conflict" };

export function dbClaimRemoteCommand(commandId: string, route: string): RemoteCommandClaim {
  const sqlite = getSqlite();
  const claim = sqlite.transaction((): RemoteCommandClaim => {
    const now = Date.now();
    const existing = sqlite
      .prepare("SELECT route, state, response FROM remote_command_receipts WHERE command_id = ?")
      .get(commandId) as { route: string; state: string; response: string | null } | undefined;
    if (existing) {
      if (existing.route !== route) return { state: "conflict" };
      if (existing.state === "completed") {
        return {
          state: "completed",
          response: existing.response === null ? null : safeParse(existing.response),
        };
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
