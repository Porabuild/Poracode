/**
 * Antigravity ACP prompt-hold detection.
 *
 * `agy_acp_server` does not resolve `session/prompt` while background tasks
 * are alive: its prompt handler drains the SDK step stream, which only ends
 * once the trajectory reaches `STATE_FULLY_IDLE`. After the model's final
 * message the trajectory sits in `STATE_WAITING_FOR_TASKS` until every
 * background task exits — indefinitely for a task that never does (a dev
 * server, a launched app). `session/cancel` does not release the wait either;
 * it only flips the eventual stop reason to `cancelled` once the tasks end.
 *
 * The ACP stream itself carries nothing at that boundary. The only signal the
 * server publishes is a glog diagnostic on stderr mirroring the local-harness
 * WebSocket stream (verified against agy_acp_server_20260818_01_RC01):
 *
 *   I0831 14:08:16.659332 51136 local_connection.py:521] RAW WS MSG:
 *   {"trajectoryStateUpdate":{"trajectoryId":"…", "state":"STATE_WAITING_FOR_TASKS"}, …}
 *
 * This parser feeds the shared session's `stderrTurnSignalParser` capability:
 * on `STATE_WAITING_FOR_TASKS` the runtime turn completes and the thread goes
 * idle while the held prompt resolves later, out of band. If a future server
 * build stops emitting the diagnostic, nothing matches and behavior degrades
 * to the previous state (the turn stays working until the prompt resolves).
 */

const WAITING_FOR_TASKS_RE =
  /"trajectoryStateUpdate"\s*:\s*\{[^}]*"state"\s*:\s*"STATE_WAITING_FOR_TASKS"/;

export function parseAntigravityAcpTurnSignal(line: string): "background-wait" | undefined {
  if (!line.includes("STATE_WAITING_FOR_TASKS")) return undefined;
  return WAITING_FOR_TASKS_RE.test(line) ? "background-wait" : undefined;
}
