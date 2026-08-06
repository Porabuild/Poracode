/**
 * Cursor SDK → canonical RuntimeEvent mapper.
 *
 * Cursor exposes the same interaction through two streams:
 *
 * - `onDelta` provides live token/tool updates.
 * - `run.stream()` provides normalized, durable SDKMessage events.
 *
 * Raw deltas are authoritative when both are connected. In SDK 1.0.24, each
 * normalized assistant/thinking message echoes one raw update; FIFO
 * reconciliation keeps that second delivery from repainting the same content.
 * The normalized stream also works alone as a stable fallback.
 */

import type { RuntimeEvent } from "@/shared/contracts";
import { newItemId } from "../contextUsage";
import type { CursorSdkMapperState } from "./sdkCanonicalMappingState";
import {
  closeCursorSdkToolItems,
  mapCursorSdkAssistantToolUse,
  mapCursorSdkNestedTaskUpdate,
  mapCursorSdkNormalizedToolCall,
  mapCursorSdkRawToolUpdate,
  mapCursorSdkShellOutputDelta,
} from "./sdkCanonicalToolMapping";
import { normalizeCursorSdkUsage } from "./sdkCanonicalToolPayload";
import type {
  CursorSdkAssistantMessage,
  CursorSdkInteractionUpdate,
  CursorSdkMessage,
  CursorSdkRunResult,
  CursorSdkTokenUsage,
} from "./sdkProtocol";

export { createCursorSdkMapperState, type CursorSdkMapperState } from "./sdkCanonicalMappingState";
export { classifyCursorSdkTool } from "./sdkCanonicalToolMapping";

/**
 * Establish a Poracode user turn before `agent.send()`.
 *
 * The session owns the optimistic user bubble. Supplying its id tells the
 * mapper that raw/normalized Cursor echoes are acknowledgements, not new chat
 * items.
 */
export function startCursorSdkTurn(
  state: CursorSdkMapperState,
  turnId: string,
  optimisticUserItemId?: string,
): RuntimeEvent[] {
  const events = closeCursorSdkOpenItems(state);
  state.currentTurnId = turnId;
  delete state.currentRunId;
  delete state.model;
  state.userEchoSeen = false;
  state.assistantOutputSeen = false;
  if (optimisticUserItemId) {
    state.optimisticUserItemId = optimisticUserItemId;
  } else {
    delete state.optimisticUserItemId;
  }
  state.completedToolKeys.clear();
  state.pendingRawAssistantDeltas.length = 0;
  state.pendingRawThinkingDeltas.length = 0;
  state.pendingRawThinkingCompletions.length = 0;
  state.pendingRawTaskTexts.length = 0;
  state.pendingRawUsageFingerprints.length = 0;
  state.pendingNormalizedUsageFingerprints.length = 0;
  state.usageSequence = 0;
  state.emittedErrors.clear();
  events.push({ type: "turn.started", threadId: state.threadId, turnId });
  return events;
}

export function mapCursorSdkMessage(
  message: CursorSdkMessage,
  state: CursorSdkMapperState,
): RuntimeEvent[] {
  state.agentId = message.agent_id;
  state.currentRunId = message.run_id;

  switch (message.type) {
    case "system": {
      if (message.model?.id) state.model = message.model.id;
      if (state.sessionStarted) return [];
      state.sessionStarted = true;
      return [
        {
          type: "session.started",
          threadId: state.threadId,
          ...(state.currentTurnId ? { turnId: state.currentTurnId } : {}),
        },
      ];
    }
    case "user":
      return mapUserEcho(message.message.content.map((block) => block.text).join(""), state);
    case "assistant":
      return mapAssistantMessage(message, state);
    case "thinking":
      return mapNormalizedThinking(state, message.text, message.thinking_duration_ms);
    case "tool_call": {
      const events = closeTopLevelTextForStep(state);
      events.push(...mapCursorSdkNormalizedToolCall(message, state));
      return events;
    }
    case "status":
      if (message.status === "FINISHED") {
        return finishCursorSdkRun(state, message.run_id, "completed");
      }
      if (message.status === "CANCELLED") {
        return finishCursorSdkRun(state, message.run_id, "cancelled");
      }
      if (message.status === "ERROR" || message.status === "EXPIRED") {
        return finishCursorSdkRun(
          state,
          message.run_id,
          "failed",
          message.message ?? message.status,
        );
      }
      return [];
    case "task":
      if (message.text && consumeQueuedText(state.pendingRawTaskTexts, message.text)) return [];
      return mapTaskMessage(state, message.status, message.text);
    case "request":
      // @cursor/sdk 1.0.24 exposes neither request details nor a response
      // method. Opening a canonical request would strand the UI forever.
      return [];
    case "usage": {
      const events = closeTopLevelTextForStep(state);
      events.push(...mapUsage(state, message.usage, "normalized"));
      return events;
    }
  }
}

export function mapCursorSdkInteractionUpdate(
  update: CursorSdkInteractionUpdate,
  state: CursorSdkMapperState,
): RuntimeEvent[] {
  switch (update.type) {
    case "text-delta":
      return appendTopLevelTextDelta(state, "assistant", update.text);
    case "thinking-delta":
      return appendTopLevelTextDelta(state, "thinking", update.text);
    case "thinking-completed":
      return closeTopLevelThinking(state, update.thinkingDurationMs, true);
    case "tool-call-started":
    case "partial-tool-call": {
      const events = closeTopLevelTextForStep(state);
      events.push(...mapCursorSdkRawToolUpdate(state, update.callId, update.toolCall, false));
      return events;
    }
    case "tool-call-completed":
      return mapCursorSdkRawToolUpdate(state, update.callId, update.toolCall, true);
    case "tool-call-delta":
      return mapCursorSdkNestedTaskUpdate(state, update.callId, update.taskUpdate);
    case "token-delta":
      // Token deltas are generation progress, not final usage and not
      // context-window occupancy. `turn-ended`/`usage` are authoritative.
      return [];
    case "step-started":
    case "step-completed":
      return closeTopLevelTextForStep(state);
    case "turn-ended": {
      const events = closeTopLevelTextForStep(state);
      if (update.usage) events.push(...mapUsage(state, update.usage, "raw"));
      return events;
    }
    case "user-message-appended":
      return mapUserEcho(update.userMessage.text, state);
    case "summary-started":
      return ensureSummaryItem(state);
    case "summary":
      state.pendingRawTaskTexts.push(update.summary);
      return updateSummaryItem(state, update.summary);
    case "summary-completed":
      return completeSummaryItem(state);
    case "shell-output-delta":
      return mapCursorSdkShellOutputDelta(state, update.event);
  }
}

export function mapCursorSdkRunResult(
  result: CursorSdkRunResult,
  state: CursorSdkMapperState,
): RuntimeEvent[] {
  state.currentRunId = result.id;
  if (result.model?.id) state.model = result.model.id;
  const events: RuntimeEvent[] = [];
  if (
    result.status === "finished" &&
    result.result &&
    !state.assistantOutputSeen &&
    !state.terminalRunIds.has(result.id)
  ) {
    events.push(...appendTopLevelTextDelta(state, "assistant", result.result, false));
    closeTextItem(state, "assistant", events);
  }
  // `RunResult.usage` is cumulative across its SDK turns. Only use it when no
  // per-turn usage event reached us, otherwise it would double-count spend.
  if (result.usage && state.usageSequence === 0) {
    events.push(...mapUsage(state, result.usage, "normalized"));
  }
  if (result.status === "finished") {
    events.push(...finishCursorSdkRun(state, result.id, "completed"));
  } else if (result.status === "cancelled") {
    events.push(...finishCursorSdkRun(state, result.id, "cancelled"));
  } else {
    events.push(
      ...finishCursorSdkRun(
        state,
        result.id,
        "failed",
        result.error?.message ?? result.error?.code ?? result.status,
      ),
    );
  }
  return events;
}

/**
 * Complete all mapper-owned items. Safe to call repeatedly during disposal,
 * rollback, or before a new turn.
 */
export function closeCursorSdkOpenItems(state: CursorSdkMapperState): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  closeTextItem(state, "assistant", events);
  closeTextItem(state, "thinking", events);
  closeTextItem(state, "summary", events);
  closeTextItem(state, "task", events);
  events.push(...closeCursorSdkToolItems(state));
  return events;
}

function mapAssistantMessage(
  message: CursorSdkAssistantMessage,
  state: CursorSdkMapperState,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  for (const block of message.message.content) {
    if (block.type === "text") {
      if (
        block.text.length > 0 &&
        !consumeQueuedText(state.pendingRawAssistantDeltas, block.text)
      ) {
        events.push(...appendTopLevelTextDelta(state, "assistant", block.text, false));
      }
    } else {
      events.push(...closeTopLevelTextForStep(state));
      events.push(...mapCursorSdkAssistantToolUse(state, block.id, block.name, block.input));
    }
  }
  return events;
}

function mapNormalizedThinking(
  state: CursorSdkMapperState,
  text: string,
  durationMs?: number,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  if (text.length > 0 && !consumeQueuedText(state.pendingRawThinkingDeltas, text)) {
    events.push(...appendTopLevelTextDelta(state, "thinking", text, false));
  }
  if (durationMs !== undefined) {
    const rawCompletionIndex = state.pendingRawThinkingCompletions.indexOf(durationMs);
    if (rawCompletionIndex >= 0) {
      state.pendingRawThinkingCompletions.splice(rawCompletionIndex, 1);
    } else {
      events.push(...closeTopLevelThinking(state, durationMs, false));
    }
  }
  return events;
}

function appendTopLevelTextDelta(
  state: CursorSdkMapperState,
  kind: "assistant" | "thinking",
  delta: string,
  recordRawEcho = true,
): RuntimeEvent[] {
  if (delta.length === 0) return [];
  if (recordRawEcho) {
    const pending =
      kind === "assistant" ? state.pendingRawAssistantDeltas : state.pendingRawThinkingDeltas;
    pending.push(delta);
  }
  if (kind === "assistant") state.assistantOutputSeen = true;
  const events: RuntimeEvent[] = [];
  let item = kind === "assistant" ? state.assistantItem : state.thinkingItem;
  if (!item) {
    item = { itemId: newItemId(kind === "assistant" ? "asst" : "reason"), text: "" };
    if (kind === "assistant") state.assistantItem = item;
    else state.thinkingItem = item;
    events.push({
      type: "item.started",
      threadId: state.threadId,
      itemId: item.itemId,
      itemType: kind === "assistant" ? "assistant_message" : "reasoning",
    });
  }
  item.text += delta;
  events.push({
    type: "content.delta",
    threadId: state.threadId,
    itemId: item.itemId,
    stream: kind === "assistant" ? "assistant_text" : "reasoning_text",
    delta,
  });
  return events;
}

function closeTopLevelThinking(
  state: CursorSdkMapperState,
  durationMs: number,
  recordRawEcho: boolean,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  if (recordRawEcho) state.pendingRawThinkingCompletions.push(durationMs);
  const item = state.thinkingItem;
  if (item) {
    events.push({
      type: "item.updated",
      threadId: state.threadId,
      itemId: item.itemId,
      payload: { summary: item.text, durationMs },
    });
  }
  closeTextItem(state, "thinking", events);
  return events;
}

function closeTopLevelTextForStep(state: CursorSdkMapperState): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  closeTextItem(state, "assistant", events);
  closeTextItem(state, "thinking", events);
  return events;
}

function closeTextItem(
  state: CursorSdkMapperState,
  kind: "assistant" | "thinking" | "summary" | "task",
  events: RuntimeEvent[],
): void {
  const item =
    kind === "assistant"
      ? state.assistantItem
      : kind === "thinking"
        ? state.thinkingItem
        : kind === "summary"
          ? state.summaryItem
          : state.taskItem;
  if (!item) return;
  events.push({ type: "item.completed", threadId: state.threadId, itemId: item.itemId });
  if (kind === "assistant") delete state.assistantItem;
  else if (kind === "thinking") delete state.thinkingItem;
  else if (kind === "summary") delete state.summaryItem;
  else delete state.taskItem;
}

function mapUserEcho(text: string, state: CursorSdkMapperState): RuntimeEvent[] {
  if (state.userEchoSeen) return [];
  state.userEchoSeen = true;
  if (state.optimisticUserItemId) return [];
  const itemId = newItemId("user");
  return [
    {
      type: "item.started",
      threadId: state.threadId,
      itemId,
      itemType: "user_message",
      payload: { content: [{ kind: "text", text }] },
    },
    { type: "item.completed", threadId: state.threadId, itemId },
  ];
}

function ensureSummaryItem(state: CursorSdkMapperState): RuntimeEvent[] {
  if (state.summaryItem) return [];
  const itemId = newItemId("summary");
  state.summaryItem = { itemId, text: "" };
  return [
    {
      type: "item.started",
      threadId: state.threadId,
      itemId,
      itemType: "reasoning",
      payload: { summary: "" },
    },
  ];
}

function updateSummaryItem(state: CursorSdkMapperState, summary: string): RuntimeEvent[] {
  const events = ensureSummaryItem(state);
  const item = state.summaryItem!;
  if (item.text === summary) return events;
  item.text = summary;
  events.push({
    type: "item.updated",
    threadId: state.threadId,
    itemId: item.itemId,
    payload: { summary },
  });
  return events;
}

function completeSummaryItem(state: CursorSdkMapperState): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  closeTextItem(state, "summary", events);
  return events;
}

function mapTaskMessage(
  state: CursorSdkMapperState,
  status: string | undefined,
  text: string | undefined,
): RuntimeEvent[] {
  if (!text && !status) return [];
  const events: RuntimeEvent[] = [];
  if (!state.taskItem) {
    const itemId = newItemId("task-status");
    state.taskItem = { itemId, text: "" };
    events.push({
      type: "item.started",
      threadId: state.threadId,
      itemId,
      itemType: "reasoning",
    });
  }
  const item = state.taskItem;
  const summary = text ?? status!;
  if (item.text !== summary) {
    item.text = summary;
    events.push({
      type: "item.updated",
      threadId: state.threadId,
      itemId: item.itemId,
      payload: { summary },
    });
  }
  if (status && /^(?:complete|completed|finished|success|error|failed|cancelled)$/i.test(status)) {
    closeTextItem(state, "task", events);
  }
  return events;
}

function mapUsage(
  state: CursorSdkMapperState,
  usage: CursorSdkTokenUsage | Omit<CursorSdkTokenUsage, "totalTokens">,
  source: "raw" | "normalized",
): RuntimeEvent[] {
  const normalized = normalizeCursorSdkUsage(usage);
  const fingerprint = usageFingerprint(normalized);
  // Each source waits for its counterpart's identical delivery: a match cancels
  // the queued peer entry, otherwise this delivery queues for its own echo.
  const [peerQueue, ownQueue] =
    source === "normalized"
      ? [state.pendingRawUsageFingerprints, state.pendingNormalizedUsageFingerprints]
      : [state.pendingNormalizedUsageFingerprints, state.pendingRawUsageFingerprints];
  const matchingPeer = peerQueue.indexOf(fingerprint);
  if (matchingPeer >= 0) {
    peerQueue.splice(matchingPeer, 1);
    return [];
  }
  ownQueue.push(fingerprint);

  state.usageSequence += 1;
  const runId = state.currentRunId ?? state.currentTurnId ?? state.threadId;
  const sampleId = `${runId}:turn-${state.usageSequence}`;
  // Cursor documents this as per-turn spend, which can aggregate several
  // model/tool-loop calls. It is not current context-window occupancy, so the
  // exact mapping is `usage.spent` only.
  return [
    {
      type: "usage.spent",
      threadId: state.threadId,
      usage: {
        counterKind: "per-call",
        counter: normalized.totalTokens,
        scopeId: state.agentId ?? runId,
        epoch: 0,
        sampleId,
        ...(state.currentTurnId ? { turnId: state.currentTurnId } : {}),
        occurredAt: Date.now(),
        ...(state.model ? { model: state.model } : {}),
      },
    },
  ];
}

function finishCursorSdkRun(
  state: CursorSdkMapperState,
  runId: string,
  turnState: "completed" | "failed" | "cancelled",
  errorMessage?: string,
): RuntimeEvent[] {
  if (state.terminalRunIds.has(runId)) return [];
  state.terminalRunIds.add(runId);
  const events = closeCursorSdkOpenItems(state);
  if (errorMessage && !state.emittedErrors.has(errorMessage)) {
    state.emittedErrors.add(errorMessage);
    events.push({ type: "error", threadId: state.threadId, message: errorMessage });
  }
  events.push({
    type: "turn.completed",
    threadId: state.threadId,
    turnId: state.currentTurnId ?? runId,
    state: turnState,
  });
  return events;
}

function usageFingerprint(usage: ReturnType<typeof normalizeCursorSdkUsage>): string {
  return [
    usage.inputTokens,
    usage.outputTokens,
    usage.cacheReadTokens,
    usage.cacheWriteTokens,
    usage.reasoningTokens ?? "",
    usage.totalTokens,
  ].join(":");
}

/**
 * Consume a normalized stream chunk from the FIFO raw-delta queue.
 *
 * Current SDK versions emit one normalized message per raw update, but this
 * also tolerates batching/splitting so a future transport optimization does
 * not re-paint text that already arrived through `onDelta`.
 */
function consumeQueuedText(queue: string[], text: string): boolean {
  if (text.length === 0 || queue.length === 0) return false;
  const next = [...queue];
  let remaining = text;
  while (remaining.length > 0) {
    const head = next[0];
    if (head === undefined) return false;
    if (remaining.startsWith(head)) {
      next.shift();
      remaining = remaining.slice(head.length);
      continue;
    }
    if (head.startsWith(remaining)) {
      next[0] = head.slice(remaining.length);
      remaining = "";
      break;
    }
    return false;
  }
  queue.splice(0, queue.length, ...next);
  return true;
}
