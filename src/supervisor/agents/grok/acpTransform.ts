import type { SessionNotification } from "@agentclientprotocol/sdk";
import {
  PORACODE_ACP_GOAL_META_KEY,
  PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY,
  type AcpCanonicalGoalUpdate,
} from "../acp/canonicalMapping";
import {
  createAcpSubagentCoordinator,
  normalizeAcpSubagentToolCall,
  withAcpSubagentParent,
  withAcpTopLevelToolCall,
} from "../acp/subagentCoordinator";
import type { AcpSessionUpdateTransform } from "../base";

const GROK_SPAWN_SUBAGENT_TOOL = "spawn_subagent";

export function createGrokAcpSessionUpdateTransform(): AcpSessionUpdateTransform {
  const subagents = createAcpSubagentCoordinator();
  const pendingToolCallIds: string[] = [];
  const childSessionByToolCallId = new Map<string, string>();
  const toolCallIdByChildSession = new Map<string, string>();
  const ignoredChildSessions = new Set<string>();
  const seenGoalIds = new Set<string>();
  let parentSessionId: string | undefined;
  let contentOwnerSessionId: string | undefined;

  return (notification) => {
    const update = plainRecord(notification.update);
    const sessionUpdate = readString(update, "sessionUpdate");

    if (sessionUpdate === "goal_updated") {
      parentSessionId = notification.sessionId;
      const goal = readGrokGoalUpdate(update, seenGoalIds);
      return goal ? withGoalMeta(notification, goal) : asNoop(notification);
    }

    if (sessionUpdate === "subagent_spawned") {
      parentSessionId = readString(update, "parent_session_id") ?? notification.sessionId;
      const childSessionId = readString(update, "child_session_id");
      const toolCallId = findPendingToolCallId(
        pendingToolCallIds,
        subagents,
        readString(update, "description"),
        readString(update, "subagent_type"),
      );
      if (childSessionId && toolCallId) {
        const taskId = readString(update, "subagent_id") ?? childSessionId;
        childSessionByToolCallId.set(toolCallId, childSessionId);
        toolCallIdByChildSession.set(childSessionId, toolCallId);
        subagents.registerBackgroundLaunch({
          sessionId: parentSessionId,
          toolCallId,
          taskId,
        });
      } else if (childSessionId) {
        ignoredChildSessions.add(childSessionId);
      }
      return asNoop(notification);
    }

    if (sessionUpdate === "subagent_finished") {
      const childSessionId = readString(update, "child_session_id");
      const toolCallId = childSessionId ? toolCallIdByChildSession.get(childSessionId) : undefined;
      if (!childSessionId || !toolCallId) return asNoop(notification);

      const descriptor = subagents.getCall(toolCallId);
      if (!descriptor?.background) return asNoop(notification);

      toolCallIdByChildSession.delete(childSessionId);
      childSessionByToolCallId.delete(toolCallId);
      ignoredChildSessions.add(childSessionId);
      const result = readString(update, "output");
      return (
        subagents
          .complete({
            sessionId: parentSessionId ?? notification.sessionId,
            toolCallId,
            status: readGrokSubagentStatus(update),
            ...(result ? { result } : {}),
          })
          .at(-1) ?? asNoop(notification)
      );
    }

    const childToolCallId = toolCallIdByChildSession.get(notification.sessionId);
    if (childToolCallId) {
      const bounded = withContentBoundary(notification, sessionUpdate, contentOwnerSessionId);
      contentOwnerSessionId = bounded.ownerSessionId;
      return withAcpSubagentParent(bounded.notification, childToolCallId);
    }
    if (
      ignoredChildSessions.has(notification.sessionId) ||
      (parentSessionId && notification.sessionId !== parentSessionId)
    ) {
      return asNoop(notification);
    }
    parentSessionId ??= notification.sessionId;

    const bounded = withContentBoundary(notification, sessionUpdate, contentOwnerSessionId);
    contentOwnerSessionId = bounded.ownerSessionId;
    const boundedNotification = bounded.notification;

    if (sessionUpdate !== "tool_call" && sessionUpdate !== "tool_call_update") {
      return boundedNotification;
    }
    const toolCallId = readString(update, "toolCallId");
    if (!toolCallId) return boundedNotification;
    if (isMappedTaskOutput(update, subagents)) return asNoop(notification);
    const metaTool = plainRecord(plainRecord(update._meta)["x.ai/tool"]);
    const isSpawn =
      readString(metaTool, "name") === GROK_SPAWN_SUBAGENT_TOOL ||
      readString(update, "title") === GROK_SPAWN_SUBAGENT_TOOL ||
      subagents.getCall(toolCallId) !== undefined;
    if (!isSpawn) return boundedNotification;

    const descriptor = subagents.updateCall(toolCallId, {
      rawInput: plainRecord(update.rawInput),
    });
    if (!pendingToolCallIds.includes(toolCallId)) pendingToolCallIds.push(toolCallId);
    const terminal = update.status === "completed" || update.status === "failed";
    const backgroundLaunchReceipt = descriptor.background && terminal;
    const normalized = normalizeAcpSubagentToolCall(boundedNotification, {
      rawInput: subagents.canonicalInput(toolCallId),
      detached: descriptor.background,
      keepOpen: backgroundLaunchReceipt,
      ...(backgroundLaunchReceipt ? { omitContent: true, omitRawOutput: true } : {}),
    });

    if (terminal && !backgroundLaunchReceipt) {
      removePendingToolCallId(pendingToolCallIds, toolCallId);
      const childSessionId = childSessionByToolCallId.get(toolCallId);
      if (childSessionId) {
        toolCallIdByChildSession.delete(childSessionId);
        childSessionByToolCallId.delete(toolCallId);
        ignoredChildSessions.add(childSessionId);
      }
      subagents.forgetCall(toolCallId);
    }
    return sessionUpdate === "tool_call" ? withAcpTopLevelToolCall(normalized) : normalized;
  };
}

function isMappedTaskOutput(
  update: Record<string, unknown>,
  subagents: ReturnType<typeof createAcpSubagentCoordinator>,
): boolean {
  const rawInput = plainRecord(update.rawInput);
  const taskIds = readStringArray(rawInput, "task_ids");
  return taskIds.length === 1 && subagents.resolveBackgroundToolCallId(taskIds[0]!) !== undefined;
}

function withContentBoundary(
  notification: SessionNotification,
  sessionUpdate: string | undefined,
  ownerSessionId: string | undefined,
): { notification: SessionNotification; ownerSessionId: string | undefined } {
  if (sessionUpdate !== "agent_message_chunk" && sessionUpdate !== "agent_thought_chunk") {
    return { notification, ownerSessionId };
  }
  if (!ownerSessionId || ownerSessionId === notification.sessionId) {
    return { notification, ownerSessionId: notification.sessionId };
  }
  const update = plainRecord(notification.update);
  return {
    notification: withUpdate(notification, {
      ...update,
      _meta: {
        ...plainRecord(update._meta),
        [PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY]: true,
      },
    }),
    ownerSessionId: notification.sessionId,
  };
}

function readGrokGoalUpdate(
  update: Record<string, unknown>,
  seenGoalIds: Set<string>,
): AcpCanonicalGoalUpdate | undefined {
  const goalId = readString(update, "goal_id");
  const objective = readString(update, "objective")?.trim();
  const rawStatus = readString(update, "status");
  if (rawStatus === "cleared") {
    return { action: "cleared", availableActions: [] };
  }
  if (!goalId || !objective || !rawStatus) return undefined;

  const firstUpdate = !seenGoalIds.has(goalId);
  seenGoalIds.add(goalId);
  const status = mapGrokGoalStatus(rawStatus);
  const lastReason =
    readString(update, "pause_message") ??
    readString(update, "last_event_detail") ??
    readString(update, "last_event");
  const evaluationChecks =
    readNonNegativeInteger(update, "classifier_runs_attempted") ??
    readNonNegativeInteger(update, "total_verify_rounds") ??
    0;
  const tokenBudget = readNullableNonNegativeNumber(update, "token_budget");
  const tokensUsed = readNonNegativeNumber(update, "tokens_used");
  const elapsedMs = readNonNegativeNumber(update, "elapsed_ms");
  return {
    action: firstUpdate ? "set" : "updated",
    objective,
    ...(status ? { status } : {}),
    ...(tokenBudget !== undefined ? { tokenBudget } : {}),
    ...(tokensUsed !== undefined ? { tokensUsed } : {}),
    ...(elapsedMs !== undefined ? { timeUsedSeconds: elapsedMs / 1000 } : {}),
    iterations: evaluationChecks,
    availableActions: grokGoalAvailableActions(rawStatus),
    ...(lastReason ? { lastReason } : {}),
    providerThreadId: goalId,
  };
}

function grokGoalAvailableActions(
  rawStatus: string,
): NonNullable<AcpCanonicalGoalUpdate["availableActions"]> {
  if (rawStatus === "active") return ["pause", "clear"];
  if (isGrokPausedGoalStatus(rawStatus)) {
    return ["resume", "clear"];
  }
  return rawStatus === "cleared" ? [] : ["clear"];
}

function mapGrokGoalStatus(rawStatus: string): AcpCanonicalGoalUpdate["status"] {
  if (rawStatus === "active") return "active";
  if (rawStatus === "budget_limited") return "budget_limited";
  if (rawStatus === "complete") return "complete";
  if (rawStatus === "cleared") return undefined;
  if (isGrokPausedGoalStatus(rawStatus)) {
    return "paused";
  }
  return undefined;
}

function isGrokPausedGoalStatus(rawStatus: string): boolean {
  return (
    rawStatus === "user_paused" ||
    rawStatus === "back_off_paused" ||
    rawStatus === "no_progress_paused" ||
    rawStatus === "infra_paused" ||
    rawStatus === "doom_loop_paused" ||
    rawStatus === "blocked"
  );
}

function readGrokSubagentStatus(
  update: Record<string, unknown>,
): "completed" | "failed" | "cancelled" {
  const status = readString(update, "status");
  return status === "failed" || status === "cancelled" ? status : "completed";
}

function findPendingToolCallId(
  pendingToolCallIds: string[],
  subagents: ReturnType<typeof createAcpSubagentCoordinator>,
  description: string | undefined,
  subagentType: string | undefined,
): string | undefined {
  const matchingIndex = pendingToolCallIds.findIndex((toolCallId) => {
    const descriptor = subagents.getCall(toolCallId);
    return (
      descriptor !== undefined &&
      (!description || descriptor.description === description) &&
      (!subagentType || descriptor.subagentType === subagentType)
    );
  });
  const index =
    matchingIndex >= 0
      ? matchingIndex
      : pendingToolCallIds.findIndex((toolCallId) => subagents.getCall(toolCallId) !== undefined);
  if (index < 0) return undefined;
  return pendingToolCallIds.splice(index, 1)[0];
}

function removePendingToolCallId(pendingToolCallIds: string[], toolCallId: string): void {
  const index = pendingToolCallIds.indexOf(toolCallId);
  if (index >= 0) pendingToolCallIds.splice(index, 1);
}

function withGoalMeta(
  notification: SessionNotification,
  goal: AcpCanonicalGoalUpdate,
): SessionNotification {
  const update = plainRecord(notification.update);
  return withUpdate(notification, {
    ...update,
    _meta: { ...plainRecord(update._meta), [PORACODE_ACP_GOAL_META_KEY]: goal },
  });
}

function asNoop(notification: SessionNotification): SessionNotification {
  return withUpdate(notification, { sessionUpdate: "session_info_update" });
}

function withUpdate(
  notification: SessionNotification,
  update: Record<string, unknown>,
): SessionNotification {
  return { ...notification, update: update as SessionNotification["update"] };
}

function plainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
}

function readNonNegativeNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function readNullableNonNegativeNumber(
  record: Record<string, unknown>,
  key: string,
): number | null | undefined {
  return record[key] === null ? null : readNonNegativeNumber(record, key);
}

function readNonNegativeInteger(record: Record<string, unknown>, key: string): number | undefined {
  const value = readNonNegativeNumber(record, key);
  return value !== undefined && Number.isInteger(value) ? value : undefined;
}
