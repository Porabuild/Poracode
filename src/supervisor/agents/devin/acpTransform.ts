import type { SessionNotification } from "@agentclientprotocol/sdk";
import {
  createAcpSubagentCoordinator,
  normalizeAcpSubagentToolCall,
  withAcpSubagentParent,
  withAcpTopLevelToolCall,
} from "../acp/subagentCoordinator";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) => (typeof value === "string" ? value : undefined);

/** Translate Cognition's separate call IDs and agent IDs at the provider boundary. */
export function createDevinAcpTransform() {
  const subagents = createAcpSubagentCoordinator();
  const pending = new Map<
    string,
    { title?: string; task?: string; profile?: string; background: boolean }
  >();
  const callsByAgent = new Map<string, string>();
  const completed = new Set<string>();
  return (notification: SessionNotification): SessionNotification => {
    const update = notification.update as Record<string, unknown>;
    const meta = record(update._meta);
    const id = text(update.toolCallId);
    const started = record(meta["cognition.ai/subagent_started"]);
    const finished = record(meta["cognition.ai/subagent_completed"]);
    const context = record(meta["cognition.ai/subagent_context"]);
    const parent = text(context.parentAgentId);
    if (id && typeof started.agentId === "string") {
      const matches = [...pending].filter(
        ([, call]) =>
          call.title === started.title &&
          call.task === started.task &&
          call.background === (started.isBackground === true) &&
          call.profile?.replace(/^subagent_/i, "").toLowerCase() ===
            text(started.profile)?.toLowerCase(),
      );
      // Ambiguous native IDs must never attribute one agent's result to another.
      if (matches.length !== 1) return notification;
      const [callId] = matches[0]!;
      pending.delete(callId);
      callsByAgent.set(started.agentId, callId);
      const descriptor = subagents.updateCall(callId, {
        ...(text(started.profile) ? { subagentType: text(started.profile)! } : {}),
        ...(text(started.model) ? { model: text(started.model)! } : {}),
      });
      return normalizeAcpSubagentToolCall(
        {
          ...notification,
          update: { ...notification.update, toolCallId: callId } as SessionNotification["update"],
        },
        {
          rawInput: subagents.canonicalInput(callId),
          detached: descriptor.background,
        },
      );
    }
    if (id && typeof finished.agentId === "string") {
      const callId = callsByAgent.get(finished.agentId);
      if (!callId || completed.has(callId)) return notification;
      completed.add(callId);
      return (
        subagents.complete({
          sessionId: notification.sessionId,
          toolCallId: callId,
          status: finished.success === false ? "failed" : "completed",
          ...(text(finished.summary) ? { result: text(finished.summary)! } : {}),
          synthesizeResultProgress: true,
        })[0] ?? notification
      );
    }
    if (id && meta["cognition.ai/inferenceToolName"] === "run_subagent" && !completed.has(id)) {
      const raw = record(update.rawInput);
      const descriptor = subagents.updateCall(id, {
        rawInput: raw,
        ...(text(raw.profile) ? { subagentType: text(raw.profile)! } : {}),
        ...(text(raw.title) ? { description: text(raw.title)! } : {}),
        ...(text(raw.task) ? { prompt: text(raw.task)! } : {}),
        ...(raw.is_background === true ? { background: true } : {}),
      });
      if (update.sessionUpdate === "tool_call")
        pending.set(id, {
          ...(text(raw.title) ? { title: text(raw.title)! } : {}),
          ...(text(raw.task) ? { task: text(raw.task)! } : {}),
          ...(text(raw.profile) ? { profile: text(raw.profile)! } : {}),
          background: raw.is_background === true,
        });
      const isLaunchAcknowledgement =
        descriptor.background &&
        update.status === "completed" &&
        [...callsByAgent.values()].includes(id);
      // Without a unique native binding, keep the ordinary completion instead
      // of retaining an unresolvable detached task that would strand the turn.
      const normalized = normalizeAcpSubagentToolCall(notification, {
        rawInput: subagents.canonicalInput(id),
        detached: descriptor.background,
        keepOpen: isLaunchAcknowledgement,
        omitContent: isLaunchAcknowledgement,
      });
      const parentCall = parent ? callsByAgent.get(parent) : undefined;
      return parentCall
        ? withAcpSubagentParent(normalized, parentCall)
        : withAcpTopLevelToolCall(normalized);
    }
    const parentCall = parent ? callsByAgent.get(parent) : undefined;
    if (parentCall) return withAcpSubagentParent(notification, parentCall);
    // A foreground read/wait tool is not a child of the most recently launched agent.
    return update.sessionUpdate === "tool_call"
      ? withAcpTopLevelToolCall(notification)
      : notification;
  };
}
