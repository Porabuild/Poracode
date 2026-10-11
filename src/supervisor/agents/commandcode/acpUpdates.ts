import type { SessionNotification } from "@agentclientprotocol/sdk";

/** Native `agent` defaults to the bundled general agent without a subtype. */
export function normalizeCommandCodeSessionUpdate(
  notification: SessionNotification,
): SessionNotification {
  const update = notification.update;
  if (
    (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") ||
    update.title?.toLowerCase() !== "agent" ||
    !update.rawInput ||
    typeof update.rawInput !== "object" ||
    Array.isArray(update.rawInput)
  ) {
    return notification;
  }
  return {
    ...notification,
    update: {
      ...update,
      rawInput: { ...update.rawInput, _toolName: "task" },
    },
  };
}
