import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeEvent, ToolCallProgress, TurnState } from "@/shared/contracts";
import { readFileChangePath, readStringField } from "../../fileChangeSummary";
import type { ClaudeMapperState } from "../sdkCanonicalMappingState";
import {
  accumulateActiveGoalAssistantSpend,
  applyActiveGoalMessage,
  completeActiveGoalEvents,
  isActiveGoalMessage,
} from "./goal";
import {
  extractCompletedStringFields,
  extractText,
  extractToolResultImages,
  fileChangeMetadataFromToolResult,
  inputFingerprint,
  newItemId,
  readClaudeAssistantMessageId,
  tryParseJsonRecord,
} from "./helpers";
import { applyPlanAggregatorInput, bindTaskCreateResult } from "./planMapping";
import { ASK_USER_QUESTION_TOOL_NAME } from "./questions";
import {
  contextUsageFromCompactionMetadata,
  extractResultErrorMessage,
  mapResultState,
} from "./result";
import {
  applyTaskLifecycle,
  applyTaskNotification,
  applyTaskUpdated,
  mapPermissionDenied,
  registerSubAgentTaskIfNeeded,
} from "./taskLifecycle";
import { completeTextItem, ensureTextItem, closeClaudeOpenItems } from "./textItems";
import { createToolItemState, hasToolCallPayload, isSubAgentToolName } from "./toolClassification";
import { startToolItem, syncSubAgentModelProgress } from "./toolItems";
import { toolPayload } from "./toolPayload";
import { createClaudeUsageSpentEvent, readClaudeAssistantSpendTokens } from "./usageSpent";
import { workflowFromToolUseResult } from "./workflowOutput";

export function readParentToolUseId(message: SDKMessage): string | undefined {
  const value = (message as { parent_tool_use_id?: unknown }).parent_tool_use_id;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function tagParent(
  events: RuntimeEvent[],
  parentItemId: string | undefined,
  state: ClaudeMapperState,
): RuntimeEvent[] {
  if (!parentItemId) return events;
  const parentScopedEvents = events.filter((event) => event.type !== "context.updated");
  let taggedStarts = 0;
  for (let i = 0; i < parentScopedEvents.length; i += 1) {
    const event = parentScopedEvents[i]!;
    if (event.type !== "item.started") continue;
    if ("parentItemId" in event && typeof event.parentItemId === "string") continue;
    parentScopedEvents[i] = { ...event, parentItemId };
    taggedStarts += 1;
  }
  if (taggedStarts === 0) return parentScopedEvents;
  // Bump the sub-agent parent's step counter and emit an `item.updated` on the
  // parent so a closed overlay (which gates child events off IPC for perf)
  // still sees the count tick on the pill.
  const parent = state.toolItemsById.get(parentItemId);
  if (!parent) return parentScopedEvents;
  const prevCount = parent.progress?.stepCount ?? 0;
  const nextProgress: ToolCallProgress = {
    ...(parent.progress ?? {}),
    stepCount: prevCount + taggedStarts,
  };
  parent.progress = nextProgress;
  parentScopedEvents.push({
    type: "item.updated",
    threadId: state.threadId,
    itemId: parent.itemId,
    payload: toolPayload(parent, "running"),
  });
  return parentScopedEvents;
}

interface ClaudeSdkMessageMappingOptions {
  resultState?: TurnState;
}

export function mapClaudeSdkMessage(
  message: SDKMessage,
  state: ClaudeMapperState,
  options?: ClaudeSdkMessageMappingOptions,
): RuntimeEvent[] {
  const events = mapClaudeSdkMessageInner(message, state, options);
  return tagParent(events, readParentToolUseId(message), state);
}

/**
 * Render a sub-agent's forwarded whole `assistant` message as self-contained,
 * already-complete child items. Unlike the main-thread path this never reads or
 * writes `assistantTextItems` / `reasoningItems` / `toolItemsByIndex` (the
 * shared per-index lanes), so a sub-agent block at index 0 can't clobber the
 * main thread's live stream. Tool calls ARE recorded in `toolItemsById` (keyed
 * by their globally-unique tool_use id) so the sub-agent's own tool_result can
 * complete them. The outer `tagParent` stamps `parentItemId` on the emitted
 * `item.started` events and bumps the parent sub-agent's step counter.
 */
function flushSubAgentAssistantMessage(
  message: SDKMessage,
  state: ClaudeMapperState,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [...syncSubAgentModelFromChildAssistant(message, state)];
  const content = (message as { message?: { content?: unknown } }).message?.content;
  if (!Array.isArray(content)) return events;
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const obj = block as Record<string, unknown>;
    if (obj.type === "text" && typeof obj.text === "string" && obj.text.length > 0) {
      const itemId = newItemId("asst");
      events.push({
        type: "item.started",
        threadId: state.threadId,
        itemId,
        itemType: "assistant_message",
      });
      events.push({
        type: "content.delta",
        threadId: state.threadId,
        itemId,
        stream: "assistant_text",
        delta: obj.text,
      });
      events.push({ type: "item.completed", threadId: state.threadId, itemId });
      continue;
    }
    if (obj.type === "thinking") {
      const text = extractText(obj);
      if (text.length === 0) continue;
      const itemId = newItemId("reason");
      events.push({
        type: "item.started",
        threadId: state.threadId,
        itemId,
        itemType: "reasoning",
      });
      events.push({
        type: "content.delta",
        threadId: state.threadId,
        itemId,
        stream: "reasoning_text",
        delta: text,
      });
      events.push({ type: "item.completed", threadId: state.threadId, itemId });
      continue;
    }
    if (obj.type === "tool_use" || obj.type === "server_tool_use" || obj.type === "mcp_tool_use") {
      const toolName = typeof obj.name === "string" ? obj.name : "Tool";
      if (toolName === ASK_USER_QUESTION_TOOL_NAME) continue;
      const input =
        obj.input && typeof obj.input === "object" && !Array.isArray(obj.input)
          ? (obj.input as Record<string, unknown>)
          : {};
      const itemId = typeof obj.id === "string" ? obj.id : newItemId("tool");
      const tool = createToolItemState({ itemId, toolName, input });
      // Plan-aggregator tools inside a sub-agent would pollute the main plan
      // item; skip them (their result is dropped too — they're child-scoped).
      if (tool.planAggregatorRole) continue;
      if (!state.toolItemsById.has(itemId)) state.toolItemsById.set(itemId, tool);
      (state.subAgentChildToolItemIds ??= new Set<string>()).add(itemId);
      events.push({
        type: "item.started",
        threadId: state.threadId,
        itemId: tool.itemId,
        itemType: tool.itemType,
        payload: toolPayload(tool, "running"),
      });
    }
  }
  return events;
}

/**
 * A Task/Agent launch usually omits `model` from its input — the agent
 * definition behind `subagent_type` supplies it — so the collapsed pill can't
 * tell the user which model the subagent runs on. The forwarded child
 * assistant messages carry the resolved model id; fold the first observed one
 * onto the parent tool's progress (an explicit `model` input keeps
 * precedence) so the row shows `Model · tokens` like MCP subagent tiles.
 */
function syncSubAgentModelFromChildAssistant(
  message: SDKMessage,
  state: ClaudeMapperState,
): RuntimeEvent[] {
  const parentToolUseId = readParentToolUseId(message);
  if (!parentToolUseId) return [];
  const tool = state.toolItemsById.get(parentToolUseId);
  if (!tool || !isSubAgentToolName(tool.toolName)) return [];
  if (tool.progress?.model) return [];
  const inner = (message as { message?: unknown }).message;
  if (!inner || typeof inner !== "object") return [];
  const model = readStringField(inner as Record<string, unknown>, "model");
  if (!model) return [];
  tool.progress = { ...tool.progress, model };
  return [
    {
      type: "item.updated",
      threadId: state.threadId,
      itemId: tool.itemId,
      payload: toolPayload(tool, "running"),
    },
  ];
}

function mapClaudeSdkMessageInner(
  message: SDKMessage,
  state: ClaudeMapperState,
  options?: ClaudeSdkMessageMappingOptions,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  // Native /goal Stop-hook verdicts. Typed outside the SDKMessage union but
  // yielded on the same stream.
  if (isActiveGoalMessage(message)) {
    return applyActiveGoalMessage(state, message);
  }
  if (message.type === "stream_event") {
    // Sub-agent partial streams (parent_tool_use_id set) interleave with the
    // main-thread stream but share the same per-block-index lane maps. Their
    // `message_start` would clear the main lane mid-stream and their deltas
    // would append to main-thread items at the same index. Drop them — the
    // sub-agent's forwarded whole assistant/user messages render its child
    // items (see flushSubAgentAssistantMessage), so nothing is lost.
    if (readParentToolUseId(message)) return events;
    const event = message.event as unknown as Record<string, unknown>;
    const type = event.type;
    const index = typeof event.index === "number" ? event.index : 0;

    if (type === "message_start") {
      // Each new assistant message gets its own per-block-index frame. The
      // SDK reuses index 0 for the first text/thinking block of every
      // message; without this reset, a second message (or an SDK retry that
      // re-emits earlier blocks) would see the prior message's completed
      // item at the same slot and produce a second item with duplicate
      // content. Items already emitted to the renderer stay there — only
      // our local index map is cleared.
      state.assistantTextItems.clear();
      state.reasoningItems.clear();
      state.toolItemsByIndex.clear();
      const nextMessageId = readClaudeAssistantMessageId(event.message);
      if (nextMessageId) state.currentAssistantMessageId = nextMessageId;
      else delete state.currentAssistantMessageId;
      return events;
    }

    if (type === "content_block_start") {
      const block = event.content_block as Record<string, unknown> | undefined;
      if (block?.type === "text") {
        const item = ensureTextItem(
          state,
          state.assistantTextItems,
          index,
          "assistant_message",
          events,
        );
        if (!item) return events;
        const text = typeof block.text === "string" ? block.text : "";
        if (text.length > 0) item.fallbackText = text;
        return events;
      }
      if (block?.type === "thinking") {
        ensureTextItem(state, state.reasoningItems, index, "reasoning", events);
        return events;
      }
      if (
        block?.type === "tool_use" ||
        block?.type === "server_tool_use" ||
        block?.type === "mcp_tool_use"
      ) {
        const toolName = typeof block.name === "string" ? block.name : "Tool";
        if (toolName === ASK_USER_QUESTION_TOOL_NAME) return events;
        const input =
          block.input && typeof block.input === "object" && !Array.isArray(block.input)
            ? (block.input as Record<string, unknown>)
            : {};
        const itemId = typeof block.id === "string" ? block.id : newItemId("tool");
        startToolItem(state, createToolItemState({ itemId, toolName, input }), index, events);
        return events;
      }
      return events;
    }

    if (type === "content_block_delta") {
      const delta = event.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta") {
        const text = typeof delta.text === "string" ? delta.text : "";
        if (!text) return events;
        const item = ensureTextItem(
          state,
          state.assistantTextItems,
          index,
          "assistant_message",
          events,
        );
        if (!item) return events;
        item.emittedText = true;
        if (item.messageId) state.streamedAssistantMessageIds.add(item.messageId);
        events.push({
          type: "content.delta",
          threadId: state.threadId,
          itemId: item.itemId,
          stream: "assistant_text",
          delta: text,
        });
        return events;
      }
      if (delta?.type === "thinking_delta") {
        const text = typeof delta.thinking === "string" ? delta.thinking : "";
        if (!text) return events;
        const item = ensureTextItem(state, state.reasoningItems, index, "reasoning", events);
        if (!item) return events;
        item.emittedText = true;
        events.push({
          type: "content.delta",
          threadId: state.threadId,
          itemId: item.itemId,
          stream: "reasoning_text",
          delta: text,
        });
        return events;
      }
      if (delta?.type === "input_json_delta") {
        const tool = state.toolItemsByIndex.get(index);
        const partial = typeof delta.partial_json === "string" ? delta.partial_json : "";
        if (!tool || !partial) return events;
        tool.partialInputJson += partial;
        const parsed = tryParseJsonRecord(tool.partialInputJson);
        // Plan/sub-agent inputs nest path-like keys inside arrays, so partial
        // top-level extraction would catch the wrong values. Wait for full parse.
        const allowPartial =
          tool.itemType !== "plan" && tool.itemType !== "tool_call" && !tool.planAggregatorRole;
        const partialFields =
          !parsed && allowPartial ? extractCompletedStringFields(tool.partialInputJson) : undefined;
        const nextInput = parsed
          ? parsed
          : partialFields && Object.keys(partialFields).length > 0
            ? { ...tool.input, ...partialFields }
            : undefined;
        if (!nextInput) return events;
        const fingerprint = inputFingerprint(nextInput);
        if (!fingerprint || fingerprint === tool.lastInputFingerprint) return events;
        tool.input = nextInput;
        tool.lastInputFingerprint = fingerprint;
        syncSubAgentModelProgress(tool);
        if (tool.planAggregatorRole) {
          events.push(...applyPlanAggregatorInput(state, tool));
          return events;
        }
        events.push({
          type: "item.updated",
          threadId: state.threadId,
          itemId: tool.itemId,
          payload: toolPayload(tool, "running"),
        });
        return events;
      }
      return events;
    }

    if (type === "content_block_stop") {
      const assistant = state.assistantTextItems.get(index);
      if (assistant) completeTextItem(state, assistant, "assistant_text", events);
      const reasoning = state.reasoningItems.get(index);
      if (reasoning) completeTextItem(state, reasoning, "reasoning_text", events);
      return events;
    }
  }

  if (message.type === "assistant") {
    // Per-call spend for EVERY assistant API message — main-thread and
    // sub-agent (parent-attributed) alike — emitted here, exactly once, before
    // either rendering path. Never emitted from task_progress/task_notification
    // or result.usage: those would double-count sidechain calls.
    const usageSpentEvent =
      state.usageScope && readClaudeAssistantSpendTokens(message) !== undefined
        ? createClaudeUsageSpentEvent(state.threadId, message, state.usageScope.sample())
        : undefined;
    // The active goal's running total shares the exact same per-call spend —
    // accumulated here so goal tokens and Profile tokens can never diverge.
    const goalSpendEvent = accumulateActiveGoalAssistantSpend(state, message);
    // Sub-agent (parent-attributed) whole messages must not touch the shared
    // main-lane per-index maps — index 0 of a sub-agent message would collide
    // with the main thread's streaming block at index 0. Emit self-contained,
    // already-complete child items instead (tagParent attaches parentItemId).
    if (readParentToolUseId(message)) {
      const subAgentEvents = flushSubAgentAssistantMessage(message, state);
      return [usageSpentEvent, goalSpendEvent, ...subAgentEvents].filter(
        (event): event is RuntimeEvent => event !== undefined,
      );
    }
    if (usageSpentEvent) events.push(usageSpentEvent);
    if (goalSpendEvent) events.push(goalSpendEvent);
    const messageId = readClaudeAssistantMessageId(message.message);
    const skipTextSnapshot = messageId ? state.streamedAssistantMessageIds.has(messageId) : false;
    const content = (message.message as { content?: unknown }).content;
    if (Array.isArray(content)) {
      for (let blockIndex = 0; blockIndex < content.length; blockIndex += 1) {
        const block = content[blockIndex];
        if (!block || typeof block !== "object") continue;
        const obj = block as Record<string, unknown>;
        if (obj.type === "text" && typeof obj.text === "string" && obj.text.length > 0) {
          if (skipTextSnapshot) continue;
          const existing = state.assistantTextItems.get(blockIndex);
          if (existing?.completed) continue;
          const item = ensureTextItem(
            state,
            state.assistantTextItems,
            blockIndex,
            "assistant_message",
            events,
          );
          if (!item) continue;
          if (!item.emittedText) item.fallbackText = obj.text;
          completeTextItem(state, item, "assistant_text", events);
          continue;
        }
        if (obj.type === "thinking") {
          const text = extractText(obj);
          if (text.length === 0) continue;
          const existing = state.reasoningItems.get(blockIndex);
          if (existing?.completed) continue;
          const item = ensureTextItem(state, state.reasoningItems, blockIndex, "reasoning", events);
          if (!item) continue;
          if (!item.emittedText) item.fallbackText = text;
          completeTextItem(state, item, "reasoning_text", events);
          continue;
        }
        if (
          obj.type === "tool_use" ||
          obj.type === "server_tool_use" ||
          obj.type === "mcp_tool_use"
        ) {
          const toolName = typeof obj.name === "string" ? obj.name : "Tool";
          if (toolName === ASK_USER_QUESTION_TOOL_NAME) continue;
          const input =
            obj.input && typeof obj.input === "object" && !Array.isArray(obj.input)
              ? (obj.input as Record<string, unknown>)
              : {};
          const itemId = typeof obj.id === "string" ? obj.id : newItemId("tool");
          startToolItem(
            state,
            createToolItemState({ itemId, toolName, input }),
            blockIndex,
            events,
          );
        }
      }
    }
    return events;
  }

  if (message.type === "user") {
    const content = (message.message as { content?: unknown }).content;
    if (!Array.isArray(content)) return events;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const obj = block as Record<string, unknown>;
      if (obj.type !== "tool_result") continue;
      const toolUseId = typeof obj.tool_use_id === "string" ? obj.tool_use_id : undefined;
      if (!toolUseId) continue;
      const tool = state.toolItemsById.get(toolUseId);
      if (!tool) continue;
      const text = extractText(obj.content);
      const images = extractToolResultImages(obj.content);
      if (tool.toolName === "Workflow") {
        const workflow = workflowFromToolUseResult(
          (message as { tool_use_result?: unknown }).tool_use_result,
        );
        if (workflow) tool.workflow = workflow;
      }
      if (tool.planAggregatorRole) {
        if (tool.planAggregatorRole === "TaskCreate" && text.length > 0) {
          bindTaskCreateResult(state, tool, text);
        }
        // Aggregated tools don't emit per-call lifecycle events. Drop the
        // tracking entry so the index map stays small.
        state.toolItemsById.delete(toolUseId);
        for (const [idx, value] of state.toolItemsByIndex) {
          if (value.itemId === toolUseId) state.toolItemsByIndex.delete(idx);
        }
        continue;
      }
      // A background subagent's launch tool_result ("Async agent launched…")
      // arrives immediately while the subagent keeps running. Keep the parent
      // tool_call alive (running) instead of completing/deleting it — the
      // authoritative `task_notification` closes it later (applyTaskNotification).
      if (state.activeSubAgentToolToTask?.has(toolUseId)) {
        events.push({
          type: "item.updated",
          threadId: state.threadId,
          itemId: tool.itemId,
          payload: toolPayload(tool, "running"),
        });
        continue;
      }
      const isError = obj.is_error === true;
      if (tool.itemType === "file_change" && !isError) {
        const metadata = fileChangeMetadataFromToolResult(
          (message as { tool_use_result?: unknown }).tool_use_result,
          readFileChangePath(tool.input),
        );
        if (metadata) tool.fileChangeMetadata = metadata;
      }
      const stream =
        tool.itemType === "command_execution"
          ? "command_output"
          : tool.itemType === "file_change"
            ? "file_change_output"
            : undefined;
      if (stream && text.length > 0) {
        events.push({
          type: "content.delta",
          threadId: state.threadId,
          itemId: tool.itemId,
          stream,
          delta: text,
        });
      }
      events.push({
        type: "item.updated",
        threadId: state.threadId,
        itemId: tool.itemId,
        payload:
          hasToolCallPayload(tool.itemType) || tool.itemType === "file_change"
            ? toolPayload(tool, isError ? "error" : "success", text, images)
            : toolPayload(tool, isError ? "error" : "success"),
      });
      events.push({ type: "item.completed", threadId: state.threadId, itemId: tool.itemId });
      state.toolItemsById.delete(toolUseId);
      state.subAgentChildToolItemIds?.delete(toolUseId);
      for (const [idx, value] of state.toolItemsByIndex) {
        if (value.itemId === toolUseId) state.toolItemsByIndex.delete(idx);
      }
    }
    return events;
  }

  if (message.type === "result") {
    const stateValue = options?.resultState ?? mapResultState(message);
    events.push(...closeClaudeOpenItems(state));
    if (stateValue === "failed") {
      const msg = extractResultErrorMessage(message) ?? "Claude turn failed.";
      events.push({ type: "error", threadId: state.threadId, message: msg });
    }
    events.push(...completeActiveGoalEvents(state, stateValue));
    if (state.currentTurnId) {
      events.push({
        type: "turn.completed",
        threadId: state.threadId,
        turnId: state.currentTurnId,
        state: stateValue,
      });
      delete state.currentTurnId;
    }
    return events;
  }

  if (message.type === "system" && message.subtype === "task_started") {
    registerSubAgentTaskIfNeeded(message, state);
    events.push(...applyTaskLifecycle(message, state));
    return events;
  }

  if (message.type === "system" && message.subtype === "task_progress") {
    events.push(...applyTaskLifecycle(message, state));
    return events;
  }

  if (message.type === "system" && message.subtype === "task_updated") {
    events.push(...applyTaskUpdated(message, state));
    return events;
  }

  if (message.type === "system" && message.subtype === "task_notification") {
    events.push(...applyTaskNotification(message, state));
    return events;
  }

  if (message.type === "system" && message.subtype === "permission_denied") {
    return mapPermissionDenied(message, state);
  }

  if (message.type === "system" && message.subtype === "compact_boundary") {
    const existingItemId = state.currentCompactionItemId;
    const itemId = existingItemId ?? newItemId("compact");
    delete state.currentCompactionItemId;
    const metadata = (message as { compact_metadata?: unknown }).compact_metadata;
    const payload = {
      name: "ContextCompaction",
      status: "success" as const,
      ...(metadata && typeof metadata === "object" ? { args: metadata } : {}),
    };
    if (!existingItemId) {
      events.push({
        type: "item.started",
        threadId: state.threadId,
        itemId,
        itemType: "tool_call",
        payload,
      });
    }
    events.push({
      type: "item.completed",
      threadId: state.threadId,
      itemId,
      payload,
    });
    const contextUsage = contextUsageFromCompactionMetadata(state.threadId, metadata);
    if (contextUsage) events.push(contextUsage);
    return events;
  }

  if (message.type === "system" && message.subtype === "local_command_output") {
    const itemId = newItemId("asst");
    events.push({
      type: "item.started",
      threadId: state.threadId,
      itemId,
      itemType: "assistant_message",
    });
    events.push({
      type: "content.delta",
      threadId: state.threadId,
      itemId,
      stream: "assistant_text",
      delta: message.content,
    });
    events.push({ type: "item.completed", threadId: state.threadId, itemId });
  }

  return events;
}
