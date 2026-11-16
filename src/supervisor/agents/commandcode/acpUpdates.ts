import type { SessionNotification } from "@agentclientprotocol/sdk";
import { PORACODE_ACP_SUBAGENT_PROGRESS_META_KEY } from "../acp/canonicalMapping";
import type { AcpExternalSessionUpdateSource, AcpStructuredSession } from "../acp/session";
import { withAcpSubagentParent } from "../acp/subagentCoordinator";

/**
 * Command Code 1.88.2 reports subagent work only as status-less updates on the
 * parent `agent` call whose single text block is `toolName(displayInput)`; it
 * sends no child tool calls, results, or child session. Each such line becomes
 * a completed child tool row under the subagent, so its transcript and step
 * count fill in, and progress metadata on the parent instead of message text.
 * Ordinary prose, unknown calls, and terminal output pass through unchanged.
 */
export class CommandCodeSubagentSteps implements AcpExternalSessionUpdateSource {
  private sessionId: string | undefined;
  private readonly agents = new Map<string, number>();

  constructor(private readonly ingest: (notification: SessionNotification) => void) {}

  onSessionUpdate(notification: SessionNotification): boolean {
    if (this.sessionId !== notification.sessionId) {
      this.agents.clear();
      this.sessionId = notification.sessionId;
    }
    const normalized = normalizeCommandCodeSessionUpdate(notification);
    const update = normalized.update;
    if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") {
      return false;
    }
    if (
      update.sessionUpdate === "tool_call" &&
      update.rawInput &&
      typeof update.rawInput === "object" &&
      "_toolName" in update.rawInput &&
      update.rawInput._toolName === "task" &&
      !this.agents.has(update.toolCallId)
    ) {
      this.agents.set(update.toolCallId, 0);
    }
    if (update.status === "completed" || update.status === "failed") {
      this.agents.delete(update.toolCallId);
      return false;
    }
    const toolUses = this.agents.get(update.toolCallId);
    const block = update.content?.[0];
    if (
      toolUses === undefined ||
      update.sessionUpdate !== "tool_call_update" ||
      update.status != null ||
      update.content?.length !== 1 ||
      block?.type !== "content" ||
      block.content.type !== "text"
    ) {
      return false;
    }
    const description = block.content.text;
    const match = /^([\w.-]+)\([\s\S]*\)$/.exec(description);
    if (!match) return false;
    const step = toolUses + 1;
    this.agents.set(update.toolCallId, step);
    this.ingest(
      withAcpSubagentParent(
        {
          sessionId: notification.sessionId,
          update: {
            sessionUpdate: "tool_call",
            toolCallId: `${update.toolCallId}:step:${step}`,
            title: description,
            kind: "other",
            status: "completed",
          },
        },
        update.toolCallId,
      ),
    );
    this.ingest({
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
            toolUses: step,
          },
        },
      },
    });
    return true;
  }

  dispose(): void {
    this.agents.clear();
  }
}

export function attachCommandCodeSubagentSteps(session: AcpStructuredSession): void {
  session.attachExternalSessionUpdateSource(
    new CommandCodeSubagentSteps((notification) => {
      session.ingestExternalSessionUpdate(notification);
    }),
  );
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
