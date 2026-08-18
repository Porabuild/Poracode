/**
 * Codex app-server notification dispatch → canonical RuntimeEvent[].
 */

import type { RuntimeEvent } from "@/shared/contracts";
import {
  goalPayloadFromProviderState,
  startGoalItemEvents,
  updateGoalItemEvents,
} from "../../goalRuntime";
import {
  canonicalTypeFor,
  type CodexMapperState,
  newItemId,
  normalizeItemType,
  streamForType,
} from "../canonicalMappingState";
import { isNewCodexGoal, readCodexGoal, updateCodexGoalIdentity } from "./goal";
import {
  buildCompletedPayload,
  buildStartedPayload,
  canonicalTypeFromStream,
  contentStreamForMethod,
} from "./payloads";
import {
  type CodexItemPayload,
  extractMessageText,
  readCodexErrorMessage,
  readCodexPlanSteps,
  readItem,
  readItemId,
  readTurnId,
  readTurnState,
} from "./readers";
import { readStringField } from "../../fileChangeSummary";
import { extractCodexFileChangePath, readCommandAggregatedOutput } from "./toolExtraction";
import {
  createCodexContextUsageEvent,
  createCodexTokenUsageEvent,
  createCodexUsageSpentEvent,
  readCodexCumulativeTotalTokens,
} from "./usage";

export interface MapCodexNotificationOptions {
  /**
   * False while another turn on the same Codex thread is still running (the
   * app-server accepts concurrent `turn/start`s, and auto-compaction runs
   * internal turns). A non-settling `turn/completed` must not purge per-turn
   * mapper state — the live turn's items still resolve through it.
   */
  turnSettled?: boolean;
}

/** Internal Codex item kinds that carry no chat row of their own. */
function isInternalCodexItem(item: unknown): boolean {
  if (!item || typeof item !== "object") return false;
  const kind = normalizeItemType(
    (item as CodexItemPayload).type ?? (item as CodexItemPayload).kind,
  );
  return (
    kind === "context compaction" ||
    kind === "compaction" ||
    kind === "compaction trigger" ||
    kind === "sleep"
  );
}

export function mapCodexNotification(
  method: string,
  params: Record<string, unknown> | undefined,
  state: CodexMapperState,
  wslDistro?: string,
  options?: MapCodexNotificationOptions,
): RuntimeEvent[] {
  const { threadId } = state;

  if (method === "thread/tokenUsage/updated") {
    const usageEvent = createCodexTokenUsageEvent(threadId, params);
    const events: RuntimeEvent[] = usageEvent ? [usageEvent] : [];
    // Ledger spend sample alongside the dock's context.updated: the dock keeps
    // the per-call `last` occupancy, the ledger consumes the cumulative total.
    const scope = state.usageScope;
    if (scope) {
      const counter = readCodexCumulativeTotalTokens(params);
      if (counter !== undefined) {
        const spentEvent = createCodexUsageSpentEvent(threadId, params, scope.sample(counter));
        if (spentEvent) events.push(spentEvent);
      }
    }
    return events;
  }

  if (method === "turn/started") {
    const turnId = readTurnId(params) ?? `t-${Date.now()}`;
    state.currentTurnId = turnId;
    return [{ type: "turn.started", threadId, turnId }];
  }

  // `turn/aborted` is a legacy-only compatibility path; 0.144.5 reports
  // interruption through `turn/completed` with `turn.status: "interrupted"`.
  if (method === "turn/completed" || method === "turn/aborted") {
    const turnSettled = options?.turnSettled !== false;
    const events: RuntimeEvent[] = [];
    const usageEvent = createCodexContextUsageEvent(threadId, params);
    if (usageEvent) events.push(usageEvent);
    if (state.openAssistantItemId) {
      events.push({
        type: "item.completed",
        threadId,
        itemId: state.openAssistantItemId,
      });
      delete state.openAssistantItemId;
    }
    if (state.turnPlanItemId) {
      events.push({
        type: "item.completed",
        threadId,
        itemId: state.turnPlanItemId,
      });
      delete state.turnPlanItemId;
    }
    // Report the completing notification's own turn id — with concurrent turns
    // the server's completion order need not match `currentTurnId`.
    const turnId = readTurnId(params) ?? state.currentTurnId ?? `t-${Date.now()}`;
    const turnState = readTurnState(method, params);
    const errorMessage = turnState === "failed" ? readCodexErrorMessage(params) : undefined;
    if (errorMessage) {
      events.push({ type: "error", threadId, message: errorMessage });
    }
    events.push({
      type: "turn.completed",
      threadId,
      turnId,
      state: turnState,
    });
    if (turnSettled) {
      delete state.currentTurnId;
      // Unified exec commands can keep running after the model turn finishes.
      // Preserve those mappings so late output and completion notifications
      // continue updating the original row instead of opening a blank command.
      for (const [codexItemId, itemType] of state.itemTypeMap) {
        if (itemType === "command_execution") continue;
        state.itemIdMap.delete(codexItemId);
        state.itemTypeMap.delete(codexItemId);
      }
      state.fileChangeOutputMap.clear();
      state.fileChangePathMap.clear();
      state.reasoningSummaryIndexMap.clear();
    }
    return events;
  }

  // `thread/error` is legacy-only; current app-server errors use `error`.
  if (method === "thread/error" || method === "error") {
    const message = readCodexErrorMessage(params) ?? "Codex thread error";
    return method === "error" && params?.willRetry === true
      ? [{ type: "warning", threadId, message }]
      : [{ type: "error", threadId, message }];
  }

  if (method === "serverRequest/resolved") {
    const requestId =
      typeof params?.requestId === "string" || typeof params?.requestId === "number"
        ? String(params.requestId)
        : undefined;
    return requestId
      ? [{ type: "request.resolved", threadId, requestId, outcome: "answered" }]
      : [];
  }

  if (method === "turn/plan/updated") {
    const steps = readCodexPlanSteps(params);
    if (steps.length === 0) return [];
    if (!state.turnPlanItemId) {
      state.turnPlanItemId = newItemId("plan");
      return [
        {
          type: "item.started",
          threadId,
          itemId: state.turnPlanItemId,
          itemType: "plan",
          payload: { steps },
        },
      ];
    }
    return [
      {
        type: "item.updated",
        threadId,
        itemId: state.turnPlanItemId,
        payload: { steps },
      },
    ];
  }

  if (method === "thread/goal/updated") {
    const goal = readCodexGoal(params);
    if (!goal) return [];
    if (!state.goalItemId || isNewCodexGoal(goal, state)) {
      state.goalItemId = newItemId("goal");
      updateCodexGoalIdentity(goal, state);
      const payload = goalPayloadFromProviderState(
        goal,
        goal.status === "active" ? "set" : "updated",
      );
      return startGoalItemEvents(threadId, state.goalItemId, payload);
    }
    updateCodexGoalIdentity(goal, state);
    const payload = goalPayloadFromProviderState(goal, "updated");
    return updateGoalItemEvents(threadId, state.goalItemId, payload);
  }

  if (method === "thread/goal/cleared") {
    const existingGoalItemId = state.goalItemId;
    const goalItemId = existingGoalItemId ?? newItemId("goal");
    const payload = goalPayloadFromProviderState(
      {
        ...(params && typeof params.threadId === "string"
          ? { providerThreadId: params.threadId }
          : {}),
      },
      "cleared",
    );
    delete state.goalItemId;
    delete state.goalCreatedAt;
    delete state.goalObjective;
    if (existingGoalItemId) return updateGoalItemEvents(threadId, goalItemId, payload);
    return startGoalItemEvents(threadId, goalItemId, payload);
  }

  if (method === "item/started") {
    const item = readItem(params);
    const codexItemId = readItemId(params, item);
    if (!item || !codexItemId) return [];
    // Internal lifecycle items (auto-compaction, `clock.sleep`) render no row
    // and must not occupy per-item mapper state.
    if (isInternalCodexItem(item)) return [];
    if (state.itemIdMap.has(codexItemId)) return [];
    const itemType = canonicalTypeFor(item.type ?? item.kind);
    // `CodexStructuredSession.startTurn` emits the user bubble before `turn/start`;
    // Codex echoes a user item here too — skip to avoid duplicate rows.
    if (itemType === "user_message") return [];
    const internalId = newItemId(itemType);
    state.itemIdMap.set(codexItemId, internalId);
    state.itemTypeMap.set(codexItemId, itemType);
    if (itemType === "assistant_message") state.openAssistantItemId = internalId;
    const events: RuntimeEvent[] = [
      {
        type: "item.started",
        threadId,
        itemId: internalId,
        itemType,
        payload: buildStartedPayload(itemType, item),
      },
    ];
    const initialText = extractMessageText(item);
    const stream = streamForType(itemType);
    if (initialText.length > 0 && stream) {
      events.push({
        type: "content.delta",
        threadId,
        itemId: internalId,
        stream,
        delta: initialText,
      });
    }
    return events;
  }

  if (method === "item/completed") {
    const item = readItem(params);
    const codexItemId = readItemId(params, item);
    if (!item || !codexItemId) return [];
    // Same internal lifecycle items as `item/started` — skip without
    // synthesizing a row (the completed-without-started path would otherwise
    // recreate one).
    if (isInternalCodexItem(item)) return [];
    const internalId = state.itemIdMap.get(codexItemId);
    if (!internalId) {
      // Item completed without us seeing started — synthesize both so the chat
      // doesn't lose the message.
      const itemType = canonicalTypeFor(item.type ?? item.kind);
      if (itemType === "user_message") return [];
      const fresh = newItemId(itemType);
      state.itemIdMap.set(codexItemId, fresh);
      state.itemTypeMap.set(codexItemId, itemType);
      const events: RuntimeEvent[] = [
        {
          type: "item.started",
          threadId,
          itemId: fresh,
          itemType,
          payload: buildStartedPayload(itemType, item),
        },
      ];
      const finalText = extractMessageText(item);
      const stream = streamForType(itemType);
      if (finalText.length > 0 && stream) {
        events.push({
          type: "content.delta",
          threadId,
          itemId: fresh,
          stream,
          delta: finalText,
        });
      }
      const aggregatedCommandOutput = readCommandAggregatedOutput(itemType, item);
      if (aggregatedCommandOutput) {
        events.push({
          type: "content.delta",
          threadId,
          itemId: fresh,
          stream: "command_output",
          delta: aggregatedCommandOutput,
        });
      }
      const completedPayload = buildCompletedPayload(itemType, item, wslDistro);
      events.push({
        type: "item.completed",
        threadId,
        itemId: fresh,
        ...(completedPayload ? { payload: completedPayload } : {}),
      });
      state.itemIdMap.delete(codexItemId);
      state.itemTypeMap.delete(codexItemId);
      state.commandOutputSeenSet.delete(codexItemId);
      state.fileChangeOutputMap.delete(codexItemId);
      state.fileChangePathMap.delete(codexItemId);
      state.reasoningSummaryIndexMap.delete(codexItemId);
      return events;
    }
    const itemType = state.itemTypeMap.get(codexItemId) ?? canonicalTypeFor(item.type ?? item.kind);
    state.itemIdMap.delete(codexItemId);
    state.itemTypeMap.delete(codexItemId);
    if (state.openAssistantItemId === internalId) delete state.openAssistantItemId;
    const events: RuntimeEvent[] = [];
    if (itemType === "assistant_message" || itemType === "user_message") {
      const finalText = extractMessageText(item);
      if (finalText.length > 0) {
        events.push({
          type: "item.updated",
          threadId,
          itemId: internalId,
          payload: { content: [{ kind: "text", text: finalText }] },
        });
      }
    }
    const aggregatedCommandOutput = state.commandOutputSeenSet.has(codexItemId)
      ? undefined
      : readCommandAggregatedOutput(itemType, item);
    if (aggregatedCommandOutput) {
      events.push({
        type: "content.delta",
        threadId,
        itemId: internalId,
        stream: "command_output",
        delta: aggregatedCommandOutput,
      });
    }
    const completedPayload = buildCompletedPayload(itemType, item, wslDistro);
    events.push({
      type: "item.completed",
      threadId,
      itemId: internalId,
      ...(completedPayload ? { payload: completedPayload } : {}),
    });
    state.commandOutputSeenSet.delete(codexItemId);
    state.fileChangeOutputMap.delete(codexItemId);
    state.fileChangePathMap.delete(codexItemId);
    state.reasoningSummaryIndexMap.delete(codexItemId);
    return events;
  }

  // Streaming deltas: item/<kind>/<event> with `delta` at top level.
  const stream = contentStreamForMethod(method);
  if (stream) {
    const delta = typeof params?.delta === "string" ? params.delta : "";
    if (!delta) return [];
    const codexItemId = readItemId(params);
    if (!codexItemId) return [];
    let contentDelta = delta;
    const summaryIndex = params?.summaryIndex;
    if (method === "item/reasoning/summaryTextDelta" && typeof summaryIndex === "number") {
      const previousIndex = state.reasoningSummaryIndexMap.get(codexItemId);
      if (previousIndex !== summaryIndex) {
        if (previousIndex !== undefined) contentDelta = `\n\n${delta}`;
        state.reasoningSummaryIndexMap.set(codexItemId, summaryIndex);
      }
    }
    let internalId = state.itemIdMap.get(codexItemId);
    const opened: RuntimeEvent[] = [];
    if (!internalId) {
      const itemType = canonicalTypeFromStream(stream);
      internalId = newItemId(itemType);
      state.itemIdMap.set(codexItemId, internalId);
      state.itemTypeMap.set(codexItemId, itemType);
      if (itemType === "assistant_message") state.openAssistantItemId = internalId;
      opened.push({
        type: "item.started",
        threadId,
        itemId: internalId,
        itemType,
        payload: buildStartedPayload(itemType, {}),
      });
    }
    if (stream === "file_change_output") {
      const text = (state.fileChangeOutputMap.get(codexItemId) ?? "") + delta;
      state.fileChangeOutputMap.set(codexItemId, text);
      const path = extractCodexFileChangePath(text);
      if (path && state.fileChangePathMap.get(codexItemId) !== path) {
        state.fileChangePathMap.set(codexItemId, path);
        opened.push({
          type: "item.updated",
          threadId,
          itemId: internalId,
          payload: { path },
        });
      }
    } else if (stream === "command_output") {
      state.commandOutputSeenSet.add(codexItemId);
    }
    return [
      ...opened,
      {
        type: "content.delta",
        threadId,
        itemId: internalId,
        stream,
        delta: contentDelta,
      },
    ];
  }

  if (method === "item/mcpToolCall/progress") {
    const codexItemId = readItemId(params);
    const internalId = codexItemId ? state.itemIdMap.get(codexItemId) : undefined;
    const message = readStringField(params, "message");
    if (!internalId || !message) return [];
    return [
      {
        type: "item.updated",
        threadId,
        itemId: internalId,
        payload: {
          status: "running",
          progress: { summary: message },
        },
      },
    ];
  }

  return [];
}
