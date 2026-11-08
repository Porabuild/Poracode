import type { SessionNotification } from "@agentclientprotocol/sdk";
import type { AcpExternalSessionUpdateSource, AcpStructuredSession } from "../../acp/session";
import { record } from "../acpRecord";

/**
 * Lead output can only follow the tool results of its launch batch. Usage,
 * title, mode, and command bookkeeping can arrive at any time, so it never
 * ends the batch.
 */
const LEAD_OUTPUT = new Set([
  "agent_message_chunk",
  "agent_thought_chunk",
  "user_message_chunk",
  "tool_call",
  "tool_call_update",
  "plan",
]);

/**
 * Devin acknowledges a background `run_subagent` launch and announces its
 * native agent (`cognition.ai/subagent_started`) separately, and in a parallel
 * batch a later launch's acknowledgement can arrive first (3000.12.28,
 * fixtures/subagent-background-streamed.json). The transform binds a native
 * agent only from its start, so that acknowledgement would complete the card
 * as an ordinary tool call. The child then has no running parent, and its
 * reasoning and report stream into the lead transcript, splitting the lead's
 * own thinking and messages into fragments.
 *
 * Hold such an acknowledgement and replay it right after the start that binds
 * its call, the order the transform already handles. The next lead output or
 * the turn end releases anything still held unchanged.
 */
export class DevinSubagentLaunchOrder implements AcpExternalSessionUpdateSource {
  private readonly held = new Map<string, SessionNotification>();

  constructor(
    private readonly ingest: (notification: SessionNotification) => void,
    private readonly awaitsNativeStart: (toolCallId: string) => boolean,
    private readonly isReplayingHistory: () => boolean,
  ) {}

  onSessionUpdate(notification: SessionNotification): boolean {
    if (this.isReplayingHistory()) return false;
    const update = notification.update as Record<string, unknown>;
    const meta = record(update._meta);
    if (meta["cognition.ai/subagent_started"] !== undefined) {
      if (this.held.size === 0) return false;
      this.ingest(notification);
      for (const [toolCallId, acknowledgement] of this.held) {
        if (this.awaitsNativeStart(toolCallId)) continue;
        this.held.delete(toolCallId);
        this.ingest(acknowledgement);
      }
      return true;
    }
    const toolCallId = typeof update.toolCallId === "string" ? update.toolCallId : undefined;
    if (toolCallId && meta["cognition.ai/inferenceToolName"] === "run_subagent") {
      // Other updates for a held call pass through; completing the card
      // before its start would detach the child again.
      if (
        update.sessionUpdate !== "tool_call_update" ||
        update.status !== "completed" ||
        !this.awaitsNativeStart(toolCallId)
      ) {
        return false;
      }
      this.held.set(toolCallId, notification);
      return true;
    }
    // Child updates and other agents' lifecycle events may interleave with a
    // batch; only lead output ends it.
    if (
      LEAD_OUTPUT.has(String(update.sessionUpdate)) &&
      !Object.keys(meta).some((key) => key.startsWith("cognition.ai/subagent_"))
    ) {
      this.flush();
    }
    return false;
  }

  onTurnEnd(): void {
    // Release after the shared turn bookkeeping that notified this source.
    queueMicrotask(() => this.flush());
  }

  dispose(): void {
    this.held.clear();
  }

  private flush(): void {
    const held = [...this.held.values()];
    this.held.clear();
    for (const acknowledgement of held) this.ingest(acknowledgement);
  }
}

export function attachDevinSubagentLaunchOrder(
  session: AcpStructuredSession,
  awaitsNativeStart: (toolCallId: string) => boolean,
): void {
  session.attachExternalSessionUpdateSource(
    new DevinSubagentLaunchOrder(
      (notification) => session.ingestExternalSessionUpdate(notification),
      awaitsNativeStart,
      () => session.historyReplayActive,
    ),
  );
}
