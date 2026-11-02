import type { SessionNotification } from "@agentclientprotocol/sdk";
import { PORACODE_ACP_SUBAGENT_PROGRESS_META_KEY } from "../acp/canonicalMapping";

export function createCommandCodeSessionUpdateTransform() {
  let sessionId: string | undefined;
  const agents = new Map<string, number>();
  return (notification: SessionNotification): SessionNotification => {
    if (sessionId !== notification.sessionId) {
      agents.clear();
      sessionId = notification.sessionId;
    }
    const normalized = normalizeCommandCodeSessionUpdate(notification);
    const update = normalized.update;
    if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") {
      return normalized;
    }
    if (
      update.sessionUpdate === "tool_call" &&
      update.rawInput &&
      typeof update.rawInput === "object" &&
      "_toolName" in update.rawInput &&
      update.rawInput._toolName === "task"
    ) {
      agents.set(update.toolCallId, 0);
    }
    if (update.status === "completed" || update.status === "failed") {
      agents.delete(update.toolCallId);
      return normalized;
    }
    // Command Code 1.88.2 emits subagent_progress as a status-less parent
    // update containing only `toolName(displayInput)`. It is activity, not
    // assistant prose or a tool result. Terminal content remains unchanged.
    const toolUses = agents.get(update.toolCallId);
    const block = update.content?.[0];
    if (
      toolUses === undefined ||
      update.sessionUpdate !== "tool_call_update" ||
      update.status != null ||
      update.content?.length !== 1 ||
      block?.type !== "content" ||
      block.content.type !== "text"
    ) {
      return normalized;
    }
    const description = block.content.text;
    const match = /^([\w.-]+)\([\s\S]*\)$/.exec(description);
    if (!match) return normalized;
    agents.set(update.toolCallId, toolUses + 1);
    return {
      ...normalized,
      update: {
        ...update,
        content: [],
        _meta: {
          ...update._meta,
          [PORACODE_ACP_SUBAGENT_PROGRESS_META_KEY]: {
            description,
            summary: description,
            lastToolName: match[1],
            toolUses: toolUses + 1,
          },
        },
      },
    };
  };
}

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
