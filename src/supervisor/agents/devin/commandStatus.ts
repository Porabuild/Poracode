import type { SessionNotification } from "@agentclientprotocol/sdk";
import { record } from "./acpRecord";
import { withAcpCommandStatus } from "../acp/canonicalMapping/commandStatus";

const EXEC_TOOL_META_KEY = "cognition.ai/inferenceToolName";

/**
 * Annotate only live exec completion status formats (`Exited with code N`,
 * `Command timed out[ after Nms with no output]`, or `Canceled due to user interrupt`);
 * anything else is the agent's own output and stays unannotated.
 */
export function annotateDevinCommandStatus(notification: SessionNotification): SessionNotification {
  const update = record(notification.update);
  if (
    (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") ||
    (update.status !== "completed" && update.status !== "failed")
  ) {
    return notification;
  }
  if (record(update._meta)[EXEC_TOOL_META_KEY] !== "exec") return notification;
  const content = update.content;
  if (!Array.isArray(content) || content.length !== 1) return notification;
  const entry = record(content[0]);
  if (entry.type !== "content") return notification;
  const block = record(entry.content);
  if (block.type !== "text" || typeof block.text !== "string") return notification;
  const text = block.text.trim();
  const exitCode = /^Exited with code (-?\d+)$/.exec(text);
  if (exitCode) return withAcpCommandStatus(notification, { exitCode: Number(exitCode[1]) });
  if (
    text === "Command timed out" ||
    /^Command timed out after \d+ms with no output$/.test(text) ||
    text === "Canceled due to user interrupt"
  ) {
    return withAcpCommandStatus(notification, {});
  }
  return notification;
}
