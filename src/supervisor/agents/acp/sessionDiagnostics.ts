/**
 * Diagnostic capture of inbound ACP `session/update` notifications.
 *
 * Off by default. Set `PORACODE_ACP_LOG=toolcalls` to capture just
 * `tool_call` / `tool_call_update` updates (what we use to design
 * per-adapter wire-format transforms); set `PORACODE_ACP_LOG=full` to
 * capture every update. Each line is a self-contained JSON object written
 * to the channel's `logs/acp-sessions.jsonl`.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { resolvePoracodePaths } from "@/shared/poracodePaths";

const ACP_LOG_MODE = (() => {
  const mode = process.env.PORACODE_ACP_LOG;
  return mode === "toolcalls" || mode === "full" ? mode : null;
})();
let acpLogDirEnsured = false;

export function maybeCaptureAcpUpdate(
  params: SessionNotification,
  threadId: string,
  sessionId: string | undefined,
  cwd: string,
): void {
  if (ACP_LOG_MODE === null) return;
  const kind = params.update.sessionUpdate;
  if (ACP_LOG_MODE === "toolcalls" && kind !== "tool_call" && kind !== "tool_call_update") return;
  try {
    const dir = resolvePoracodePaths(process.env.PORACODE_DATA_DIR).logsDir;
    if (!acpLogDirEnsured) {
      mkdirSync(dir, { recursive: true });
      acpLogDirEnsured = true;
    }
    const line = `${JSON.stringify({
      ts: new Date().toISOString(),
      threadId,
      sessionId,
      cwd,
      notification: params,
    })}\n`;
    appendFileSync(join(dir, "acp-sessions.jsonl"), line, "utf8");
  } catch {
    // capture is best-effort and must never break a session
  }
}
